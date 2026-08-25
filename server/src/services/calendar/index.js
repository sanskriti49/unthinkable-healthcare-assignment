import { prisma } from '../../db.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { formatForHumans } from '../../lib/time.js';
import { createEvent, updateEvent, deleteEvent } from './google.js';

const log = logger('calendar:sync');

/**
 * Appointment ⇄ Google Calendar synchronisation.
 *
 * Both parties get their own event in their own calendar, because they connect
 * independently — a doctor may be connected while the patient is not, and the
 * appointment must work either way. Event ids are stored per party so an
 * update or delete touches exactly the events that exist.
 *
 * Calendar sync never runs on the request path; it is always a job, so a Google
 * outage delays events rather than failing a booking.
 */

function buildEvent({ appointment, forRole }) {
  const doctorName = appointment.doctor.user.fullName;
  const patientName = appointment.patient.fullName;
  const isDoctor = forRole === 'DOCTOR';

  const summary = isDoctor
    ? `Consultation — ${patientName}`
    : `Appointment — Dr ${doctorName} (${appointment.doctor.specialisation})`;

  const descriptionLines = isDoctor
    ? [
        `Patient: ${patientName}`,
        appointment.symptoms ? `Reported symptoms: ${appointment.symptoms}` : null,
        `Booked via the clinic portal.`,
        `${env.appUrl}/doctor/appointments/${appointment.id}`,
      ]
    : [
        `Doctor: Dr ${doctorName}`,
        `Specialisation: ${appointment.doctor.specialisation}`,
        appointment.doctor.roomNumber ? `Room: ${appointment.doctor.roomNumber}` : null,
        'Please arrive 10 minutes early.',
        `${env.appUrl}/patient/appointments/${appointment.id}`,
      ];

  return {
    summary,
    description: descriptionLines.filter(Boolean).join('\n'),
    location: appointment.doctor.roomNumber ? `Room ${appointment.doctor.roomNumber}` : undefined,
    start: { dateTime: appointment.startsAt.toISOString(), timeZone: env.clinicTimezone },
    end: { dateTime: appointment.endsAt.toISOString(), timeZone: env.clinicTimezone },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 24 * 60 },
      ],
    },
  };
}

async function loadAppointment(appointmentId) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { id: true, fullName: true, email: true } },
      doctor: {
        select: {
          specialisation: true,
          roomNumber: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
      },
    },
  });
}

/**
 * Create or refresh calendar events for an appointment.
 * Called on booking confirmation and after a reschedule.
 */
export async function syncAppointment(appointmentId) {
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) throw new Error(`Appointment ${appointmentId} not found`);

  if (!env.google.enabled) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { calendarSyncStatus: 'NOT_CONFIGURED', calendarSyncError: null },
    });
    log.debug('Google Calendar not configured — sync skipped', { appointmentId });
    return { status: 'NOT_CONFIGURED' };
  }

  // A cancelled appointment reaching this job (e.g. cancelled while queued)
  // should have its events removed, not created.
  if (['CANCELLED', 'EXPIRED'].includes(appointment.status)) {
    return removeAppointmentEvents(appointmentId);
  }

  const patientUserId = appointment.patient.id;
  const doctorUserId = appointment.doctor.user.id;

  const results = { patient: null, doctor: null };
  const errors = [];

  for (const [role, userId, existingId, field] of [
    ['PATIENT', patientUserId, appointment.patientCalendarEventId, 'patientCalendarEventId'],
    ['DOCTOR', doctorUserId, appointment.doctorCalendarEventId, 'doctorCalendarEventId'],
  ]) {
    try {
      const body = buildEvent({ appointment, forRole: role });
      const eventId = existingId
        ? // patch returns null if the event vanished — recreate in that case
          (await updateEvent(userId, existingId, body)) ?? (await createEvent(userId, body))
        : await createEvent(userId, body);
      results[role.toLowerCase()] = eventId;
      if (eventId !== existingId) {
        await prisma.appointment.update({ where: { id: appointmentId }, data: { [field]: eventId } });
      }
    } catch (err) {
      errors.push(`${role}: ${err.message}`);
    }
  }

  const anySynced = Boolean(results.patient || results.doctor);
  const status = errors.length > 0 ? 'FAILED' : anySynced ? 'SYNCED' : 'NOT_CONFIGURED';

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { calendarSyncStatus: status, calendarSyncError: errors.join('; ') || null },
  });

  // Surfacing the error lets the job queue retry with backoff.
  if (errors.length > 0) throw new Error(`Calendar sync failed — ${errors.join('; ')}`);

  log.info('calendar sync complete', { appointmentId, status, ...results });
  return { status, ...results };
}

/** Remove both parties' events. Used on cancellation. */
export async function removeAppointmentEvents(appointmentId) {
  const appointment = await loadAppointment(appointmentId);
  if (!appointment) return { status: 'NOT_CONFIGURED' };
  if (!env.google.enabled) return { status: 'NOT_CONFIGURED' };

  const errors = [];
  const clears = {};

  if (appointment.patientCalendarEventId) {
    try {
      await deleteEvent(appointment.patient.id, appointment.patientCalendarEventId);
      clears.patientCalendarEventId = null;
    } catch (err) {
      errors.push(`PATIENT: ${err.message}`);
    }
  }
  if (appointment.doctorCalendarEventId) {
    try {
      await deleteEvent(appointment.doctor.user.id, appointment.doctorCalendarEventId);
      clears.doctorCalendarEventId = null;
    } catch (err) {
      errors.push(`DOCTOR: ${err.message}`);
    }
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      ...clears,
      calendarSyncStatus: errors.length ? 'FAILED' : 'NOT_CONFIGURED',
      calendarSyncError: errors.join('; ') || null,
    },
  });

  if (errors.length > 0) throw new Error(`Calendar cleanup failed — ${errors.join('; ')}`);
  log.info('calendar events removed', { appointmentId });
  return { status: 'REMOVED' };
}

export { buildConsentUrl, completeOAuth, isConnected, disconnect } from './google.js';

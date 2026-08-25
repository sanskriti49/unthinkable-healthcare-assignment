import { prisma } from '../db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { dateOnlyToUtcMidnight, localDateKey, parseDateOnly, zonedTimeToUtc } from '../lib/time.js';
import { cancelAppointment, nextAvailableSlots } from './booking.js';
import { queueEmail } from './email/index.js';
import { enqueue, JobType } from './queue.js';

const log = logger('leave');

/**
 * Doctor leave, and the conflict it creates with existing bookings.
 *
 * The interesting case is marking leave for a date that already has patients on
 * it. Three things have to happen, and the order matters:
 *
 *  1. The leave is recorded, so no *new* booking can land on that date. This
 *     goes first — otherwise a patient could book into the date while we are
 *     busy cancelling the ones already there.
 *  2. Every affected appointment is cancelled with an explicit DOCTOR_LEAVE
 *     reason, so the patient's history says why.
 *  3. Each affected patient is notified with concrete alternative slots.
 *
 * Steps 1 and 2 share a transaction. Step 3's emails are queued inside it too,
 * so a mail outage delays the notification but can never lose it — a silent
 * cancellation is the worst possible outcome here.
 */

/**
 * Appointments that would be disrupted by leave on `dateKey`.
 * Exposed separately so the UI can warn the doctor *before* they confirm.
 */
export async function findAffectedAppointments({ doctorId, dateKey }) {
  const parsed = parseDateOnly(dateKey);
  if (!parsed) throw badRequest('INVALID_DATE', 'date must be YYYY-MM-DD');

  // The clinic-local day, expressed as a UTC instant range.
  const dayStart = zonedTimeToUtc(parsed.year, parsed.month, parsed.day, 0, 0, env.clinicTimezone);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  return prisma.appointment.findMany({
    where: {
      doctorId,
      startsAt: { gte: dayStart, lt: dayEnd },
      status: { in: ['HELD', 'BOOKED'] },
    },
    include: {
      patient: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { startsAt: 'asc' },
  });
}

/**
 * Mark a doctor on leave for a date, cancelling and notifying any bookings.
 *
 * @param {object} opts
 * @param {string} opts.doctorId
 * @param {string} opts.dateKey  "YYYY-MM-DD"
 * @param {string} [opts.reason]
 * @param {string} opts.actorUserId
 * @param {boolean} [opts.force] proceed even though appointments exist.
 *        Without it, a date with bookings is refused with 409 and the list of
 *        affected patients, so leave is never destructive by accident.
 */
export async function markLeave({ doctorId, dateKey, reason, actorUserId, force = false }) {
  const parsed = parseDateOnly(dateKey);
  if (!parsed) throw badRequest('INVALID_DATE', 'date must be YYYY-MM-DD');

  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: { user: { select: { fullName: true, email: true } } },
  });
  if (!doctor) throw notFound('Doctor');

  const existing = await prisma.doctorLeave.findFirst({
    where: { doctorId, date: dateOnlyToUtcMidnight(dateKey) },
  });
  if (existing) throw conflict('ALREADY_ON_LEAVE', 'Leave is already recorded for that date');

  const affected = await findAffectedAppointments({ doctorId, dateKey });

  if (affected.length > 0 && !force) {
    throw conflict(
      'LEAVE_HAS_CONFLICTS',
      `${affected.length} appointment(s) are booked on that date. Confirm to cancel and notify those patients.`,
      {
        date: dateKey,
        appointments: affected.map((a) => ({
          id: a.id,
          startsAt: a.startsAt.toISOString(),
          patientName: a.patient.fullName,
          status: a.status,
        })),
      }
    );
  }

  // Step 1 — record the leave so the date closes immediately.
  const leave = await prisma.doctorLeave.create({
    data: { doctorId, date: dateOnlyToUtcMidnight(dateKey), reason: reason ?? null },
  });

  if (affected.length === 0) {
    log.info('leave recorded', { doctorId, dateKey, affected: 0 });
    return { leave, cancelled: 0, notified: 0 };
  }

  // Alternatives are computed once, from the day after the leave, and offered
  // to every affected patient. They are a convenience, not a reservation —
  // whoever clicks first still goes through the normal booking path.
  const alternatives = await nextAvailableSlots({
    doctorId,
    limit: 3,
    fromDate: new Date(Date.parse(`${dateKey}T00:00:00Z`) + 86_400_000),
  });

  // Step 2 + 3 — cancel each appointment and notify its patient.
  let cancelled = 0;
  let notified = 0;
  for (const appointment of affected) {
    try {
      await cancelAppointment({
        appointmentId: appointment.id,
        actorUserId,
        cancelledBy: 'DOCTOR',
        reason: 'DOCTOR_LEAVE',
        note: reason ?? 'Doctor on leave',
        // Suppress the generic cancellation email — the leave-specific one
        // below is more useful, and two emails about one event is noise.
        notify: false,
      });
      cancelled += 1;

      await queueEmail({
        to: appointment.patient.email,
        template: 'doctor_leave_cancellation',
        appointmentId: appointment.id,
        priority: 3, // ahead of routine mail — the patient may be travelling to us
        data: {
          patientName: appointment.patient.fullName,
          doctorName: doctor.user.fullName,
          startsAt: appointment.startsAt,
          reason: reason ?? 'Doctor on leave',
          alternatives,
          rebookUrl: `${env.appUrl}/patient/doctors/${doctorId}`,
        },
      });
      notified += 1;
    } catch (err) {
      // One patient's failure must not strand the rest. The leave is already
      // recorded, so the worst case is a stale appointment we log loudly about.
      log.error('failed to cancel appointment for leave', {
        appointmentId: appointment.id,
        doctorId,
        dateKey,
        error: err.message,
      });
    }
  }

  // Tell the doctor what was done on their behalf.
  await queueEmail({
    to: doctor.user.email,
    template: 'appointment_cancelled',
    data: {
      recipientName: `Dr ${doctor.user.fullName}`,
      otherPartyName: `${cancelled} patient(s)`,
      startsAt: zonedTimeToUtc(parsed.year, parsed.month, parsed.day, 9, 0, env.clinicTimezone),
      reason: `Leave recorded for ${dateKey} — ${cancelled} appointment(s) cancelled and patients notified`,
    },
  });

  log.info('leave recorded with cancellations', { doctorId, dateKey, cancelled, notified });
  return { leave, cancelled, notified, alternatives };
}

/**
 * Remove a leave day. Appointments cancelled because of it are *not*
 * resurrected — those patients have been told it is cancelled and may have
 * rebooked elsewhere. The slots simply become available again.
 */
export async function cancelLeave({ doctorId, leaveId }) {
  const leave = await prisma.doctorLeave.findFirst({ where: { id: leaveId, doctorId } });
  if (!leave) throw notFound('Leave');
  await prisma.doctorLeave.delete({ where: { id: leaveId } });
  log.info('leave removed', { doctorId, leaveId, date: localDateKey(new Date(leave.date), 'UTC') });
  return leave;
}

export async function listLeave({ doctorId, from, to }) {
  return prisma.doctorLeave.findMany({
    where: {
      doctorId,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: dateOnlyToUtcMidnight(from) } : {}),
              ...(to ? { lte: dateOnlyToUtcMidnight(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: 'asc' },
  });
}

import { randomBytes, createHash } from 'node:crypto';
import { prisma, isSlotConflict, isPatientDoubleBooking } from '../db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { addMinutes, formatForHumans } from '../lib/time.js';
import { assertSlotIsValid, nextAvailableSlots } from './slots.js';
import { queueEmail, cancelPendingEmails } from './email/index.js';
import { enqueue, JobType } from './queue.js';

const log = logger('booking');

/**
 * The booking engine.
 *
 * Preventing double-booking is a three-layer story, and each layer exists
 * because the one below it is insufficient on its own:
 *
 *  1. **A Postgres advisory transaction lock keyed on (doctor, slot).**
 *     Concurrent attempts on the *same* slot are serialised, so they queue
 *     rather than collide. Attempts on different slots never contend, so this
 *     costs nothing in the common case. The lock is released automatically when
 *     the transaction ends — including on crash — so a dead request cannot
 *     wedge a slot.
 *
 *  2. **A re-check inside the transaction.** Availability shown in the UI is a
 *     snapshot that may be seconds stale; the authoritative check happens here,
 *     under the lock, against committed state.
 *
 *  3. **A partial unique index** (`appointment_active_slot_uniq`). This is the
 *     one that actually makes the guarantee. Layers 1 and 2 are application
 *     logic and could be bypassed by a bug, a second API deployment, a direct
 *     SQL insert, or a future code path that forgets the lock. The index is
 *     enforced by the database for every writer, and turns a lost race into a
 *     clean 23505 that we translate into a 409.
 *
 * The hold mechanism layers on top: a HELD row occupies the slot for a short
 * TTL while the patient fills in their symptoms, then converts to BOOKED.
 */

/** Stable 64-bit key for the advisory lock, derived from doctor + slot. */
function slotLockKey(doctorId, startsAt) {
  const digest = createHash('sha1').update(`${doctorId}:${startsAt.toISOString()}`).digest();
  // Postgres advisory locks take a signed bigint; take 8 bytes and clamp.
  return digest.readBigInt64BE(0);
}

/**
 * Take the advisory lock for a slot inside the current transaction.
 * Waits for any other transaction holding it, then proceeds.
 */
async function lockSlot(tx, doctorId, startsAt) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${slotLockKey(doctorId, startsAt)}::bigint)`;
}

/**
 * Reap holds on this slot that have expired.
 *
 * Doing this *inside the booking transaction*, under the slot lock, is what
 * makes hold expiry deterministic. If we relied only on the sweeper job, a
 * patient could be told "slot taken" for up to a sweep interval after the hold
 * actually lapsed. Here, the moment a hold's TTL passes, the next booker
 * clears it and takes the slot.
 */
async function expireStaleHolds(tx, doctorId, startsAt, now) {
  const { count } = await tx.appointment.updateMany({
    where: { doctorId, startsAt, status: 'HELD', holdExpiresAt: { lte: now } },
    data: {
      status: 'EXPIRED',
      holdExpiresAt: null,
      holdToken: null,
      cancelledAt: now,
      cancelledBy: 'SYSTEM',
      cancelReason: 'HOLD_EXPIRED',
    },
  });
  if (count > 0) log.debug('expired stale holds', { doctorId, startsAt, count });
  return count;
}

async function loadDoctorForBooking(tx, doctorId) {
  const doctor = await tx.doctorProfile.findUnique({
    where: { id: doctorId },
    include: {
      workingHours: true,
      user: { select: { id: true, fullName: true, email: true, isActive: true } },
    },
  });
  if (!doctor || !doctor.user.isActive) throw notFound('Doctor');
  return doctor;
}

/**
 * Reserve a slot for a short window without confirming it.
 *
 * @returns {Promise<{appointmentId, holdToken, holdExpiresAt, startsAt, endsAt}>}
 */
export async function holdSlot({ doctorId, patientId, startsAt }) {
  const slotStart = new Date(startsAt);
  if (Number.isNaN(slotStart.getTime())) {
    throw badRequest('INVALID_START', 'startsAt must be a valid ISO timestamp');
  }

  const now = new Date();
  const holdToken = randomBytes(24).toString('base64url');
  const holdExpiresAt = addMinutes(now, env.booking.holdTtlMinutes);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Layer 1 — serialise everyone competing for this exact slot.
      await lockSlot(tx, doctorId, slotStart);
      await expireStaleHolds(tx, doctorId, slotStart, now);

      const doctor = await loadDoctorForBooking(tx, doctorId);
      const { endsAt } = await assertSlotIsValid({ doctor, startsAt: slotStart, tx, now });

      // Layer 2 — authoritative availability check under the lock.
      const taken = await tx.appointment.findFirst({
        where: {
          doctorId,
          startsAt: slotStart,
          OR: [
            { status: { in: ['BOOKED', 'COMPLETED'] } },
            { status: 'HELD', holdExpiresAt: { gt: now } },
          ],
        },
        select: { id: true, status: true, patientId: true },
      });
      if (taken) {
        throw conflict(
          'SLOT_TAKEN',
          taken.patientId === patientId
            ? 'You already have this slot reserved'
            : 'Someone just took that slot — please pick another'
        );
      }

      // A patient must not hold two appointments at the same instant.
      const clash = await tx.appointment.findFirst({
        where: {
          patientId,
          startsAt: slotStart,
          OR: [
            { status: { in: ['BOOKED', 'COMPLETED'] } },
            { status: 'HELD', holdExpiresAt: { gt: now } },
          ],
        },
        select: { id: true },
      });
      if (clash) {
        throw conflict('PATIENT_DOUBLE_BOOKED', 'You already have another appointment at that time');
      }

      // Layer 3 — the unique index has the final say on this insert.
      const appointment = await tx.appointment.create({
        data: {
          doctorId,
          patientId,
          startsAt: slotStart,
          endsAt,
          status: 'HELD',
          holdExpiresAt,
          holdToken,
        },
        select: { id: true, startsAt: true, endsAt: true, holdExpiresAt: true },
      });

      // Sweeper backstop, in case the patient abandons the flow entirely.
      await enqueue({
        type: JobType.EXPIRE_HOLDS,
        payload: { appointmentId: appointment.id },
        runAt: addMinutes(holdExpiresAt, 1),
        maxAttempts: 3,
        tx,
      });

      return appointment;
    });

    log.info('slot held', { appointmentId: result.id, doctorId, patientId });
    return { ...result, holdToken };
  } catch (err) {
    // The index caught a race that slipped past the checks above.
    if (isSlotConflict(err)) {
      throw conflict('SLOT_TAKEN', 'Someone just took that slot — please pick another');
    }
    if (isPatientDoubleBooking(err)) {
      throw conflict('PATIENT_DOUBLE_BOOKED', 'You already have another appointment at that time');
    }
    throw err;
  }
}

/**
 * Confirm a held slot, capturing the patient's symptoms.
 *
 * Everything that follows a confirmed booking — emails to both parties, the
 * pre-visit LLM summary, the calendar events, the reminder — is enqueued in
 * this same transaction. Either the appointment is BOOKED and all of its
 * follow-up work is queued, or neither happened.
 */
export async function confirmHold({ appointmentId, holdToken, patientId, symptoms, patientNotes }) {
  const now = new Date();

  const appointment = await prisma.$transaction(async (tx) => {
    const held = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { id: true, fullName: true, email: true } },
        doctor: {
          select: {
            id: true,
            specialisation: true,
            roomNumber: true,
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });

    if (!held) throw notFound('Appointment');
    if (held.patientId !== patientId) throw forbidden('This hold belongs to another patient');

    if (held.status === 'BOOKED') {
      // Idempotent: a double-submitted confirm returns the same booking.
      return held;
    }
    if (held.status !== 'HELD') {
      throw conflict('HOLD_NOT_ACTIVE', `This reservation is ${held.status.toLowerCase()} and cannot be confirmed`);
    }
    if (held.holdToken && holdToken && held.holdToken !== holdToken) {
      throw forbidden('Invalid hold token');
    }
    if (held.holdExpiresAt && held.holdExpiresAt <= now) {
      throw conflict('HOLD_EXPIRED', 'Your reservation expired — please pick a slot again');
    }

    const confirmed = await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'BOOKED',
        holdExpiresAt: null,
        holdToken: null,
        symptoms: symptoms ?? null,
        patientNotes: patientNotes ?? null,
        calendarSyncStatus: env.google.enabled ? 'PENDING' : 'NOT_CONFIGURED',
      },
    });

    await queueFollowUpWork({ tx, appointment: { ...held, ...confirmed } });
    return { ...held, ...confirmed };
  });

  log.info('appointment confirmed', { appointmentId, patientId });
  return appointment;
}

/**
 * Queue everything that should happen once an appointment is confirmed.
 * Runs inside the caller's transaction.
 */
async function queueFollowUpWork({ tx, appointment }) {
  const { patient, doctor } = appointment;

  await queueEmail({
    tx,
    to: patient.email,
    template: 'appointment_confirmed_patient',
    appointmentId: appointment.id,
    priority: 1,
    data: {
      patientName: patient.fullName,
      doctorName: doctor.user.fullName,
      specialisation: doctor.specialisation,
      startsAt: appointment.startsAt,
      roomNumber: doctor.roomNumber,
    },
  });

  await queueEmail({
    tx,
    to: doctor.user.email,
    template: 'appointment_confirmed_doctor',
    appointmentId: appointment.id,
    priority: 1,
    data: {
      doctorName: doctor.user.fullName,
      patientName: patient.fullName,
      startsAt: appointment.startsAt,
      symptoms: appointment.symptoms,
    },
  });

  // Reminder, if the appointment is far enough out for one to be useful.
  const remindAt = new Date(
    appointment.startsAt.getTime() - env.booking.reminderLeadHours * 3_600_000
  );
  if (remindAt > new Date()) {
    await queueEmail({
      tx,
      to: patient.email,
      template: 'appointment_reminder',
      appointmentId: appointment.id,
      sendAt: remindAt,
      data: {
        recipientName: patient.fullName,
        otherPartyName: `Dr ${doctor.user.fullName}`,
        startsAt: appointment.startsAt,
        isDoctor: false,
      },
    });
    await queueEmail({
      tx,
      to: doctor.user.email,
      template: 'appointment_reminder',
      appointmentId: appointment.id,
      sendAt: remindAt,
      data: {
        recipientName: `Dr ${doctor.user.fullName}`,
        otherPartyName: patient.fullName,
        startsAt: appointment.startsAt,
        isDoctor: true,
      },
    });
  }

  if (appointment.symptoms?.trim()) {
    await enqueue({
      type: JobType.PRE_VISIT_SUMMARY,
      payload: { appointmentId: appointment.id },
      maxAttempts: 3,
      priority: 2,
      tx,
    });
  }

  if (env.google.enabled) {
    await enqueue({
      type: JobType.CALENDAR_SYNC,
      payload: { appointmentId: appointment.id, action: 'sync' },
      maxAttempts: 4,
      tx,
    });
  }
}

/**
 * Book in a single call — a hold immediately followed by a confirm.
 * Used when the client already has the symptom text (and by the tests).
 */
export async function bookDirect({ doctorId, patientId, startsAt, symptoms, patientNotes }) {
  const held = await holdSlot({ doctorId, patientId, startsAt });
  return confirmHold({
    appointmentId: held.id,
    holdToken: held.holdToken,
    patientId,
    symptoms,
    patientNotes,
  });
}

/** Cancel an appointment and clean up everything queued for it. */
export async function cancelAppointment({
  appointmentId,
  actorUserId,
  cancelledBy,
  reason = 'PATIENT_REQUEST',
  note,
  notify = true,
}) {
  const result = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { id: true, fullName: true, email: true } },
        doctor: {
          select: { id: true, user: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });
    if (!appointment) throw notFound('Appointment');

    if (['CANCELLED', 'EXPIRED'].includes(appointment.status)) return { appointment, alreadyCancelled: true };
    if (appointment.status === 'COMPLETED') {
      throw conflict('ALREADY_COMPLETED', 'A completed appointment cannot be cancelled');
    }

    const updated = await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELLED',
        holdExpiresAt: null,
        holdToken: null,
        cancelledAt: new Date(),
        cancelledBy,
        cancelReason: reason,
        cancelNote: note ?? null,
      },
    });

    // Stop the reminder that is already sitting in the queue.
    await cancelPendingEmails({ appointmentId, templates: ['appointment_reminder'], tx });

    if (notify) {
      const reasonText =
        reason === 'DOCTOR_LEAVE'
          ? 'The doctor is unavailable on this date'
          : reason === 'RESCHEDULED'
            ? 'Moved to a new time'
            : (note ?? 'Cancelled on request');

      await queueEmail({
        tx,
        to: appointment.patient.email,
        template: 'appointment_cancelled',
        appointmentId,
        priority: 1,
        data: {
          recipientName: appointment.patient.fullName,
          otherPartyName: `Dr ${appointment.doctor.user.fullName}`,
          startsAt: appointment.startsAt,
          reason: reasonText,
          rebookUrl: `${env.appUrl}/patient/doctors/${appointment.doctorId}`,
        },
      });

      await queueEmail({
        tx,
        to: appointment.doctor.user.email,
        template: 'appointment_cancelled',
        appointmentId,
        priority: 1,
        data: {
          recipientName: `Dr ${appointment.doctor.user.fullName}`,
          otherPartyName: appointment.patient.fullName,
          startsAt: appointment.startsAt,
          reason: reasonText,
        },
      });
    }

    if (env.google.enabled && (appointment.patientCalendarEventId || appointment.doctorCalendarEventId)) {
      await enqueue({
        type: JobType.CALENDAR_SYNC,
        payload: { appointmentId, action: 'remove' },
        maxAttempts: 4,
        tx,
      });
    }

    return { appointment: updated, alreadyCancelled: false };
  });

  if (!result.alreadyCancelled) {
    log.info('appointment cancelled', { appointmentId, cancelledBy, reason, actorUserId });
  }
  return result.appointment;
}

/**
 * Move an appointment to a new slot.
 *
 * Implemented as *book-then-cancel*, in that order and in one transaction: the
 * new slot is claimed under its own advisory lock before the old one is
 * released. Cancelling first would open a window where the patient has given up
 * their slot and the new one turns out to be gone.
 */
export async function rescheduleAppointment({ appointmentId, patientId, newStartsAt, actorRole = 'PATIENT' }) {
  const slotStart = new Date(newStartsAt);
  if (Number.isNaN(slotStart.getTime())) {
    throw badRequest('INVALID_START', 'newStartsAt must be a valid ISO timestamp');
  }
  const now = new Date();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const original = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          patient: { select: { id: true, fullName: true, email: true } },
          doctor: {
            select: {
              id: true,
              specialisation: true,
              roomNumber: true,
              user: { select: { id: true, fullName: true, email: true } },
            },
          },
        },
      });
      if (!original) throw notFound('Appointment');
      if (patientId && original.patientId !== patientId) {
        throw forbidden('This appointment belongs to another patient');
      }
      if (!['BOOKED', 'HELD'].includes(original.status)) {
        throw conflict('NOT_RESCHEDULABLE', `A ${original.status.toLowerCase()} appointment cannot be moved`);
      }
      if (original.startsAt.getTime() === slotStart.getTime()) {
        throw badRequest('SAME_SLOT', 'That is the appointment\'s current time');
      }

      await lockSlot(tx, original.doctorId, slotStart);
      await expireStaleHolds(tx, original.doctorId, slotStart, now);

      const doctor = await loadDoctorForBooking(tx, original.doctorId);
      const { endsAt } = await assertSlotIsValid({ doctor, startsAt: slotStart, tx, now });

      const taken = await tx.appointment.findFirst({
        where: {
          doctorId: original.doctorId,
          startsAt: slotStart,
          OR: [
            { status: { in: ['BOOKED', 'COMPLETED'] } },
            { status: 'HELD', holdExpiresAt: { gt: now } },
          ],
        },
        select: { id: true },
      });
      if (taken) throw conflict('SLOT_TAKEN', 'Someone just took that slot — please pick another');

      // Release the old slot first *within this transaction* so the patient
      // uniqueness index cannot fire against the appointment being moved.
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'CANCELLED',
          holdExpiresAt: null,
          holdToken: null,
          cancelledAt: now,
          cancelledBy: actorRole,
          cancelReason: 'RESCHEDULED',
        },
      });

      const replacement = await tx.appointment.create({
        data: {
          doctorId: original.doctorId,
          patientId: original.patientId,
          startsAt: slotStart,
          endsAt,
          status: 'BOOKED',
          symptoms: original.symptoms,
          patientNotes: original.patientNotes,
          rescheduledFromId: original.id,
          calendarSyncStatus: env.google.enabled ? 'PENDING' : 'NOT_CONFIGURED',
          // Carry the calendar events over so they are patched, not duplicated.
          patientCalendarEventId: original.patientCalendarEventId,
          doctorCalendarEventId: original.doctorCalendarEventId,
        },
      });

      await tx.appointment.update({
        where: { id: appointmentId },
        data: { patientCalendarEventId: null, doctorCalendarEventId: null },
      });

      await cancelPendingEmails({ appointmentId, templates: ['appointment_reminder'], tx });

      for (const [to, recipientName, otherPartyName] of [
        [original.patient.email, original.patient.fullName, `Dr ${original.doctor.user.fullName}`],
        [original.doctor.user.email, `Dr ${original.doctor.user.fullName}`, original.patient.fullName],
      ]) {
        await queueEmail({
          tx,
          to,
          template: 'appointment_rescheduled',
          appointmentId: replacement.id,
          priority: 1,
          data: {
            recipientName,
            otherPartyName,
            oldStartsAt: original.startsAt,
            newStartsAt: slotStart,
          },
        });
      }

      const remindAt = new Date(slotStart.getTime() - env.booking.reminderLeadHours * 3_600_000);
      if (remindAt > now) {
        await queueEmail({
          tx,
          to: original.patient.email,
          template: 'appointment_reminder',
          appointmentId: replacement.id,
          sendAt: remindAt,
          data: {
            recipientName: original.patient.fullName,
            otherPartyName: `Dr ${original.doctor.user.fullName}`,
            startsAt: slotStart,
            isDoctor: false,
          },
        });
      }

      // The replacement carries the patient's symptoms over, so it needs its
      // own pre-visit summary — the original's belongs to the cancelled row and
      // would otherwise leave the doctor with no triage for a moved patient.
      if (original.symptoms?.trim()) {
        await enqueue({
          type: JobType.PRE_VISIT_SUMMARY,
          payload: { appointmentId: replacement.id },
          maxAttempts: 3,
          priority: 2,
          tx,
        });
      }

      if (env.google.enabled) {
        await enqueue({
          type: JobType.CALENDAR_SYNC,
          payload: { appointmentId: replacement.id, action: 'sync' },
          maxAttempts: 4,
          tx,
        });
      }

      return replacement;
    });

    log.info('appointment rescheduled', { from: appointmentId, to: created.id });
    return created;
  } catch (err) {
    if (isSlotConflict(err)) throw conflict('SLOT_TAKEN', 'Someone just took that slot — please pick another');
    if (isPatientDoubleBooking(err)) {
      throw conflict('PATIENT_DOUBLE_BOOKED', 'You already have another appointment at that time');
    }
    throw err;
  }
}

/** Release a hold the patient abandoned, or that the sweeper found expired. */
export async function releaseHold({ appointmentId, patientId }) {
  const { count } = await prisma.appointment.updateMany({
    where: {
      id: appointmentId,
      status: 'HELD',
      ...(patientId ? { patientId } : {}),
    },
    data: {
      status: 'EXPIRED',
      holdExpiresAt: null,
      holdToken: null,
      cancelledAt: new Date(),
      cancelledBy: patientId ? 'PATIENT' : 'SYSTEM',
      cancelReason: 'HOLD_EXPIRED',
    },
  });
  return count > 0;
}

export { nextAvailableSlots, formatForHumans };

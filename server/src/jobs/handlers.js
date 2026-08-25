import { prisma } from '../db.js';
import { logger } from '../lib/logger.js';
import { JobType } from '../services/queue.js';
import { deliverQueuedEmail, queueEmail } from '../services/email/index.js';
import { generatePreVisitSummary } from '../services/llm/pre-visit.js';
import { generatePostVisitSummary } from '../services/llm/post-visit.js';
import { syncAppointment, removeAppointmentEvents } from '../services/calendar/index.js';

const log = logger('jobs');

/**
 * Job handlers, keyed by type.
 *
 * Contract for every handler:
 *  - **Idempotent.** A job may run twice (worker crash after the side effect,
 *    before the status write), so each handler checks whether its work is
 *    already done.
 *  - **Throws to retry.** Returning normally means success; throwing hands the
 *    job back to the queue for backoff, and eventually the dead-letter table.
 *  - **Returns a small summary object**, which is logged for observability.
 */

export const handlers = {
  /** Deliver one queued email. */
  [JobType.SEND_EMAIL]: async ({ emailLogId }) => {
    if (!emailLogId) throw new Error('send_email job missing emailLogId');
    return deliverQueuedEmail(emailLogId);
  },

  /**
   * Generate the pre-visit summary. Note this handler cannot really "fail" —
   * generatePreVisitSummary falls back internally — so a retry here only
   * happens on a genuine database problem.
   */
  [JobType.PRE_VISIT_SUMMARY]: async ({ appointmentId }) => {
    if (!appointmentId) throw new Error('pre_visit_summary job missing appointmentId');
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true },
    });
    if (!appointment) return { skipped: 'appointment deleted' };
    if (['CANCELLED', 'EXPIRED'].includes(appointment.status)) {
      return { skipped: `appointment ${appointment.status.toLowerCase()}` };
    }
    return generatePreVisitSummary(appointmentId);
  },

  [JobType.POST_VISIT_SUMMARY]: async ({ visitNoteId }) => {
    if (!visitNoteId) throw new Error('post_visit_summary job missing visitNoteId');
    return generatePostVisitSummary(visitNoteId);
  },

  /** Send one medication reminder. */
  [JobType.MEDICATION_REMINDER]: async ({ reminderId }) => {
    const reminder = await prisma.medicationReminder.findUnique({
      where: { id: reminderId },
      include: {
        patient: { select: { email: true, fullName: true } },
        medication: {
          include: {
            visitNote: {
              include: {
                appointment: {
                  include: { doctor: { include: { user: { select: { fullName: true } } } } },
                },
              },
            },
          },
        },
      },
    });

    if (!reminder) return { skipped: 'reminder deleted' };
    if (reminder.cancelledAt) return { skipped: 'reminder cancelled' };
    if (reminder.sentAt) return { skipped: 'already sent' };

    const { medication } = reminder;
    await queueEmail({
      to: reminder.patient.email,
      template: 'medication_reminder',
      priority: 2,
      data: {
        patientName: reminder.patient.fullName,
        medicationName: medication.name,
        dosage: medication.dosage,
        instructions: medication.instructions,
        doctorName: `Dr ${medication.visitNote.appointment.doctor.user.fullName}`,
      },
    });

    await prisma.medicationReminder.update({
      where: { id: reminderId },
      data: { sentAt: new Date() },
    });

    return { queuedFor: reminder.patient.email, medication: medication.name };
  },

  /**
   * Reap an expired hold. This is the backstop; the booking transaction expires
   * stale holds for a slot the moment someone tries to book it, so this mostly
   * tidies up abandoned holds nobody else competed for.
   */
  [JobType.EXPIRE_HOLDS]: async ({ appointmentId }) => {
    const now = new Date();
    if (appointmentId) {
      const { count } = await prisma.appointment.updateMany({
        where: { id: appointmentId, status: 'HELD', holdExpiresAt: { lte: now } },
        data: {
          status: 'EXPIRED',
          holdExpiresAt: null,
          holdToken: null,
          cancelledAt: now,
          cancelledBy: 'SYSTEM',
          cancelReason: 'HOLD_EXPIRED',
        },
      });
      return { expired: count };
    }

    // Sweep mode — catches anything whose per-hold job was lost.
    const { count } = await prisma.appointment.updateMany({
      where: { status: 'HELD', holdExpiresAt: { lte: now } },
      data: {
        status: 'EXPIRED',
        holdExpiresAt: null,
        holdToken: null,
        cancelledAt: now,
        cancelledBy: 'SYSTEM',
        cancelReason: 'HOLD_EXPIRED',
      },
    });
    if (count > 0) log.info('swept expired holds', { count });
    return { expired: count };
  },

  [JobType.CALENDAR_SYNC]: async ({ appointmentId, action }) => {
    if (!appointmentId) throw new Error('calendar_sync job missing appointmentId');
    return action === 'remove' ? removeAppointmentEvents(appointmentId) : syncAppointment(appointmentId);
  },

  /** Standalone appointment reminder — currently routed through send_email. */
  [JobType.APPOINTMENT_REMINDER]: async ({ emailLogId }) => deliverQueuedEmail(emailLogId),
};

export function getHandler(type) {
  const handler = handlers[type];
  if (!handler) throw new Error(`No handler registered for job type "${type}"`);
  return handler;
}

import { prisma } from '../db.js';
import { enqueue, JobType } from './queue.js';
import { env } from '../config/env.js';
import { zonedParts, zonedTimeToUtc, parseTimeOfDay } from '../lib/time.js';
import { logger } from '../lib/logger.js';

const log = logger('medication');

/**
 * Materialise the reminder schedule for a visit's medications.
 *
 * Reminders are expanded up front — one row per dose per day — rather than
 * computed lazily by a recurring scanner. That costs a few rows but buys three
 * things: the patient can *see* their full schedule in the portal, a single
 * dose can be cancelled without unpicking a recurrence rule, and stopping a
 * course is one UPDATE rather than a special case in the scheduler.
 *
 * Doses already in the past (a course starting the morning of an afternoon
 * visit, say) are skipped rather than fired immediately.
 *
 * @returns {Promise<number>} number of reminders scheduled
 */
export async function scheduleMedicationReminders({ visitNote, patientId, from }) {
  const startInstant = from ? new Date(from) : new Date();
  const now = new Date();
  let scheduled = 0;

  for (const medication of visitNote.medications) {
    const times = (medication.timesOfDay ?? [])
      .map((t) => ({ raw: t, minutes: parseTimeOfDay(t) }))
      .filter((t) => t.minutes !== null);

    if (times.length === 0) continue;

    const rows = [];
    for (let dayOffset = 0; dayOffset < medication.durationDays; dayOffset += 1) {
      // Walk forward in clinic-local calendar days so a DST shift does not
      // slide every subsequent dose by an hour.
      const dayAnchor = new Date(startInstant.getTime() + dayOffset * 86_400_000);
      const parts = zonedParts(dayAnchor, env.clinicTimezone);

      for (const { minutes } of times) {
        const at = zonedTimeToUtc(
          parts.year,
          parts.month,
          parts.day,
          Math.floor(minutes / 60),
          minutes % 60,
          env.clinicTimezone
        );
        if (at <= now) continue;
        rows.push({ medicationId: medication.id, patientId, scheduledFor: at });
      }
    }

    if (rows.length === 0) continue;

    // Create reminder rows and their delivery jobs in one transaction, so a
    // crash cannot leave a reminder that will never fire.
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const reminder = await tx.medicationReminder.create({ data: row });
        const job = await enqueue({
          type: JobType.MEDICATION_REMINDER,
          payload: { reminderId: reminder.id },
          runAt: row.scheduledFor,
          maxAttempts: 3,
          tx,
        });
        await tx.medicationReminder.update({ where: { id: reminder.id }, data: { jobId: job.id } });
      }
    });

    scheduled += rows.length;
  }

  log.info('medication reminders scheduled', { visitNoteId: visitNote.id, scheduled });
  return scheduled;
}

/**
 * Stop future reminders for a course — used when a doctor amends or withdraws
 * a prescription. Already-sent reminders are left alone as a record.
 */
export async function cancelRemindersForVisitNote(visitNoteId) {
  const reminders = await prisma.medicationReminder.findMany({
    where: { medication: { visitNoteId }, sentAt: null, cancelledAt: null },
    select: { id: true, jobId: true },
  });
  if (reminders.length === 0) return 0;

  await prisma.$transaction([
    prisma.medicationReminder.updateMany({
      where: { id: { in: reminders.map((r) => r.id) } },
      data: { cancelledAt: new Date() },
    }),
    prisma.job.updateMany({
      where: { id: { in: reminders.map((r) => r.jobId).filter(Boolean) }, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    }),
  ]);

  log.info('medication reminders cancelled', { visitNoteId, count: reminders.length });
  return reminders.length;
}

/** The patient's upcoming doses, for the portal's schedule view. */
export async function upcomingReminders(patientId, { days = 7 } = {}) {
  const until = new Date(Date.now() + days * 86_400_000);
  return prisma.medicationReminder.findMany({
    where: {
      patientId,
      cancelledAt: null,
      scheduledFor: { gte: new Date(), lte: until },
    },
    include: {
      medication: {
        select: { name: true, dosage: true, instructions: true, frequency: true },
      },
    },
    orderBy: { scheduledFor: 'asc' },
  });
}

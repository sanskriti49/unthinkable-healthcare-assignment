import { prisma } from '../../db.js';
import { logger } from '../../lib/logger.js';
import { completeStructured, LlmDisabledError } from './client.js';
import { POST_VISIT_SYSTEM, buildPostVisitUser, postVisitSchema } from './prompts.js';
import { heuristicPostVisit, parsePrescription } from './fallbacks.js';
import { scheduleMedicationReminders } from '../medication.js';
import { queueEmail } from '../email/index.js';
import { env } from '../../config/env.js';

const log = logger('llm:post-visit');

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Guard the model's output before it drives real reminders.
 *
 * Structured outputs guarantee the *shape*; they cannot guarantee that
 * `timesOfDay` holds well-formed clock times or that `durationDays` is sane.
 * Anything that fails these checks is repaired from the deterministic parser
 * rather than trusted, because these values schedule notifications to patients.
 */
function sanitiseMedications(medications, prescriptionText) {
  const fallbackMeds = parsePrescription(prescriptionText);
  const byName = new Map(fallbackMeds.map((m) => [m.name.toLowerCase(), m]));

  return (medications ?? [])
    .map((med) => {
      const name = String(med.name ?? '').trim();
      if (!name) return null;

      const fallback = byName.get(name.toLowerCase());
      let times = (med.timesOfDay ?? []).map((t) => String(t).trim()).filter((t) => TIME_RE.test(t));
      let repaired = false;

      if (times.length === 0) {
        times = fallback?.timesOfDay ?? ['09:00'];
        repaired = true;
      }
      // More than six doses a day is far more likely a model slip than a real
      // prescription; fall back rather than spam the patient.
      if (times.length > 6) {
        times = fallback?.timesOfDay ?? times.slice(0, 4);
        repaired = true;
      }

      let duration = Number(med.durationDays);
      if (!Number.isFinite(duration) || duration < 1 || duration > 180) {
        duration = fallback?.durationDays ?? 1;
        repaired = true;
      }

      return {
        name,
        dosage: med.dosage ? String(med.dosage).trim() : (fallback?.dosage ?? null),
        frequency: med.frequency ? String(med.frequency).trim() : (fallback?.frequency ?? null),
        timesOfDay: [...new Set(times)].sort(),
        durationDays: Math.round(duration),
        instructions: med.instructions ? String(med.instructions).trim() : (fallback?.instructions ?? ''),
        parsedByFallback: repaired,
      };
    })
    .filter(Boolean);
}

/**
 * Generate the patient-facing visit summary and medication schedule, then
 * schedule the medication reminders and email the patient.
 *
 * Like the pre-visit path, this never throws on LLM failure — the patient still
 * receives their doctor's notes and still gets reminders, derived by the
 * deterministic prescription parser.
 */
export async function generatePostVisitSummary(visitNoteId) {
  const note = await prisma.visitNote.findUnique({
    where: { id: visitNoteId },
    include: {
      medications: true,
      appointment: {
        include: {
          patient: { select: { id: true, email: true, fullName: true } },
          doctor: { include: { user: { select: { fullName: true } } } },
        },
      },
    },
  });

  if (!note) throw new Error(`VisitNote ${visitNoteId} not found`);
  if (note.source === 'LLM' && note.medications.length > 0) {
    log.debug('post-visit summary already generated, skipping', { visitNoteId });
    return { source: 'LLM', skipped: true };
  }

  const attempts = note.attempts + 1;
  let result = null;
  let error = null;

  try {
    const { data, model } = await completeStructured({
      purpose: 'post-visit-summary',
      system: POST_VISIT_SYSTEM,
      user: buildPostVisitUser({
        doctorNotes: note.doctorNotes,
        diagnosis: note.diagnosis,
        prescriptionText: note.prescriptionText,
        followUpInDays: note.followUpInDays,
      }),
      schema: postVisitSchema,
    });
    result = { ...data, model };
  } catch (err) {
    error = err;
    if (err instanceof LlmDisabledError) {
      log.debug('LLM disabled — using deterministic post-visit fallback', { visitNoteId });
    } else {
      log.warn('falling back to deterministic post-visit summary', { visitNoteId, error: err.message });
    }
  }

  const usingLlm = Boolean(result);
  const base = usingLlm
    ? result
    : heuristicPostVisit({
        doctorNotes: note.doctorNotes,
        diagnosis: note.diagnosis,
        prescriptionText: note.prescriptionText,
        followUpInDays: note.followUpInDays,
      });

  const medications = usingLlm
    ? sanitiseMedications(result.medications, note.prescriptionText)
    : base.medications;

  // Replace medications wholesale so a regeneration cannot leave orphans, and
  // cancel any reminders already scheduled from the previous attempt.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.medicationReminder.updateMany({
      where: { medication: { visitNoteId }, sentAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    await tx.medication.deleteMany({ where: { visitNoteId } });

    return tx.visitNote.update({
      where: { id: visitNoteId },
      data: {
        patientSummary: base.patientSummary,
        careInstructions: base.careInstructions ?? [],
        warningSigns: base.warningSigns ?? [],
        source: usingLlm ? 'LLM' : 'HEURISTIC',
        model: usingLlm ? result.model : null,
        attempts,
        lastError: error ? String(error.message).slice(0, 1000) : null,
        generatedAt: new Date(),
        medications: {
          create: medications.map((m) => ({
            name: m.name,
            dosage: m.dosage,
            frequency: m.frequency,
            timesOfDay: m.timesOfDay,
            durationDays: m.durationDays,
            instructions: m.instructions,
            parsedByFallback: m.parsedByFallback ?? false,
          })),
        },
      },
      include: { medications: true },
    });
  });

  const reminderCount = await scheduleMedicationReminders({
    visitNote: updated,
    patientId: note.appointment.patient.id,
    from: note.appointment.startsAt,
  });

  await queueEmail({
    to: note.appointment.patient.email,
    template: 'visit_summary_ready',
    appointmentId: note.appointmentId,
    data: {
      patientName: note.appointment.patient.fullName,
      doctorName: note.appointment.doctor.user.fullName,
      visitDate: note.appointment.startsAt,
      summary: base.patientSummary?.slice(0, 400),
      portalUrl: `${env.appUrl}/patient/appointments/${note.appointmentId}`,
    },
  });

  log.info('post-visit summary ready', {
    visitNoteId,
    source: usingLlm ? 'LLM' : 'HEURISTIC',
    medications: updated.medications.length,
    remindersScheduled: reminderCount,
  });

  return {
    source: usingLlm ? 'LLM' : 'HEURISTIC',
    medications: updated.medications.length,
    remindersScheduled: reminderCount,
  };
}

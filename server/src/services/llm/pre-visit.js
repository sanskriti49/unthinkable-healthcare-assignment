import { prisma } from '../../db.js';
import { logger } from '../../lib/logger.js';
import { completeStructured, LlmDisabledError } from './client.js';
import { PRE_VISIT_SYSTEM, buildPreVisitUser, preVisitSchema } from './prompts.js';
import { heuristicTriage } from './fallbacks.js';

const log = logger('llm:pre-visit');

function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return null;
  const ms = Date.now() - new Date(dateOfBirth).getTime();
  const years = Math.floor(ms / (365.25 * 86_400_000));
  return years > 0 && years < 130 ? years : null;
}

/** The model is told to return exactly three; hold it to that either way. */
function normaliseQuestions(questions, fallback) {
  const cleaned = (questions ?? []).map((q) => String(q).trim()).filter(Boolean).slice(0, 3);
  while (cleaned.length < 3 && fallback.length > cleaned.length) {
    cleaned.push(fallback[cleaned.length]);
  }
  return cleaned;
}

/**
 * Generate (or regenerate) the pre-visit summary for an appointment.
 *
 * This function does not throw on LLM failure. It always leaves a usable
 * PreVisitSummary row behind — LLM-generated when possible, heuristic when not —
 * because the doctor needs *something* on screen before the consultation, and a
 * missing summary must never block a booking that already happened.
 *
 * @returns {Promise<{source: 'LLM'|'HEURISTIC', summaryId: string}>}
 */
export async function generatePreVisitSummary(appointmentId) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { dateOfBirth: true, gender: true } },
      doctor: { select: { specialisation: true } },
      preVisitSummary: true,
    },
  });

  if (!appointment) throw new Error(`Appointment ${appointmentId} not found`);

  const rawSymptoms = (appointment.symptoms ?? '').trim();
  const existing = appointment.preVisitSummary;

  // Idempotency: the job may be retried after a partial success.
  if (existing?.source === 'LLM') {
    log.debug('summary already generated, skipping', { appointmentId });
    return { source: 'LLM', summaryId: existing.id, skipped: true };
  }

  const heuristic = heuristicTriage(rawSymptoms);
  const attempts = (existing?.attempts ?? 0) + 1;

  let result = null;
  let error = null;

  if (rawSymptoms.length >= 3) {
    try {
      const { data, model } = await completeStructured({
        purpose: 'pre-visit-summary',
        system: PRE_VISIT_SYSTEM,
        user: buildPreVisitUser({
          symptoms: rawSymptoms,
          patientAge: ageFrom(appointment.patient.dateOfBirth),
          patientGender: appointment.patient.gender,
          specialisation: appointment.doctor.specialisation,
        }),
        schema: preVisitSchema,
      });
      result = { ...data, model };
    } catch (err) {
      error = err;
      if (err instanceof LlmDisabledError) {
        log.debug('LLM disabled — using heuristic triage', { appointmentId });
      } else {
        log.warn('falling back to heuristic triage', { appointmentId, error: err.message });
      }
    }
  }

  const usingLlm = Boolean(result);
  const payload = usingLlm
    ? {
        chiefComplaint: result.chiefComplaint,
        summary: result.summary,
        urgency: result.urgency,
        urgencyRationale: result.urgencyRationale,
        suggestedQuestions: normaliseQuestions(result.suggestedQuestions, heuristic.suggestedQuestions),
        redFlags: result.redFlags ?? [],
        source: 'LLM',
        model: result.model,
      }
    : {
        ...heuristic,
        suggestedQuestions: heuristic.suggestedQuestions,
        source: 'HEURISTIC',
        model: null,
      };

  const record = await prisma.preVisitSummary.upsert({
    where: { appointmentId },
    create: {
      appointmentId,
      rawSymptoms,
      ...payload,
      attempts,
      lastError: error ? String(error.message).slice(0, 1000) : null,
      generatedAt: new Date(),
    },
    update: {
      rawSymptoms,
      ...payload,
      attempts,
      lastError: error ? String(error.message).slice(0, 1000) : null,
      generatedAt: new Date(),
    },
  });

  log.info('pre-visit summary ready', { appointmentId, source: payload.source, urgency: payload.urgency });
  return { source: payload.source, summaryId: record.id };
}

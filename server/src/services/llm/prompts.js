import { z } from 'zod';

/**
 * Prompts and output schemas for the two LLM features.
 *
 * These are kept in one file, separate from the calling code, so they can be
 * reviewed as prose by a clinician and are reproduced verbatim in
 * docs/LLM_PROMPTS.md.
 *
 * Two constraints shape both prompts:
 *
 *  - **Never diagnose.** The model organises what the patient said and flags
 *    urgency; it does not name conditions or recommend treatment. Both system
 *    prompts say so explicitly, and the schemas give the model nowhere to put
 *    a diagnosis even if it tried.
 *  - **Urgency is a triage signal, not a clinical decision.** The rubric is
 *    spelled out so the label means the same thing every time, and the doctor
 *    always sees the patient's own words alongside it.
 */

// ---------------------------------------------------------------------------
// Feature 1 — pre-visit symptom summary
// ---------------------------------------------------------------------------

export const preVisitSchema = z.object({
  chiefComplaint: z
    .string()
    .describe("The single main problem, in under 12 words, in the patient's own terms"),
  summary: z
    .string()
    .describe('A 2-4 sentence factual summary of the reported symptoms for the doctor to skim'),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Triage urgency per the rubric'),
  urgencyRationale: z.string().describe('One sentence explaining the urgency label'),
  suggestedQuestions: z
    .array(z.string())
    .describe('Exactly three questions the doctor should ask to narrow things down'),
  redFlags: z
    .array(z.string())
    .describe('Any reported symptoms that warrant urgent attention; empty array if none'),
});

export const PRE_VISIT_SYSTEM = `You are a clinical intake assistant supporting a licensed doctor before a consultation.

Your job is to organise what the patient wrote so the doctor can absorb it in seconds. You are NOT diagnosing.

Rules:
- Never name a diagnosis, condition, or disease. Describe only what the patient reported.
- Never recommend treatment, medication, or tests.
- Use the patient's own vocabulary where possible. Do not inflate or minimise what they said.
- If the input is too vague to summarise, say so plainly in the summary and set urgency to LOW.
- If the input is not a symptom description at all (spam, gibberish, an unrelated question), set chiefComplaint to "Unclear - needs clarification", say so in the summary, and set urgency to LOW.

Urgency rubric — apply it literally:
- HIGH: reported symptoms that can indicate a time-critical problem — chest pain, difficulty breathing, one-sided weakness or numbness, slurred speech, fainting, uncontrolled bleeding, severe abdominal pain, suicidal thoughts, a severe allergic reaction, or symptoms the patient describes as the worst they have experienced.
- MEDIUM: persistent, worsening, or function-limiting symptoms with no HIGH feature — a fever lasting more than three days, pain that disrupts sleep or work, a symptom that keeps getting worse, or a new symptom in a patient who mentions a chronic condition.
- LOW: mild, stable, brief, or routine concerns — a follow-up, a prescription refill, a mild or resolving symptom.

When symptoms could fit two bands, choose the higher one. Under-triage is more harmful than over-triage.

The three suggested questions must be specific to what this patient wrote — never generic filler like "How are you feeling?". Aim at what would most change the doctor's next step: onset and progression, associated symptoms that would confirm or rule out a red flag, and relevant history or medication.`;

export function buildPreVisitUser({ symptoms, patientAge, patientGender, specialisation }) {
  const context = [
    patientAge ? `Patient age: ${patientAge}` : null,
    patientGender ? `Patient gender: ${patientGender}` : null,
    specialisation ? `Appointment booked with: ${specialisation}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `${context ? `${context}\n\n` : ''}The patient wrote the following when booking:

"""
${symptoms}
"""

Summarise this for the doctor.`;
}

// ---------------------------------------------------------------------------
// Feature 2 — post-visit summary and medication schedule
// ---------------------------------------------------------------------------

export const medicationSchema = z.object({
  name: z.string().describe('Medication name exactly as prescribed'),
  dosage: z.string().describe('Strength and amount per dose, e.g. "500 mg, 1 tablet"'),
  frequency: z.string().describe('Plain-English frequency, e.g. "twice a day"'),
  timesOfDay: z
    .array(z.string())
    .describe('24-hour HH:MM times to take it, one per dose per day, e.g. ["09:00","21:00"]'),
  durationDays: z.number().int().describe('How many days to continue; use 1 if unclear'),
  instructions: z
    .string()
    .describe('Any extra instruction such as "after food"; empty string if none'),
});

export const postVisitSchema = z.object({
  patientSummary: z
    .string()
    .describe("A plain-language summary of the visit, addressed to the patient, 3-6 sentences"),
  careInstructions: z
    .array(z.string())
    .describe('Concrete things the patient should do, one per item'),
  warningSigns: z
    .array(z.string())
    .describe('Symptoms that mean the patient should seek care sooner than the follow-up'),
  medications: z.array(medicationSchema).describe('One entry per prescribed medication'),
});

export const POST_VISIT_SYSTEM = `You are a patient-communication assistant working from a doctor's consultation notes.

You rewrite the doctor's notes and prescription so the patient can understand and follow them. You are NOT changing the clinical content.

Rules:
- Write at roughly an 8th-grade reading level. Address the patient directly as "you".
- Explain any medical term the doctor used in parentheses the first time it appears.
- Never add, remove, or alter a medication, dose, or duration. Transcribe exactly what the doctor prescribed. If the prescription is ambiguous, keep the doctor's wording in the instructions field rather than guessing at a number.
- Never introduce advice the doctor did not give.
- Never state or imply a prognosis.
- If no medication was prescribed, return an empty medications array.
- Do not include a greeting or sign-off.

Converting a prescription into times of day:
- Interpret standard notations: OD / once daily = 1 dose; BD / BID / twice daily = 2; TDS / TID / three times daily = 3; QID / four times daily = 4. The "1-0-1" style means morning-afternoon-night, where each number is the number of units at that time — so 1-0-1 is two doses, 1-1-1 is three, and 0-0-1 is one at night.
- Map doses onto this clock: 1/day → 09:00; 2/day → 09:00 and 21:00; 3/day → 08:00, 14:00 and 20:00; 4/day → 08:00, 12:00, 16:00 and 20:00. For morning-afternoon-night notation use 08:00 / 14:00 / 20:00 for the non-zero positions.
- If the doctor specified explicit times, use those instead.
- timesOfDay must have exactly as many entries as there are doses per day.

Always end warningSigns with an item telling the patient to seek immediate care if they have a severe reaction to a medication.`;

export function buildPostVisitUser({ doctorNotes, diagnosis, prescriptionText, followUpInDays }) {
  return `Doctor's consultation notes:
"""
${doctorNotes}
"""
${diagnosis ? `\nDoctor's stated diagnosis: ${diagnosis}` : ''}
${
  prescriptionText
    ? `\nPrescription as written by the doctor:\n"""\n${prescriptionText}\n"""`
    : '\nNo medication was prescribed.'
}
${followUpInDays ? `\nThe doctor asked the patient to follow up in ${followUpInDays} days.` : ''}

Rewrite this for the patient and extract the medication schedule.`;
}

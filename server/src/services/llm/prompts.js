import { z } from 'zod';

/**
 * Prompts and output schemas for the two LLM features.
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
  urgencyRationale: z.string().default('').describe('One sentence explaining the urgency label'),
  suggestedQuestions: z
    .array(z.string())
    .default([])
    .describe('Exactly three questions the doctor should ask to narrow things down'),
  redFlags: z
    .array(z.string())
    .default([])
    .describe('Any reported symptoms that warrant urgent attention; empty array if none'),
});

export const PRE_VISIT_SYSTEM = `You are a clinical intake assistant supporting a licensed doctor before a consultation.

Your job is to organise what the patient wrote so the doctor can absorb it in seconds. You are NOT diagnosing.

CRITICAL INSTRUCTIONS:
- Strictly adhere to the patient's real name, gender, and age provided in the prompt. Do NOT assume, invent, or swap gender or demographic details.
- Never name a diagnosis, condition, or disease. Describe only what the patient reported.
- Never recommend treatment, medication, or tests.
- Use the patient's own vocabulary where possible. Do not inflate or minimise what they said.
- If the input is routine (such as routine checkup or refill without acute complaints), summarize it as a routine visit and set urgency to LOW.
- If the input is not a symptom description at all (spam, gibberish), set chiefComplaint to "Unclear - needs clarification", say so in the summary, and set urgency to LOW.

Urgency rubric — apply it literally:
- HIGH: reported symptoms that can indicate a time-critical problem — chest pain, difficulty breathing, one-sided weakness or numbness, slurred speech, fainting, uncontrolled bleeding, severe abdominal pain, suicidal thoughts, a severe allergic reaction, or symptoms the patient describes as the worst they have experienced.
- MEDIUM: persistent, worsening, or function-limiting symptoms with no HIGH feature — a fever lasting more than three days, pain that disrupts sleep or work, a symptom that keeps getting worse, or a new symptom in a patient who mentions a chronic condition.
- LOW: mild, stable, brief, or routine concerns — a follow-up, a prescription refill, a routine checkup, a mild or resolving symptom.

When symptoms could fit two bands, choose the higher one. Under-triage is more harmful than over-triage.

The three suggested questions must be relevant to the patient's requested visit and specialty.

You must respond in JSON with keys: chiefComplaint, summary, urgency, urgencyRationale, suggestedQuestions, redFlags.`;

export function buildPreVisitUser({ symptoms, patientName, patientAge, patientGender, specialisation }) {
  const demographics = [
    patientName ? `Patient Full Name: ${patientName}` : null,
    patientGender ? `Patient Gender: ${patientGender}` : 'Patient Gender: Unspecified',
    patientAge ? `Patient Age: ${patientAge} years old` : 'Patient Age: Unspecified',
    specialisation ? `Doctor Specialty: ${specialisation}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    `=== PATIENT PROFILE ===`,
    demographics,
    `=== PATIENT-REPORTED REASON FOR VISIT / SYMPTOMS ===`,
    symptoms,
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Feature 2 — post-visit patient summary & medication extraction
// ---------------------------------------------------------------------------

export const postVisitSchema = z.object({
  patientSummary: z
    .string()
    .describe('2-4 sentences explaining the visit, diagnosis, and plan in plain language'),
  careInstructions: z
    .array(z.string())
    .default([])
    .describe('Concrete action steps the patient needs to take at home'),
  warningSigns: z
    .array(z.string())
    .default([])
    .describe('Specific symptoms that should prompt the patient to seek urgent medical attention'),
  followUpInDays: z
    .number()
    .int()
    .nullable()
    .default(null)
    .describe('Recommended follow-up window in days, or null if none was mentioned'),
  medications: z
    .array(
      z.object({
        name: z.string().describe('Medication name as prescribed'),
        dosage: z.string().default('').describe('Dose strength (e.g. 500mg)'),
        frequency: z.string().default('').describe('How often (e.g. once daily, BID)'),
        durationDays: z.number().int().default(5).describe('How many days to take it'),
        timesOfDay: z
          .array(z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'BEDTIME']))
          .default(['MORNING'])
          .describe('Slots of day for reminder schedule'),
        instructions: z.string().nullable().default(null).describe('Special instructions like after meals'),
      })
    )
    .default([]),
  unparsedPrescriptionLines: z.array(z.string()).default([]),
});

export const POST_VISIT_SYSTEM = `You are a medical communication specialist creating a post-consultation care plan for a patient.

Your job is to translate the doctor's clinical notes into clear, calm, 8th-grade-reading-level English, and parse prescriptions into structured dose schedules.

Rules:
- Never add medical advice not present in the doctor's notes.
- Use simple, reassuring language.
- Structure output in valid JSON with keys: patientSummary, careInstructions, warningSigns, followUpInDays, medications, unparsedPrescriptionLines.`;

export function buildPostVisitUser({ diagnosis, notes, prescriptionText, patientName, doctorName }) {
  return [
    `Doctor: ${doctorName || 'Attending Physician'}`,
    patientName ? `Patient: ${patientName}` : null,
    diagnosis ? `Diagnosis: ${diagnosis}` : null,
    notes ? `Doctor Notes:\n${notes}` : null,
    prescriptionText ? `Prescriptions:\n${prescriptionText}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

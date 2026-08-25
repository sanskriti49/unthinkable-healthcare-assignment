/**
 * Deterministic fallbacks used whenever the LLM is unavailable, times out, or
 * returns nothing usable.
 *
 * The design rule: **a degraded feature must still be safe.** These functions
 * never invent clinical content. The triage fallback is a keyword screen that
 * errs upward (it would rather flag a mild case as MEDIUM than miss a HIGH
 * one), and the post-visit fallback shows the doctor's own text unedited
 * instead of paraphrasing it. Output is always tagged `HEURISTIC` so the UI can
 * say where it came from.
 */

/**
 * Symptoms that are time-critical often enough that a keyword match alone
 * justifies escalating. Deliberately phrase-based rather than single words, so
 * "no chest pain" is the only common false positive (handled by the negation
 * check below) and "painful" does not trip "pain".
 */
const RED_FLAG_PATTERNS = [
  { pattern: /\bchest (pain|tightness|pressure|discomfort)\b/i, label: 'Chest pain or pressure' },
  { pattern: /\b(short(ness)? of breath|can'?t breathe|difficulty breathing|breathless)\b/i, label: 'Difficulty breathing' },
  { pattern: /\b(slurred speech|face droop|one[- ]sided weakness|numbness on one side)\b/i, label: 'Possible stroke signs' },
  { pattern: /\b(fainted|fainting|passed out|loss of consciousness|unconscious)\b/i, label: 'Loss of consciousness' },
  { pattern: /\b(severe|worst|unbearable|excruciating)\b.{0,20}\b(pain|headache|ache)\b/i, label: 'Severe pain' },
  { pattern: /\b(heavy|uncontrolled|profuse) bleeding\b|\bbleeding (that )?(won'?t|will not) stop\b/i, label: 'Uncontrolled bleeding' },
  { pattern: /\b(coughing|vomiting|throwing up) blood\b|\bblood in (my )?(vomit|stool)\b/i, label: 'Bleeding from the gut or lungs' },
  { pattern: /\b(suicidal|kill myself|end my life|self[- ]harm)\b/i, label: 'Thoughts of self-harm' },
  { pattern: /\b(anaphylaxis|throat closing|swollen (tongue|throat)|severe allergic)\b/i, label: 'Severe allergic reaction' },
  { pattern: /\bseizure|convulsion|fit\b/i, label: 'Seizure' },
  { pattern: /\bsevere abdominal pain\b|\bstomach pain\b.{0,25}\b(severe|unbearable)\b/i, label: 'Severe abdominal pain' },
];

const MEDIUM_PATTERNS = [
  { pattern: /\bfever\b.{0,30}\b([4-9]|\d{2,})\s*(days?|weeks?)\b/i, label: 'Prolonged fever' },
  { pattern: /\b(getting|been) (worse|worsening)\b|\bworsening\b|\bdeteriorat/i, label: 'Worsening symptoms' },
  { pattern: /\bcan'?t sleep\b|\bkeeps me (up|awake)\b|\bwaking me\b/i, label: 'Sleep-disrupting symptom' },
  { pattern: /\b(vomiting|diarrh?o?ea)\b.{0,30}\b(\d+\s*days?|persistent|constant)\b/i, label: 'Persistent GI symptoms' },
  { pattern: /\b(diabet(es|ic)|hypertension|high blood pressure|asthma|heart (disease|condition)|cancer|immunocompromised)\b/i, label: 'Reported chronic condition' },
  { pattern: /\bweeks?\b|\bmonths?\b/i, label: 'Long-standing symptom' },
  { pattern: /\b(unable to|can'?t) (walk|work|eat|stand)\b/i, label: 'Function-limiting symptom' },
];

/** "no chest pain", "denies chest pain", "without chest pain" */
function isNegated(text, matchIndex) {
  const window = text.slice(Math.max(0, matchIndex - 24), matchIndex).toLowerCase();
  return /\b(no|not|never|without|denies|deny|free of|ruled out)\b[^.]*$/.test(window);
}

function findMatches(text, patterns) {
  const found = [];
  for (const { pattern, label } of patterns) {
    const m = pattern.exec(text);
    if (m && !isNegated(text, m.index)) found.push(label);
  }
  return [...new Set(found)];
}

/** First sentence, trimmed to something headline-sized. */
function deriveChiefComplaint(text) {
  const firstSentence = text.split(/[.!?\n]/).map((s) => s.trim()).find(Boolean) ?? '';
  const words = firstSentence.split(/\s+/);
  if (words.length <= 12) return firstSentence || 'Symptoms described by patient';
  return `${words.slice(0, 12).join(' ')}…`;
}

/**
 * Keyword-based triage. Used when the LLM is unavailable.
 *
 * @returns {{chiefComplaint: string, summary: string, urgency: 'LOW'|'MEDIUM'|'HIGH',
 *            urgencyRationale: string, suggestedQuestions: string[], redFlags: string[]}}
 */
export function heuristicTriage(rawSymptoms) {
  const text = String(rawSymptoms ?? '').trim();

  if (text.length < 3) {
    return {
      chiefComplaint: 'Unclear - needs clarification',
      summary: 'The patient did not provide a usable symptom description at booking.',
      urgency: 'LOW',
      urgencyRationale: 'No symptom information was supplied.',
      suggestedQuestions: [
        'What is the main problem you would like help with today?',
        'When did it start, and has it changed since?',
        'Are you taking any medication at the moment?',
      ],
      redFlags: [],
    };
  }

  const redFlags = findMatches(text, RED_FLAG_PATTERNS);
  const mediumSignals = findMatches(text, MEDIUM_PATTERNS);

  let urgency = 'LOW';
  let urgencyRationale =
    'No time-critical or escalating features were detected by the automated screen.';
  if (redFlags.length > 0) {
    urgency = 'HIGH';
    urgencyRationale = `Automated screen matched potentially time-critical wording: ${redFlags.join(
      ', '
    )}.`;
  } else if (mediumSignals.length > 0) {
    urgency = 'MEDIUM';
    urgencyRationale = `Automated screen matched: ${mediumSignals.join(', ')}.`;
  }

  return {
    chiefComplaint: deriveChiefComplaint(text),
    // Deliberately does not paraphrase — the doctor reads the patient's words.
    summary:
      'AI summarisation is unavailable, so the patient\'s description is shown unedited above. ' +
      `An automated keyword screen suggests ${urgency} urgency.`,
    urgency,
    urgencyRationale,
    suggestedQuestions: [
      'When did this start, and has it been getting better or worse?',
      redFlags.length
        ? `You mentioned ${redFlags[0].toLowerCase()} — can you describe exactly what you felt and when?`
        : 'Is there anything that makes it better or worse?',
      'Are you taking any medication, and do you have any ongoing conditions?',
    ],
    redFlags,
  };
}

// ---------------------------------------------------------------------------
// Prescription parsing
// ---------------------------------------------------------------------------

/** Clock positions used when a prescription gives a count rather than times. */
const DOSE_CLOCK = {
  1: ['09:00'],
  2: ['09:00', '21:00'],
  3: ['08:00', '14:00', '20:00'],
  4: ['08:00', '12:00', '16:00', '20:00'],
};

/** Morning / afternoon / night positions for "1-0-1" notation. */
const POSITIONAL_CLOCK = ['08:00', '14:00', '20:00'];

const FREQUENCY_WORDS = [
  { pattern: /\b(qid|four times (a )?(day|daily)|4 times (a )?day)\b/i, doses: 4, label: 'four times a day' },
  { pattern: /\b(tds|tid|thrice daily|three times (a )?(day|daily)|3 times (a )?day)\b/i, doses: 3, label: 'three times a day' },
  { pattern: /\b(bd|bid|twice (a )?(day|daily)|2 times (a )?day|every 12 hours)\b/i, doses: 2, label: 'twice a day' },
  { pattern: /\b(od|once (a )?(day|daily)|1 time (a )?day|every 24 hours|daily|hs|at night|bedtime)\b/i, doses: 1, label: 'once a day' },
];

/**
 * Parse one prescription line into a structured medication.
 * Returns null when the line carries no recognisable drug name.
 */
function parsePrescriptionLine(line) {
  const text = line.trim().replace(/^[-*•\d.)\s]+/, '');
  if (text.length < 2) return null;

  // Dosage strength, e.g. "500mg", "5 ml", "10 mcg".
  const strengthMatch = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|units?)\b/i.exec(text);
  const dosage = strengthMatch ? `${strengthMatch[1]} ${strengthMatch[2].toLowerCase()}` : null;

  // Duration, e.g. "x 5 days", "for 7 days", "5/7", "2 weeks".
  let durationDays = 1;
  const durMatch = /(?:x|for|×)\s*(\d+)\s*(day|days|d)\b/i.exec(text) ?? /(\d+)\s*(day|days)\b/i.exec(text);
  const weekMatch = /(?:x|for|×)?\s*(\d+)\s*(week|weeks|w)\b/i.exec(text);
  if (durMatch) durationDays = Number(durMatch[1]);
  else if (weekMatch) durationDays = Number(weekMatch[1]) * 7;

  // Positional notation, e.g. "1-0-1" or "1-1-1".
  let timesOfDay = null;
  let frequency = null;
  const positional = /\b([0-2])\s*-\s*([0-2])\s*-\s*([0-2])\b/.exec(text);
  if (positional) {
    const counts = [positional[1], positional[2], positional[3]].map(Number);
    timesOfDay = POSITIONAL_CLOCK.filter((_, i) => counts[i] > 0);
    const total = counts.filter((c) => c > 0).length;
    frequency = `${total} time${total === 1 ? '' : 's'} a day`;
  }

  // Word/abbreviation frequency.
  if (!timesOfDay) {
    for (const { pattern, doses, label } of FREQUENCY_WORDS) {
      if (pattern.test(text)) {
        timesOfDay = DOSE_CLOCK[doses];
        frequency = label;
        break;
      }
    }
  }

  // A once-daily dose written as "at night" / "bedtime" / "HS" belongs in the
  // evening, not at the default 09:00.
  if (timesOfDay && timesOfDay.length === 1 && /\b(at night|bedtime|nightly|hs)\b/i.test(text)) {
    timesOfDay = ['21:00'];
  }

  // Explicit clock times, e.g. "at 08:00 and 20:00".
  const explicit = [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(
    (m) => `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`
  );
  if (explicit.length > 0) {
    timesOfDay = [...new Set(explicit)].sort();
    frequency = frequency ?? `${timesOfDay.length} time${timesOfDay.length === 1 ? '' : 's'} a day`;
  }

  // Drug name: leading words before the first digit or notation marker.
  const nameMatch = /^([A-Za-z][A-Za-z\-'’\s]{1,60}?)(?=\s*(?:\d|\(|,|-\s*\d))/.exec(text);
  const name = (nameMatch?.[1] ?? text.split(/[,(]/)[0]).trim().replace(/\s{2,}/g, ' ');
  if (!name || !/[A-Za-z]{3}/.test(name)) return null;

  // Instructions: recognised free-text qualifiers.
  const instructionBits = [];
  if (/\bafter (food|meals?|eating)\b/i.test(text)) instructionBits.push('after food');
  if (/\bbefore (food|meals?|eating)\b/i.test(text)) instructionBits.push('before food');
  if (/\bempty stomach\b/i.test(text)) instructionBits.push('on an empty stomach');
  if (/\bwith (water|milk)\b/i.test(text)) instructionBits.push(/milk/i.test(text) ? 'with milk' : 'with water');
  if (/\bsos\b|\bas (needed|required)\b|\bprn\b/i.test(text)) instructionBits.push('only as needed');

  return {
    name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
    dosage,
    // No recognisable frequency: fall back to once a day and say so, rather
    // than silently scheduling something the doctor did not write.
    frequency: frequency ?? 'as directed by your doctor',
    timesOfDay: timesOfDay ?? DOSE_CLOCK[1],
    durationDays: Number.isFinite(durationDays) && durationDays > 0 ? Math.min(durationDays, 180) : 1,
    instructions: instructionBits.join(', '),
    parsedByFallback: true,
  };
}

/**
 * Parse free-text prescription into structured medications.
 * Handles one drug per line, or comma/semicolon separated on one line.
 */
export function parsePrescription(prescriptionText) {
  const text = String(prescriptionText ?? '').trim();
  if (!text) return [];

  const lines = text.includes('\n')
    ? text.split(/\n+/)
    : text.split(/[;]|(?<=\d\s*(?:days?|weeks?))\s*,\s*/i);

  const meds = [];
  for (const line of lines) {
    const parsed = parsePrescriptionLine(line);
    if (parsed) meds.push(parsed);
  }
  return meds;
}

/**
 * Post-visit fallback. Presents the doctor's own words rather than a
 * paraphrase, and derives the medication schedule with the parser above.
 */
export function heuristicPostVisit({ doctorNotes, diagnosis, prescriptionText, followUpInDays }) {
  const medications = parsePrescription(prescriptionText);

  const careInstructions = [];
  if (medications.length > 0) {
    careInstructions.push('Take each medicine at the times shown in your schedule below.');
    careInstructions.push('Finish the full course even if you start feeling better.');
  }
  if (followUpInDays) {
    careInstructions.push(`Book a follow-up appointment in about ${followUpInDays} days.`);
  }
  careInstructions.push('Keep this summary for your records.');

  const summaryParts = [
    'A plain-language summary could not be generated automatically, so your doctor\'s notes are shown exactly as written:',
    '',
    String(doctorNotes ?? '').trim(),
  ];
  if (diagnosis) summaryParts.push('', `Diagnosis recorded by your doctor: ${diagnosis}`);

  return {
    patientSummary: summaryParts.join('\n'),
    careInstructions,
    warningSigns: [
      'Your symptoms get significantly worse instead of better.',
      'You develop a high fever, difficulty breathing, or severe pain.',
      'Seek immediate care if you have a severe reaction to a medication, such as a rash, swelling, or difficulty breathing.',
    ],
    medications,
  };
}

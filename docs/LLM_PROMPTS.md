# LLM prompts and fallbacks

Both AI features call Claude (`claude-opus-5` by default) through the official
`@anthropic-ai/sdk`, using **structured outputs** — generation is constrained to
a Zod schema, so there is no JSON parsing, no stray markdown fences, and no
"the model returned prose this time" failure mode.

Source: [`server/src/services/llm/`](../server/src/services/llm/) —
`prompts.js` (verbatim prompts and schemas), `client.js` (retries and
timeouts), `fallbacks.js` (deterministic paths), `pre-visit.js`, `post-visit.js`.

**With no `ANTHROPIC_API_KEY` set, both features fall back automatically and the
system works end to end.** Add the key to `server/.env` and restart — no code
change, no migration.

## Two rules shape both prompts

1. **Never diagnose.** The model organises and rephrases; it does not name
   conditions or recommend treatment. Both system prompts say so explicitly,
   *and* the schemas give it nowhere to put a diagnosis if it tried.
2. **Urgency is a triage signal, not a clinical decision.** The rubric is
   spelled out so the label means the same thing every time, and the doctor
   always sees the patient's own words next to it.

---

## Feature 1 — Pre-visit symptom summary

Runs as a background job when a patient confirms a booking with symptoms.

**Output schema**

| Field | Type | Meaning |
|---|---|---|
| `chiefComplaint` | string | The main problem, under 12 words, in the patient's terms |
| `summary` | string | 2–4 factual sentences for the doctor to skim |
| `urgency` | `LOW`\|`MEDIUM`\|`HIGH` | Per the rubric below |
| `urgencyRationale` | string | One sentence justifying the label |
| `suggestedQuestions` | string[] | Exactly three, specific to this patient |
| `redFlags` | string[] | Reported symptoms warranting urgent attention |

**System prompt** (verbatim from `prompts.js`)

```
You are a clinical intake assistant supporting a licensed doctor before a consultation.

Your job is to organise what the patient wrote so the doctor can absorb it in seconds. You are NOT diagnosing.

Rules:
- Never name a diagnosis, condition, or disease. Describe only what the patient reported.
- Never recommend treatment, medication, or tests.
- Use the patient's own vocabulary where possible. Do not inflate or minimise what they said.
- If the input is too vague to summarise, say so plainly in the summary and set urgency to LOW.
- If the input is not a symptom description at all (spam, gibberish, an unrelated question), set
  chiefComplaint to "Unclear - needs clarification", say so in the summary, and set urgency to LOW.

Urgency rubric — apply it literally:
- HIGH: reported symptoms that can indicate a time-critical problem — chest pain, difficulty
  breathing, one-sided weakness or numbness, slurred speech, fainting, uncontrolled bleeding,
  severe abdominal pain, suicidal thoughts, a severe allergic reaction, or symptoms the patient
  describes as the worst they have experienced.
- MEDIUM: persistent, worsening, or function-limiting symptoms with no HIGH feature — a fever
  lasting more than three days, pain that disrupts sleep or work, a symptom that keeps getting
  worse, or a new symptom in a patient who mentions a chronic condition.
- LOW: mild, stable, brief, or routine concerns — a follow-up, a prescription refill, a mild or
  resolving symptom.

When symptoms could fit two bands, choose the higher one. Under-triage is more harmful than
over-triage.

The three suggested questions must be specific to what this patient wrote — never generic filler
like "How are you feeling?". Aim at what would most change the doctor's next step: onset and
progression, associated symptoms that would confirm or rule out a red flag, and relevant history
or medication.
```

**User message** — patient age, gender and the booked specialisation (when
known), then the symptom text in delimiters.

### Fallback: keyword triage screen

`heuristicTriage()` in `fallbacks.js`. Phrase-based patterns (not single words,
so "painful" does not trip "pain") across eleven red-flag categories and seven
medium signals, with a **negation check** so "no chest pain, just a runny nose"
does not escalate.

It deliberately **does not paraphrase** — the doctor reads the patient's own
words, and the summary field says the AI was unavailable. It errs upward:
overcalling MEDIUM is safer than missing a HIGH.

Verified behaviour (from `server/test/resilience.test.js`):

| Input | Result |
|---|---|
| "crushing chest pain radiating to my arm" | HIGH |
| "fever for five days and getting worse" | MEDIUM |
| "mild sore throat since yesterday" | LOW |
| "no chest pain, just a runny nose" | LOW (negation respected) |

---

## Feature 2 — Post-visit summary and medication schedule

Runs when a doctor completes a consultation.

**Output schema**

| Field | Type | Meaning |
|---|---|---|
| `patientSummary` | string | Plain-language recap, 3–6 sentences, addressed to the patient |
| `careInstructions` | string[] | Concrete actions |
| `warningSigns` | string[] | When to seek care before the follow-up |
| `medications[]` | object[] | `name`, `dosage`, `frequency`, `timesOfDay[]`, `durationDays`, `instructions` |

**System prompt** (verbatim)

```
You are a patient-communication assistant working from a doctor's consultation notes.

You rewrite the doctor's notes and prescription so the patient can understand and follow them.
You are NOT changing the clinical content.

Rules:
- Write at roughly an 8th-grade reading level. Address the patient directly as "you".
- Explain any medical term the doctor used in parentheses the first time it appears.
- Never add, remove, or alter a medication, dose, or duration. Transcribe exactly what the doctor
  prescribed. If the prescription is ambiguous, keep the doctor's wording in the instructions
  field rather than guessing at a number.
- Never introduce advice the doctor did not give.
- Never state or imply a prognosis.
- If no medication was prescribed, return an empty medications array.
- Do not include a greeting or sign-off.

Converting a prescription into times of day:
- Interpret standard notations: OD / once daily = 1 dose; BD / BID / twice daily = 2;
  TDS / TID / three times daily = 3; QID / four times daily = 4. The "1-0-1" style means
  morning-afternoon-night, where each number is the number of units at that time — so 1-0-1 is
  two doses, 1-1-1 is three, and 0-0-1 is one at night.
- Map doses onto this clock: 1/day → 09:00; 2/day → 09:00 and 21:00; 3/day → 08:00, 14:00 and
  20:00; 4/day → 08:00, 12:00, 16:00 and 20:00. For morning-afternoon-night notation use
  08:00 / 14:00 / 20:00 for the non-zero positions.
- If the doctor specified explicit times, use those instead.
- timesOfDay must have exactly as many entries as there are doses per day.

Always end warningSigns with an item telling the patient to seek immediate care if they have a
severe reaction to a medication.
```

### Output is validated before it schedules anything

Structured outputs guarantee the *shape*, not that `timesOfDay` holds real clock
times or that `durationDays` is sane. Since these values drive real
notifications to patients, `sanitiseMedications()` re-checks every field and
repairs anything suspect from the deterministic parser — malformed times, more
than six doses a day, a duration outside 1–180 days. Repaired entries are
flagged `parsedByFallback`, and the patient UI says the times were derived
automatically.

### Fallback: rule-based prescription parser

`parsePrescription()` handles the notation Indian clinics actually write:

| Input line | Parsed |
|---|---|
| `Amoxicillin 500mg 1-0-1 x 5 days after food` | 08:00 + 20:00, 5 days, "after food" |
| `Paracetamol 650mg TDS for 3 days` | 08:00 / 14:00 / 20:00, 3 days |
| `Cetirizine 10mg OD at night x 7 days` | 21:00, 7 days |
| `Pantoprazole 40mg 1-0-0 before food x 14 days` | 08:00, 14 days, "before food" |
| `Ibuprofen 400mg as required` | "only as needed" — kept, not silently dropped |

Unparseable text yields **no** medications rather than inventing one. The
post-visit fallback presents the doctor's notes verbatim rather than
paraphrasing them.

---

## Failure handling

`completeStructured()` in `client.js`:

- **Timeout** — `LLM_TIMEOUT_MS` (default 25s), enforced by the SDK.
- **Retries** — `LLM_MAX_ATTEMPTS` (default 3) on transient failures only:
  429, 5xx, connection errors and timeouts. A 400 or a refusal is not retried,
  because it will fail identically.
- **Refusals** — `stop_reason: "refusal"` is a valid HTTP 200; it is treated as
  a hard failure and falls back.
- **It throws rather than guesses.** Every caller has a deterministic fallback,
  and in a clinical setting a wrong-but-plausible summary is worse than a
  missing one.

Neither `generatePreVisitSummary()` nor `generatePostVisitSummary()` propagates
an LLM failure. Each always leaves a usable record behind, tagged `HEURISTIC`,
with `lastError` recorded for the admin dashboard. A booking is never blocked by
a model outage.

This is covered by a test that points the client at an unroutable host and
asserts the appointment still ends up with a HIGH-urgency triage record
(`server/test/resilience.test.js`).

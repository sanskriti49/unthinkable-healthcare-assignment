import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { heuristicTriage, parsePrescription, heuristicPostVisit } from '../src/services/llm/fallbacks.js';
import { backoffSeconds, enqueue, claimJobs, markFailed, retryDeadLetter, JobType } from '../src/services/queue.js';
import { generatePreVisitSummary } from '../src/services/llm/pre-visit.js';
import { resetClient } from '../src/services/llm/client.js';
import { env } from '../src/config/env.js';

/**
 * Failure-path tests.
 *
 * The brief requires that LLM failures never break the system and that
 * notification failures are handled. Both are asserted here against real
 * failures — an unreachable API and a permanently failing job — rather than
 * mocked-out happy paths.
 */

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Deterministic triage
// ---------------------------------------------------------------------------

test('triage escalates time-critical wording to HIGH', () => {
  for (const text of [
    'I have crushing chest pain radiating to my arm',
    'Sudden difficulty breathing since this morning',
    'My father has slurred speech and one-sided weakness',
    'I have been having thoughts of self-harm',
  ]) {
    assert.equal(heuristicTriage(text).urgency, 'HIGH', `expected HIGH for: ${text}`);
  }
});

test('triage does not fire on negated symptoms', () => {
  const result = heuristicTriage('No chest pain at all, just a mild runny nose for two days');
  assert.notEqual(result.urgency, 'HIGH');
  assert.deepEqual(result.redFlags, []);
});

test('triage returns exactly three questions, always', () => {
  for (const text of ['', 'x', 'severe chest pain', 'mild headache since yesterday']) {
    assert.equal(heuristicTriage(text).suggestedQuestions.length, 3);
  }
});

test('triage handles unusable input without throwing', () => {
  const result = heuristicTriage('   ');
  assert.equal(result.urgency, 'LOW');
  assert.match(result.chiefComplaint, /Unclear/);
});

// ---------------------------------------------------------------------------
// Prescription parsing
// ---------------------------------------------------------------------------

test('parses common Indian prescription notations', () => {
  const meds = parsePrescription(
    [
      'Amoxicillin 500mg 1-0-1 x 5 days after food',
      'Paracetamol 650mg TDS for 3 days',
      'Cetirizine 10mg OD at night x 7 days',
      'Pantoprazole 40mg 1-0-0 before food x 14 days',
    ].join('\n')
  );

  assert.equal(meds.length, 4);

  const [amox, para, cet, pan] = meds;
  assert.deepEqual(amox.timesOfDay, ['08:00', '20:00']);
  assert.equal(amox.durationDays, 5);
  assert.equal(amox.instructions, 'after food');

  assert.equal(para.timesOfDay.length, 3);
  assert.equal(para.durationDays, 3);

  assert.deepEqual(cet.timesOfDay, ['21:00'], 'a bedtime dose belongs at night');
  assert.equal(cet.durationDays, 7);

  assert.deepEqual(pan.timesOfDay, ['08:00']);
  assert.equal(pan.instructions, 'before food');
  assert.equal(pan.durationDays, 14);
});

test('unparseable prescription text yields no phantom medications', () => {
  assert.deepEqual(parsePrescription(''), []);
  assert.deepEqual(parsePrescription('   '), []);
  assert.deepEqual(parsePrescription('12345 -- ???'), []);
});

test('a medication with no recognisable frequency defers to the doctor', () => {
  const [med] = parsePrescription('Ibuprofen 400mg as required');
  assert.equal(med.name, 'Ibuprofen');
  assert.match(med.frequency, /as needed|as directed/);
  assert.ok(med.timesOfDay.length >= 1, 'still schedulable rather than silently dropped');
});

test('post-visit fallback shows the doctor\'s notes verbatim rather than paraphrasing', () => {
  const notes = 'Viral URTI. Chest clear. Advised rest and fluids.';
  const result = heuristicPostVisit({ doctorNotes: notes, prescriptionText: 'Paracetamol 500mg BD x 3 days' });
  assert.ok(result.patientSummary.includes(notes), 'the doctor\'s own words must be preserved');
  assert.equal(result.medications.length, 1);
  assert.ok(result.warningSigns.length > 0);
});

// ---------------------------------------------------------------------------
// LLM failure degrades, never throws
// ---------------------------------------------------------------------------

test('an unreachable LLM falls back to heuristic triage instead of failing the appointment', async (t) => {
  const doctor = await prisma.doctorProfile.findFirst();
  const patient = await prisma.user.findFirst({ where: { role: 'PATIENT' } });

  // A slot far in the future, so this cannot collide with other tests.
  const startsAt = new Date(Date.now() + 300 * 86_400_000);
  const appointment = await prisma.appointment.create({
    data: {
      doctorId: doctor.id,
      patientId: patient.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: 'BOOKED',
      symptoms: 'Crushing chest pain and shortness of breath for the last hour',
    },
  });

  // Point the client at an unroutable host with a bogus key: every attempt
  // fails at the network layer, which is the outage we must survive.
  const original = { key: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, attempts: env.llm.maxAttempts };
  process.env.ANTHROPIC_API_KEY = 'sk-ant-invalid-key-for-testing';
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
  env.llm.maxAttempts = 1;
  resetClient();

  t.after(async () => {
    if (original.key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original.key;
    if (original.url === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = original.url;
    env.llm.maxAttempts = original.attempts;
    resetClient();
    await prisma.appointment.deleteMany({ where: { id: appointment.id } });
  });

  // The whole point: this resolves rather than rejecting.
  const result = await generatePreVisitSummary(appointment.id);
  assert.equal(result.source, 'HEURISTIC');

  const stored = await prisma.preVisitSummary.findUnique({ where: { appointmentId: appointment.id } });
  assert.equal(stored.source, 'HEURISTIC');
  assert.equal(stored.urgency, 'HIGH', 'the keyword screen still catches chest pain');
  assert.equal(stored.suggestedQuestions.length, 3);
  assert.ok(stored.lastError, 'the failure is recorded for the admin dashboard');
  assert.equal(stored.rawSymptoms, appointment.symptoms, 'the patient\'s own words are preserved');
});

// ---------------------------------------------------------------------------
// Notification failure handling
// ---------------------------------------------------------------------------

test('backoff grows exponentially and stays capped', () => {
  const delays = [1, 2, 3, 4, 5].map((attempt) => backoffSeconds(attempt));
  for (let i = 1; i < delays.length; i += 1) {
    assert.ok(delays[i] >= delays[i - 1], 'each retry waits at least as long as the last');
  }
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    assert.ok(backoffSeconds(attempt) <= env.worker.backoffMaxSeconds, 'never exceeds the cap');
  }
});

test('a repeatedly failing job is retried, then dead-lettered with its error history', async () => {
  const job = await enqueue({
    type: JobType.SEND_EMAIL,
    payload: { emailLogId: 'does-not-exist' },
    maxAttempts: 3,
  });

  let current = job;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const [claimed] = await claimJobs('test-worker', 1).then((rows) =>
      rows.filter((r) => r.id === job.id)
    ).then((rows) => (rows.length ? rows : [{ ...current, attempts: attempt }]));

    const outcome = await markFailed({ ...claimed, id: job.id }, new Error(`boom ${attempt}`));
    current = await prisma.job.findUnique({ where: { id: job.id } });

    if (attempt < 3) {
      assert.equal(outcome.deadLettered, false);
      assert.equal(current.status, 'PENDING', 'still retryable');
      assert.ok(current.runAt > new Date(), 'rescheduled into the future by backoff');
    } else {
      assert.equal(outcome.deadLettered, true);
      assert.equal(current.status, 'FAILED', 'dead-lettered, not silently dropped');
    }
  }

  assert.equal(current.errorLog.length, 3, 'every attempt is recorded');
  assert.match(current.lastError, /boom 3/);

  // An operator can put it back in the queue without losing the audit trail.
  const retried = await retryDeadLetter(job.id);
  assert.equal(retried.status, 'PENDING');
  assert.equal(retried.retryOfId, job.id);

  const originalStillFailed = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(originalStillFailed.status, 'FAILED', 'the failed original is kept as a record');

  await prisma.job.deleteMany({ where: { OR: [{ id: job.id }, { id: retried.id }] } });
});

test.after(async () => {
  await prisma.$disconnect();
});

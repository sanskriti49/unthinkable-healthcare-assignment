import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { holdSlot, bookDirect } from '../src/services/booking.js';
import { getAvailability } from '../src/services/slots.js';
import { localDateKey } from '../src/lib/time.js';

/**
 * Concurrency tests for the booking engine.
 *
 * These fire genuinely simultaneous requests at the same slot — not sequential
 * calls that merely look concurrent — and assert that exactly one wins. That is
 * the property the brief asks for, and the only way to be confident in it is to
 * actually race the database.
 *
 * Requires a running Postgres and a seeded database:
 *   npm run db:migrate && npm run db:seed && npm test
 */

const prisma = new PrismaClient();

/** A slot that is genuinely bookable right now, for a seeded doctor. */
async function findBookableSlot() {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { user: { email: 'dr.khan@clinic.local' } },
  });
  assert.ok(doctor, 'seed data missing — run `npm run db:seed` first');

  const from = localDateKey(new Date(Date.now() + 86_400_000));
  const to = localDateKey(new Date(Date.now() + 20 * 86_400_000));
  const days = await getAvailability({ doctorId: doctor.id, from, to });

  for (const day of days) {
    const free = day.slots.find((s) => s.available);
    if (free) return { doctorId: doctor.id, startsAt: new Date(free.startsAt) };
  }
  throw new Error('no bookable slot found in the next 20 days');
}

async function patientIds(count) {
  const patients = await prisma.user.findMany({ where: { role: 'PATIENT' }, take: count });
  assert.ok(patients.length >= count, `need at least ${count} seeded patients`);
  return patients.map((p) => p.id);
}

test('concurrent holds on one slot: exactly one succeeds', async () => {
  const { doctorId, startsAt } = await findBookableSlot();
  const ids = await patientIds(3);

  // All three requests are in flight before any of them can commit.
  const results = await Promise.allSettled(
    ids.map((patientId) => holdSlot({ doctorId, patientId, startsAt }))
  );

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'exactly one hold should succeed');
  assert.equal(rejected.length, 2, 'the other two should be rejected');

  for (const r of rejected) {
    assert.equal(r.reason.status, 409, 'losers get a 409, not a 500');
    assert.equal(r.reason.code, 'SLOT_TAKEN');
  }

  // And the database agrees: one occupying row, no more.
  const occupying = await prisma.appointment.count({
    where: {
      doctorId,
      startsAt,
      OR: [{ status: { in: ['BOOKED', 'COMPLETED'] } }, { status: 'HELD', holdExpiresAt: { gt: new Date() } }],
    },
  });
  assert.equal(occupying, 1, 'exactly one appointment may occupy the slot');

  await prisma.appointment.deleteMany({ where: { doctorId, startsAt } });
});

test('concurrent full bookings on one slot: exactly one succeeds', async () => {
  const { doctorId, startsAt } = await findBookableSlot();
  const ids = await patientIds(3);

  const results = await Promise.allSettled(
    ids.map((patientId) =>
      bookDirect({ doctorId, patientId, startsAt, symptoms: 'Persistent cough for two weeks' })
    )
  );

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);

  const booked = await prisma.appointment.count({ where: { doctorId, startsAt, status: 'BOOKED' } });
  assert.equal(booked, 1);

  await prisma.appointment.deleteMany({ where: { doctorId, startsAt } });
});

test('the database rejects a double-booking even when the application logic is bypassed', async () => {
  const { doctorId, startsAt } = await findBookableSlot();
  const [a, b] = await patientIds(2);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

  await prisma.appointment.create({ data: { doctorId, patientId: a, startsAt, endsAt, status: 'BOOKED' } });

  // Direct insert, skipping every guard in services/booking.js. The partial
  // unique index is the only thing standing in the way — and it must hold.
  await assert.rejects(
    () =>
      prisma.appointment.create({
        data: { doctorId, patientId: b, startsAt, endsAt, status: 'BOOKED' },
      }),
    (err) => err.code === 'P2002',
    'the partial unique index must reject a second occupying row'
  );

  await prisma.appointment.deleteMany({ where: { doctorId, startsAt } });
});

test('a cancelled appointment frees its slot for rebooking', async () => {
  const { doctorId, startsAt } = await findBookableSlot();
  const [a, b] = await patientIds(2);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

  const first = await prisma.appointment.create({
    data: { doctorId, patientId: a, startsAt, endsAt, status: 'BOOKED' },
  });
  await prisma.appointment.update({
    where: { id: first.id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: 'PATIENT' },
  });

  // A plain UNIQUE(doctorId, startsAt) would fail here — the whole reason the
  // index is filtered on status.
  const second = await prisma.appointment.create({
    data: { doctorId, patientId: b, startsAt, endsAt, status: 'BOOKED' },
  });
  assert.equal(second.status, 'BOOKED');

  await prisma.appointment.deleteMany({ where: { doctorId, startsAt } });
});

test('an expired hold is reclaimed by the next booker', async () => {
  const { doctorId, startsAt } = await findBookableSlot();
  const [a, b] = await patientIds(2);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

  // A hold that lapsed a minute ago.
  await prisma.appointment.create({
    data: {
      doctorId,
      patientId: a,
      startsAt,
      endsAt,
      status: 'HELD',
      holdExpiresAt: new Date(Date.now() - 60_000),
      holdToken: 'expired-token-for-test',
    },
  });

  // No sweeper has run; the booking transaction must reap it itself.
  const held = await holdSlot({ doctorId, patientId: b, startsAt });
  assert.equal(held.patientId ?? b, b);

  const expired = await prisma.appointment.findFirst({
    where: { doctorId, startsAt, patientId: a },
    select: { status: true, cancelReason: true },
  });
  assert.equal(expired.status, 'EXPIRED');
  assert.equal(expired.cancelReason, 'HOLD_EXPIRED');

  await prisma.appointment.deleteMany({ where: { doctorId, startsAt } });
});

test('a patient cannot hold two doctors at the same instant', async () => {
  const { startsAt } = await findBookableSlot();
  const [patientId] = await patientIds(1);

  const doctors = await prisma.doctorProfile.findMany({
    where: { workingHours: { some: {} } },
    include: { workingHours: true },
    take: 4,
  });

  // Find two doctors whose grids both contain this instant.
  const eligible = [];
  for (const doc of doctors) {
    const day = await getAvailability({
      doctorId: doc.id,
      from: localDateKey(startsAt),
      to: localDateKey(startsAt),
    });
    if (day[0]?.slots.some((s) => new Date(s.startsAt).getTime() === startsAt.getTime())) {
      eligible.push(doc.id);
    }
    if (eligible.length === 2) break;
  }

  if (eligible.length < 2) return; // schedules do not overlap here; nothing to assert

  await holdSlot({ doctorId: eligible[0], patientId, startsAt });
  await assert.rejects(
    () => holdSlot({ doctorId: eligible[1], patientId, startsAt }),
    (err) => err.code === 'PATIENT_DOUBLE_BOOKED'
  );

  await prisma.appointment.deleteMany({ where: { startsAt, patientId } });
});

test.after(async () => {
  await prisma.$disconnect();
});

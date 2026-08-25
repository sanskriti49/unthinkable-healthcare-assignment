import { prisma } from '../db.js';
import { env } from '../config/env.js';
import {
  addMinutes,
  dateKeyRange,
  dayOfWeekForKey,
  dateOnlyToUtcMidnight,
  localDateKey,
  parseDateOnly,
  parseTimeOfDay,
  zonedTimeToUtc,
} from '../lib/time.js';
import { notFound, badRequest } from '../lib/errors.js';

/**
 * Slot availability.
 *
 * Slots are *derived*, never stored: a doctor's availability is
 * (working hours) − (leave days) − (occupied slots) − (too soon to book).
 * Materialising a slot table would mean keeping it in step with every change to
 * working hours, and would make "the doctor changed their hours" a migration
 * rather than an edit.
 *
 * A slot is occupied when an appointment for it is BOOKED or COMPLETED, or is
 * HELD with an unexpired hold — exactly the set the partial unique index
 * `appointment_active_slot_uniq` protects.
 */

/** WHERE clause matching appointments that genuinely occupy their slot now. */
export function occupyingWhere(now = new Date()) {
  return {
    OR: [
      { status: { in: ['BOOKED', 'COMPLETED'] } },
      { status: 'HELD', holdExpiresAt: { gt: now } },
    ],
  };
}

/**
 * Expand a doctor's weekly working hours into concrete slot start instants for
 * one clinic-local date.
 */
function slotsForDate({ dateKey, workingHours, slotDurationMinutes }) {
  const dayOfWeek = dayOfWeekForKey(dateKey);
  const parsed = parseDateOnly(dateKey);
  if (dayOfWeek === null || !parsed) return [];

  const windows = workingHours.filter((w) => w.dayOfWeek === dayOfWeek && w.isActive);
  const starts = [];

  for (const window of windows) {
    const from = parseTimeOfDay(window.startTime);
    const to = parseTimeOfDay(window.endTime);
    if (from === null || to === null || to <= from) continue;

    // Only whole slots that finish inside the window are offered — a 30-minute
    // consultation must not run past the end of clinic.
    for (let m = from; m + slotDurationMinutes <= to; m += slotDurationMinutes) {
      starts.push(
        zonedTimeToUtc(parsed.year, parsed.month, parsed.day, Math.floor(m / 60), m % 60, env.clinicTimezone)
      );
    }
  }

  return starts.sort((a, b) => a - b);
}

/**
 * Available slots for a doctor across a date range.
 *
 * @param {object} opts
 * @param {string} opts.doctorId
 * @param {string} opts.from     "YYYY-MM-DD" clinic-local
 * @param {string} opts.to       "YYYY-MM-DD" clinic-local
 * @param {boolean} [opts.includeOccupied] also return taken slots, flagged —
 *        used by the doctor's own schedule view
 * @returns {Promise<Array<{date: string, slots: Array}>>}
 */
export async function getAvailability({ doctorId, from, to, includeOccupied = false }) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: { workingHours: true, user: { select: { fullName: true, isActive: true } } },
  });
  if (!doctor) throw notFound('Doctor');

  const dateKeys = dateKeyRange(from, to);
  if (dateKeys.length === 0) throw badRequest('INVALID_DATE_RANGE', 'from/to must be YYYY-MM-DD dates');
  if (dateKeys.length > 62) {
    throw badRequest('DATE_RANGE_TOO_WIDE', 'Request at most 62 days of availability at a time');
  }

  const rangeStart = zonedTimeToUtc(
    parseDateOnly(dateKeys[0]).year,
    parseDateOnly(dateKeys[0]).month,
    parseDateOnly(dateKeys[0]).day,
    0,
    0
  );
  const lastKey = parseDateOnly(dateKeys[dateKeys.length - 1]);
  const rangeEnd = addMinutes(
    zonedTimeToUtc(lastKey.year, lastKey.month, lastKey.day, 0, 0),
    24 * 60
  );

  const now = new Date();
  const earliestBookable = addMinutes(now, env.booking.minLeadMinutes);
  const horizonEnd = new Date(now.getTime() + doctor.bookingHorizonDays * 86_400_000);

  const [leaves, occupied] = await Promise.all([
    prisma.doctorLeave.findMany({
      where: { doctorId, date: { gte: dateOnlyToUtcMidnight(dateKeys[0]), lte: dateOnlyToUtcMidnight(dateKeys.at(-1)) } },
      select: { date: true, reason: true },
    }),
    prisma.appointment.findMany({
      where: { doctorId, startsAt: { gte: rangeStart, lt: rangeEnd }, ...occupyingWhere(now) },
      select: { startsAt: true, status: true, patientId: true },
    }),
  ]);

  const leaveByKey = new Map(
    leaves.map((l) => [localDateKey(new Date(l.date), 'UTC'), l.reason ?? 'On leave'])
  );
  const occupiedByTime = new Map(occupied.map((a) => [a.startsAt.getTime(), a]));

  return dateKeys.map((dateKey) => {
    const onLeave = leaveByKey.has(dateKey);
    const starts = onLeave ? [] : slotsForDate({ dateKey, workingHours: doctor.workingHours, slotDurationMinutes: doctor.slotDurationMinutes });

    const slots = [];
    for (const startsAt of starts) {
      const taken = occupiedByTime.get(startsAt.getTime());
      const tooSoon = startsAt < earliestBookable;
      const beyondHorizon = startsAt > horizonEnd;
      const available = !taken && !tooSoon && !beyondHorizon && doctor.isAcceptingPatients;

      if (!available && !includeOccupied) continue;

      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: addMinutes(startsAt, doctor.slotDurationMinutes).toISOString(),
        available,
        ...(includeOccupied
          ? {
              reason: taken
                ? 'BOOKED'
                : tooSoon
                  ? 'TOO_SOON'
                  : beyondHorizon
                    ? 'BEYOND_HORIZON'
                    : !doctor.isAcceptingPatients
                      ? 'NOT_ACCEPTING'
                      : null,
            }
          : {}),
      });
    }

    return {
      date: dateKey,
      onLeave,
      leaveReason: onLeave ? leaveByKey.get(dateKey) : null,
      slotDurationMinutes: doctor.slotDurationMinutes,
      slots,
    };
  });
}

/**
 * Validate that `startsAt` is a real, bookable slot for this doctor.
 * Called inside the booking transaction — availability shown to a user is a
 * hint, never a permission.
 *
 * @returns {Promise<{endsAt: Date}>}
 * @throws {AppError} when the slot is not valid
 */
export async function assertSlotIsValid({ doctor, startsAt, tx = prisma, now = new Date() }) {
  const dateKey = localDateKey(startsAt);

  const onLeave = await tx.doctorLeave.findFirst({
    where: { doctorId: doctor.id, date: dateOnlyToUtcMidnight(dateKey) },
  });
  if (onLeave) {
    throw badRequest('DOCTOR_ON_LEAVE', 'The doctor is on leave on that date', {
      date: dateKey,
      reason: onLeave.reason,
    });
  }

  if (!doctor.isAcceptingPatients) {
    throw badRequest('NOT_ACCEPTING_PATIENTS', 'This doctor is not accepting new bookings');
  }

  const validStarts = slotsForDate({
    dateKey,
    workingHours: doctor.workingHours,
    slotDurationMinutes: doctor.slotDurationMinutes,
  });
  const match = validStarts.find((s) => s.getTime() === startsAt.getTime());
  if (!match) {
    throw badRequest('NOT_A_VALID_SLOT', 'That time is not on this doctor\'s schedule', {
      date: dateKey,
    });
  }

  if (startsAt < addMinutes(now, env.booking.minLeadMinutes)) {
    throw badRequest(
      'TOO_LATE_TO_BOOK',
      `Appointments must be booked at least ${env.booking.minLeadMinutes} minutes in advance`
    );
  }

  const horizonEnd = new Date(now.getTime() + doctor.bookingHorizonDays * 86_400_000);
  if (startsAt > horizonEnd) {
    throw badRequest(
      'BEYOND_BOOKING_HORIZON',
      `This doctor accepts bookings up to ${doctor.bookingHorizonDays} days ahead`
    );
  }

  return { endsAt: addMinutes(startsAt, doctor.slotDurationMinutes) };
}

/**
 * The next N bookable slots for a doctor — used to offer alternatives when an
 * appointment is cancelled because the doctor went on leave.
 */
export async function nextAvailableSlots({ doctorId, limit = 3, fromDate = new Date() }) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: { workingHours: true },
  });
  if (!doctor) return [];

  const from = localDateKey(fromDate);
  const to = localDateKey(new Date(fromDate.getTime() + doctor.bookingHorizonDays * 86_400_000));

  const days = await getAvailability({ doctorId, from, to });
  const out = [];
  for (const day of days) {
    for (const slot of day.slots) {
      if (!slot.available) continue;
      out.push(slot.startsAt);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

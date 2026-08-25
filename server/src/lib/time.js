import { env } from '../config/env.js';

/**
 * Timezone-aware date helpers, implemented on top of `Intl` so the project has
 * no date-library dependency.
 *
 * The invariant everywhere else in the codebase: **instants are stored and
 * compared in UTC**; the clinic timezone is only used at the edges, when
 * expanding "Monday 09:00–13:00" into concrete instants and when formatting
 * for humans.
 */

const partsFormatter = new Map();

function formatterFor(timeZone) {
  let f = partsFormatter.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsFormatter.set(timeZone, f);
  }
  return f;
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Break an instant into wall-clock parts in `timeZone`. */
export function zonedParts(date, timeZone = env.clinicTimezone) {
  const parts = formatterFor(timeZone)
    .formatToParts(date)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl renders midnight as "24" in some locales/zones; normalise to 0.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayOfWeek: WEEKDAY_INDEX[parts.weekday],
  };
}

/** Offset in ms between `timeZone` wall clock and UTC at that instant. */
function offsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - date.getTime();
}

/**
 * Convert a wall-clock time in `timeZone` to the UTC instant it denotes.
 * The second pass settles DST transitions, where the first guess can land on
 * the wrong side of the jump.
 */
export function zonedTimeToUtc(year, month, day, hour, minute, timeZone = env.clinicTimezone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ts = guess - offsetMs(new Date(guess), timeZone);
  ts = guess - offsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

/** Parse "YYYY-MM-DD" — returns null if malformed or not a real calendar date. */
export function parseDateOnly(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return { year: y, month: mo, day: d, utcMidnight: date };
}

/** Parse "HH:MM" into minutes past midnight, or null. */
export function parseTimeOfDay(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Inverse of parseTimeOfDay. */
export function minutesToTimeOfDay(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The clinic-local calendar date an instant falls on, as "YYYY-MM-DD". */
export function localDateKey(date, timeZone = env.clinicTimezone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Midnight UTC of a clinic-local date, which is how `DoctorLeave.date`
 * (a Postgres DATE) is stored and compared.
 */
export function dateOnlyToUtcMidnight(dateKey) {
  const parsed = parseDateOnly(dateKey);
  return parsed ? parsed.utcMidnight : null;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Inclusive list of "YYYY-MM-DD" keys from `from` to `to`. */
export function dateKeyRange(from, to, timeZone = env.clinicTimezone) {
  const keys = [];
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (!start || !end) return keys;
  for (let t = start.utcMidnight.getTime(); t <= end.utcMidnight.getTime(); t += 86_400_000) {
    const d = new Date(t);
    keys.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate()
      ).padStart(2, '0')}`
    );
  }
  return keys;
}

/** Day-of-week (0=Sun) for a "YYYY-MM-DD" key. */
export function dayOfWeekForKey(dateKey) {
  const parsed = parseDateOnly(dateKey);
  return parsed ? parsed.utcMidnight.getUTCDay() : null;
}

/** Human-friendly rendering for emails and calendar descriptions. */
export function formatForHumans(date, timeZone = env.clinicTimezone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatTimeOnly(date, timeZone = env.clinicTimezone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

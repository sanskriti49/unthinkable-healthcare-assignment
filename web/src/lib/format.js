/**
 * Display formatting.
 *
 * The API sends UTC instants; the clinic timezone is resolved once from
 * /api/health so the browser renders clinic time regardless of where the user
 * is sitting. Until that resolves we fall back to the browser's own zone.
 */

let clinicTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const setClinicTimezone = (tz) => {
  if (tz) clinicTimezone = tz;
};
export const getClinicTimezone = () => clinicTimezone;

const fmt = (options) => new Intl.DateTimeFormat('en-GB', { timeZone: clinicTimezone, ...options });

export const formatDateTime = (value) =>
  value
    ? fmt({
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(value))
    : '—';

export const formatTime = (value) =>
  value ? fmt({ hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(value)) : '—';

export const formatDate = (value) =>
  value
    ? fmt({ weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
    : '—';

export const formatDayLabel = (dateKey) => {
  const today = todayKey();
  if (dateKey === today) return 'Today';
  if (dateKey === addDaysKey(today, 1)) return 'Tomorrow';
  return formatDate(`${dateKey}T12:00:00Z`);
};

/** "YYYY-MM-DD" for today in the clinic timezone. */
export function todayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: clinicTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

export function addDaysKey(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Minor currency units → "₹500.00". */
export const formatFee = (minorUnits) =>
  typeof minorUnits === 'number'
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minorUnits / 100)
    : '—';

/** "in 3 days", "in 2 hours", "5 minutes ago" */
export function relativeTime(value) {
  if (!value) return '';
  const diffMs = new Date(value).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'now';
}

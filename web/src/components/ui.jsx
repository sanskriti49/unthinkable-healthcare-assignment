import { Link } from 'react-router-dom';

/** Small presentational primitives shared across the three portals. */

export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-10 text-slate-500 ${className}`} role="status">
      <svg className="h-5 w-5 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBanner({ error, onRetry, className = '' }) {
  if (!error) return null;
  const details = Array.isArray(error.details) ? error.details : null;

  return (
    <div className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`} role="alert">
      <p className="text-sm font-semibold text-red-800">{error.message ?? 'Something went wrong'}</p>
      {details && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-red-700">
          {details.map((d, i) => (
            <li key={i}>
              {d.field !== '(root)' ? <span className="font-medium">{d.field}: </span> : null}
              {d.message}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-3">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
};

export function Badge({ tone = 'slate', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const STATUS_TONE = {
  BOOKED: 'green',
  HELD: 'amber',
  COMPLETED: 'blue',
  CANCELLED: 'red',
  EXPIRED: 'slate',
  NO_SHOW: 'red',
};

export const StatusBadge = ({ status }) => (
  <Badge tone={STATUS_TONE[status] ?? 'slate'}>{String(status ?? '').replace('_', ' ').toLowerCase()}</Badge>
);

const URGENCY_TONE = { HIGH: 'red', MEDIUM: 'amber', LOW: 'green' };

export const UrgencyBadge = ({ urgency }) =>
  urgency ? <Badge tone={URGENCY_TONE[urgency] ?? 'slate'}>{urgency} urgency</Badge> : null;

/**
 * Says where an AI-assisted block came from. Being explicit about degraded
 * output is a product requirement, not a nicety — a clinician needs to know
 * whether they are reading a model's summary or a keyword screen.
 */
export function SourceNote({ source, className = '' }) {
  if (!source) return null;
  const copy = {
    LLM: { tone: 'brand', text: 'AI-generated summary' },
    HEURISTIC: { tone: 'amber', text: 'AI unavailable — automated fallback' },
    PENDING: { tone: 'slate', text: 'Being prepared…' },
    UNAVAILABLE: { tone: 'red', text: 'Could not be generated' },
  }[source];
  if (!copy) return null;
  return (
    <Badge tone={copy.tone} className={className}>
      {copy.text}
    </Badge>
  );
}

export function PageHeader({ title, description, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'slate' }) {
  const toneClass = { slate: 'text-slate-900', red: 'text-red-700', green: 'text-emerald-700' }[tone];
  return (
    <div className="card p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tracking-tight ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Field({ label, hint, error, children, required }) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export const LinkButton = ({ to, children, className = 'btn-primary' }) => (
  <Link to={to} className={className}>
    {children}
  </Link>
);

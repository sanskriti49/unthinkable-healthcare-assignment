import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  XCircle,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Info,
  ShieldCheck,
  AlertCircle,
  FileQuestion,
} from 'lucide-react';

/** Loading spinner with clean medical brand styling */
export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 text-slate-500 ${className}`} role="status">
      <div className="relative flex items-center justify-center">
        <div className="w-9 h-9 rounded-full border-2 border-brand-100 border-t-brand-600 animate-spin" />
        <div className="absolute w-4 h-4 rounded-full bg-brand-50" />
      </div>
      <span className="text-sm font-medium text-slate-600">{label}</span>
    </div>
  );
}

/** Error banner with clear error diagnosis and retry */
export function ErrorBanner({ error, onRetry, className = '' }) {
  if (!error) return null;
  const details = Array.isArray(error.details) ? error.details : null;

  return (
    <div className={`rounded-xl border border-red-200 bg-red-50/90 p-4 text-red-900 shadow-sm ${className}`} role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{error.message ?? 'An unexpected error occurred'}</p>
          {details && details.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-700">
              {details.map((d, i) => (
                <li key={i}>
                  {d.field && d.field !== '(root)' ? <span className="font-semibold">{d.field}: </span> : null}
                  {d.message}
                </li>
              ))}
            </ul>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-xs hover:bg-red-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Empty state component with customizable icon, title, description, and action */
export function EmptyState({ icon: Icon = FileQuestion, title, description, action, className = '' }) {
  return (
    <div className={`card flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 border border-slate-200/60 shadow-xs">
        <Icon className="w-6 h-6" />
      </div>
      <div className="max-w-md">
        <p className="font-semibold text-slate-800 text-base">{title}</p>
        {description && <p className="mt-1 text-sm text-slate-500 leading-relaxed">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const BADGE_CONFIG = {
  slate: {
    bg: 'bg-slate-100/90 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
  green: {
    bg: 'bg-emerald-50 text-emerald-800 border-emerald-200/70',
    dot: 'bg-emerald-500',
  },
  amber: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200/70',
    dot: 'bg-amber-500',
  },
  red: {
    bg: 'bg-red-50 text-red-800 border-red-200/70',
    dot: 'bg-red-500',
  },
  blue: {
    bg: 'bg-sky-50 text-sky-800 border-sky-200/70',
    dot: 'bg-sky-500',
  },
  brand: {
    bg: 'bg-teal-50 text-teal-900 border-teal-200/80 font-semibold',
    dot: 'bg-teal-600',
  },
  purple: {
    bg: 'bg-purple-50 text-purple-800 border-purple-200/70',
    dot: 'bg-purple-500',
  },
};

export function Badge({ tone = 'slate', children, dot = true, className = '' }) {
  const cfg = BADGE_CONFIG[tone] || BADGE_CONFIG.slate;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight shadow-2xs ${cfg.bg} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />}
      {children}
    </span>
  );
}

const STATUS_CONFIG = {
  BOOKED: { tone: 'green', label: 'Confirmed', icon: CheckCircle2 },
  HELD: { tone: 'amber', label: 'Hold Active', icon: Clock },
  COMPLETED: { tone: 'blue', label: 'Completed', icon: CheckCircle2 },
  CANCELLED: { tone: 'red', label: 'Cancelled', icon: XCircle },
  EXPIRED: { tone: 'slate', label: 'Expired', icon: Clock },
  NO_SHOW: { tone: 'red', label: 'No Show', icon: AlertTriangle },
};

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { tone: 'slate', label: String(status || '').toLowerCase() };
  return (
    <Badge tone={cfg.tone}>
      {cfg.label}
    </Badge>
  );
}

const URGENCY_CONFIG = {
  HIGH: { tone: 'red', label: 'High Urgency', border: 'border-red-300' },
  MEDIUM: { tone: 'amber', label: 'Medium Urgency', border: 'border-amber-300' },
  LOW: { tone: 'green', label: 'Low Urgency', border: 'border-emerald-300' },
};

export function UrgencyBadge({ urgency }) {
  if (!urgency) return null;
  const cfg = URGENCY_CONFIG[urgency] || { tone: 'slate', label: urgency };
  return (
    <Badge tone={cfg.tone} className="font-semibold">
      {cfg.label}
    </Badge>
  );
}

/**
 * Clearly tags AI-generated output vs deterministic fallback
 */
export function SourceNote({ source, className = '' }) {
  if (!source) return null;
  
  if (source === 'LLM') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 shadow-2xs ${className}`}>
        <Sparkles className="w-3.5 h-3.5 text-teal-600 animate-pulse-subtle" />
        AI-Generated Summary
      </span>
    );
  }
  
  if (source === 'HEURISTIC') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ${className}`}>
        <Info className="w-3.5 h-3.5 text-amber-600" />
        AI Fallback (Automated Rule-Based)
      </span>
    );
  }

  if (source === 'PENDING') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 ${className}`}>
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        Generating summary…
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs text-red-700 ${className}`}>
      <AlertCircle className="w-3.5 h-3.5" />
      Generation Failed
    </span>
  );
}

/** Top page header with title, subtitle, and action buttons */
export function PageHeader({ title, description, badge, action, icon: Icon }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 pb-2 border-b border-slate-200/60">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200/60 shadow-2xs">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

/** Stat card with clean elevation, typography, and optional icon */
export function Stat({ label, value, hint, icon: Icon, tone = 'slate', trend }) {
  const toneText = {
    slate: 'text-slate-900',
    red: 'text-red-700',
    green: 'text-emerald-700',
    brand: 'text-teal-800',
  }[tone] || 'text-slate-900';

  const toneBg = {
    slate: 'bg-slate-100 text-slate-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-600',
    brand: 'bg-teal-50 text-teal-700',
  }[tone] || 'bg-slate-100 text-slate-600';

  return (
    <div className="card p-5 card-hover relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className={`mt-2 text-3xl font-extrabold tracking-tight ${toneText}`}>{value}</p>
        </div>
        {Icon && (
          <div className={`grid h-10 w-10 place-items-center rounded-xl border border-black/5 ${toneBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      {(hint || trend) && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
          <span>{hint}</span>
          {trend && <span className="font-medium text-emerald-600">{trend}</span>}
        </div>
      )}
    </div>
  );
}

/** Form Field with standard label, required indicator, hint and error message */
export function Field({ label, hint, error, children, required, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-1 text-red-500 font-bold">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
    </div>
  );
}

export const LinkButton = ({ to, children, className = 'btn-primary', icon: Icon }) => (
  <Link to={to} className={className}>
    {Icon && <Icon className="w-4 h-4 shrink-0" />}
    {children}
  </Link>
);

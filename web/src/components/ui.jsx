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

/** Loading spinner with clean medical styling */
export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2.5 py-12 text-slate-400 ${className}`} role="status">
      <div className="w-7 h-7 rounded-full border-2 border-slate-200 border-t-teal-600 animate-spin" />
      <span className="text-xs font-medium text-slate-500">{label}</span>
    </div>
  );
}

/** Error banner with clear error diagnosis and retry */
export function ErrorBanner({ error, onRetry, className = '' }) {
  if (!error) return null;
  const details = Array.isArray(error.details) ? error.details : null;

  return (
    <div className={`rounded-xl border border-red-200/80 bg-red-50/80 p-3.5 text-red-900 text-xs ${className}`} role="alert">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{error.message ?? 'An error occurred'}</p>
          {details && details.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-2xs text-red-700">
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
              className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-2xs font-semibold text-red-700 hover:bg-red-50"
            >
              <RefreshCw className="w-3 h-3" />
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
    <div className={`card flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center ${className}`}>
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-400 border border-slate-200/70">
        <Icon className="w-5 h-5" />
      </div>
      <div className="max-w-sm">
        <p className="font-semibold text-slate-800 text-sm">{title}</p>
        {description && <p className="mt-1 text-xs text-slate-500 leading-relaxed">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

const BADGE_CONFIG = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200/70',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  amber: 'bg-amber-50 text-amber-800 border-amber-200/70',
  red: 'bg-red-50 text-red-700 border-red-200/70',
  blue: 'bg-sky-50 text-sky-700 border-sky-200/70',
  brand: 'bg-teal-50 text-teal-800 border-teal-200/80',
  purple: 'bg-purple-50 text-purple-700 border-purple-200/70',
};

export function Badge({ tone = 'slate', children, className = '' }) {
  const toneClass = BADGE_CONFIG[tone] || BADGE_CONFIG.slate;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none ${toneClass} ${className}`}
    >
      {children}
    </span>
  );
}

const STATUS_CONFIG = {
  BOOKED: { tone: 'green', label: 'Confirmed' },
  HELD: { tone: 'amber', label: 'Hold Active' },
  COMPLETED: { tone: 'slate', label: 'Completed' },
  CANCELLED: { tone: 'red', label: 'Cancelled' },
  EXPIRED: { tone: 'slate', label: 'Expired' },
  NO_SHOW: { tone: 'red', label: 'No Show' },
};

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { tone: 'slate', label: String(status || '').toLowerCase() };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

const URGENCY_CONFIG = {
  HIGH: { tone: 'red', label: 'High Urgency' },
  MEDIUM: { tone: 'amber', label: 'Medium Urgency' },
  LOW: { tone: 'slate', label: 'Low Urgency' },
};

export function UrgencyBadge({ urgency }) {
  if (!urgency) return null;
  const cfg = URGENCY_CONFIG[urgency] || { tone: 'slate', label: urgency };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

/**
 * Clearly tags AI-generated output vs deterministic fallback
 */
export function SourceNote({ source, className = '' }) {
  if (!source) return null;
  
  if (source === 'LLM') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800 ${className}`}>
        <Sparkles className="w-3 h-3 text-teal-600" />
        AI-Generated
      </span>
    );
  }
  
  if (source === 'HEURISTIC') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ${className}`}>
        <Info className="w-3 h-3 text-slate-500" />
        Rule-Based Fallback
      </span>
    );
  }

  if (source === 'PENDING') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 ${className}`}>
        <Clock className="w-3 h-3 text-slate-400" />
        Generating…
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] text-red-700 ${className}`}>
      <AlertCircle className="w-3 h-3" />
      Failed
    </span>
  );
}

/** Top page header with title, subtitle, and action buttons */
export function PageHeader({ title, description, badge, action, icon: Icon }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200/60">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200/60">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
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
    slate: 'bg-slate-50 text-slate-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-600',
    brand: 'bg-teal-50 text-teal-700',
  }[tone] || 'bg-slate-50 text-slate-600';

  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className={`mt-1.5 text-2xl font-bold tracking-tight ${toneText}`}>{value}</p>
        </div>
        {Icon && (
          <div className={`grid h-9 w-9 place-items-center rounded-xl border border-slate-100 ${toneBg}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      {(hint || trend) && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-400">
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
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
    </div>
  );
}

export const LinkButton = ({ to, children, className = 'btn-primary', icon: Icon }) => (
  <Link to={to} className={className}>
    {Icon && <Icon className="w-4 h-4 shrink-0" />}
    {children}
  </Link>
);

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Badge, ErrorBanner, PageHeader, Spinner, Stat } from '../../components/ui.jsx';
import {
  Activity,
  Users,
  UserCheck,
  Calendar,
  Zap,
  Sparkles,
  Mail,
  CalendarDays,
  ShieldCheck,
  ArrowRight,
  Plus,
  Server,
  AlertTriangle,
} from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/stats').then(setStats).catch(setError);
  }, []);

  if (error) return <ErrorBanner error={error} />;
  if (!stats) return <Spinner label="Loading clinic administration metrics…" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Administration Console"
        description="System health, doctor management, background queue monitoring, and third-party integrations."
        icon={Activity}
        action={
          <div className="flex items-center gap-2">
            <Link to="/admin/doctors/new" className="btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" />
              Add Doctor Profile
            </Link>
            <Link to="/admin/operations" className="btn-secondary text-xs">
              <Zap className="w-3.5 h-3.5" />
              Operations Queue
            </Link>
          </div>
        }
      />

      {/* Main KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Active Doctors"
          value={stats.doctors}
          hint="Managing schedules & leave"
          icon={Users}
          tone="brand"
        />
        <Stat
          label="Registered Patients"
          value={stats.patients}
          hint="Active user accounts"
          icon={UserCheck}
          tone="slate"
        />
        <Stat
          label="Upcoming Appointments"
          value={stats.upcomingAppointments}
          hint="Guarded under concurrency"
          icon={Calendar}
          tone="green"
        />
        <Stat
          label="Booked (Last 24h)"
          value={stats.bookedLast24h}
          hint="Recent clinic traffic"
          icon={Activity}
          tone="brand"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Background Jobs Queue Card */}
        <section className="card p-6 border-slate-200/80 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-teal-600" />
              Postgres Worker Queue
            </h2>
            <Link to="/admin/operations" className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1">
              <span>View Logs</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            Asynchronous background workers handle email deliveries, Claude AI summaries, medication reminders, and hold expiry.
          </p>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Pending', stats.jobs.pending, 'slate'],
              ['Running', stats.jobs.running, 'blue'],
              ['Succeeded', stats.jobs.succeeded, 'green'],
              ['Failed (DLQ)', stats.jobs.failed, stats.jobs.failed > 0 ? 'red' : 'slate'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-center">
                <dt className="text-2xs font-semibold text-slate-500 uppercase tracking-wider">{label}</dt>
                <dd className="mt-1">
                  <Badge tone={tone}>{value}</Badge>
                </dd>
              </div>
            ))}
          </dl>

          {stats.jobs.failed > 0 ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>
                  <strong>{stats.jobs.failed} job(s)</strong> exhausted retries and landed in the dead-letter queue.
                </span>
              </div>
              <Link to="/admin/operations" className="font-bold text-red-900 hover:underline shrink-0">
                Inspect DLQ →
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-2xs text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              All background jobs processed with zero permanent dead-letters.
            </p>
          )}
        </section>

        {/* Third-Party Integrations Card */}
        <section className="card p-6 border-slate-200/80 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-teal-600" />
              Integration Adapters
            </h2>
            <Badge tone="slate">Status Monitor</Badge>
          </div>

          <ul className="space-y-3 text-xs">
            <li className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-teal-600" />
                <div>
                  <span className="font-bold text-slate-800 block">Claude AI Summaries</span>
                  <span className="text-2xs text-slate-500">Triage &amp; Care Plan Generation</span>
                </div>
              </div>
              <Badge tone={stats.integrations.llm ? 'green' : 'amber'}>
                {stats.integrations.llm ? 'Claude Active' : 'Automated Fallback'}
              </Badge>
            </li>

            <li className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-sky-600" />
                <div>
                  <span className="font-bold text-slate-800 block">Email Delivery Transport</span>
                  <span className="text-2xs text-slate-500">Confirmations &amp; Dose Reminders</span>
                </div>
              </div>
              <Badge tone={stats.integrations.email === 'smtp' ? 'green' : 'amber'}>
                {stats.integrations.email === 'smtp' ? 'SMTP Live' : 'Written to Disk (.mailbox)'}
              </Badge>
            </li>

            <li className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                <div>
                  <span className="font-bold text-slate-800 block">Google Calendar Sync</span>
                  <span className="text-2xs text-slate-500">OAuth 2.0 Event Synchronization</span>
                </div>
              </div>
              <Badge tone={stats.integrations.googleCalendar ? 'green' : 'slate'}>
                {stats.integrations.googleCalendar ? 'Configured' : 'Optional (Unconfigured)'}
              </Badge>
            </li>
          </ul>

          {!stats.integrations.llm && (
            <p className="mt-4 text-2xs text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <strong>Note:</strong> {stats.llmFallbackSummaries} summaries produced by deterministic fallback. Add{' '}
              <code className="font-mono text-slate-700 bg-slate-200/60 px-1 rounded">ANTHROPIC_API_KEY</code> in{' '}
              <code className="font-mono text-slate-700">server/.env</code> to activate Claude.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

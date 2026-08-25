import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Badge, ErrorBanner, PageHeader, Spinner, Stat } from '../../components/ui.jsx';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/stats').then(setStats).catch(setError);
  }, []);

  if (error) return <ErrorBanner error={error} />;
  if (!stats) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Clinic overview"
        action={<Link to="/admin/doctors/new" className="btn-primary">Add a doctor</Link>}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Doctors" value={stats.doctors} />
        <Stat label="Registered patients" value={stats.patients} />
        <Stat label="Upcoming appointments" value={stats.upcomingAppointments} />
        <Stat label="Booked in last 24h" value={stats.bookedLast24h} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Background jobs</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ['Pending', stats.jobs.pending, 'slate'],
              ['Running', stats.jobs.running, 'blue'],
              ['Succeeded', stats.jobs.succeeded, 'green'],
              ['Failed', stats.jobs.failed, stats.jobs.failed > 0 ? 'red' : 'slate'],
            ].map(([label, value, tone]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-0.5">
                  <Badge tone={tone}>{value}</Badge>
                </dd>
              </div>
            ))}
          </dl>

          {stats.jobs.failed > 0 && (
            <p className="mt-4 text-sm text-red-700">
              {stats.jobs.failed} job(s) exhausted their retries.{' '}
              <Link to="/admin/operations" className="font-semibold hover:underline">
                Review the dead-letter queue →
              </Link>
            </p>
          )}
          <Link to="/admin/operations" className="btn-ghost mt-3">Operations →</Link>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Integrations</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600">AI summaries</span>
              <Badge tone={stats.integrations.llm ? 'green' : 'amber'}>
                {stats.integrations.llm ? 'Configured' : 'Fallback mode'}
              </Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Email delivery</span>
              <Badge tone={stats.integrations.email === 'smtp' ? 'green' : 'amber'}>
                {stats.integrations.email === 'smtp' ? 'SMTP' : 'Written to disk'}
              </Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600">Google Calendar</span>
              <Badge tone={stats.integrations.googleCalendar ? 'green' : 'slate'}>
                {stats.integrations.googleCalendar ? 'Configured' : 'Not configured'}
              </Badge>
            </li>
          </ul>

          {!stats.integrations.llm && (
            <p className="mt-4 text-xs text-slate-500">
              {stats.llmFallbackSummaries} summaries have been produced by the deterministic fallback. Set{' '}
              <code className="rounded bg-slate-100 px-1 font-mono">ANTHROPIC_API_KEY</code> to enable AI
              summaries — no other change is needed.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateTime, relativeTime } from '../../lib/format.js';
import { Badge, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui.jsx';

const JOB_TONE = {
  PENDING: 'slate',
  RUNNING: 'blue',
  SUCCEEDED: 'green',
  FAILED: 'red',
  CANCELLED: 'slate',
};

const TABS = [
  { key: 'FAILED', label: 'Dead letter' },
  { key: 'PENDING', label: 'Queued' },
  { key: 'SUCCEEDED', label: 'Completed' },
];

/**
 * Operations view.
 *
 * The dead-letter tab is the important one: a notification that could not be
 * delivered after every retry is visible here with its full error history, and
 * can be re-queued by hand. Failures are never silently dropped.
 */
export default function AdminOperations() {
  const [tab, setTab] = useState('FAILED');
  const [jobs, setJobs] = useState(null);
  const [emails, setEmails] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setJobs(null);
    try {
      const [jobsRes, emailRes] = await Promise.all([
        api.get('/admin/jobs', { query: { status: tab, pageSize: 50 } }),
        api.get('/admin/emails', { query: { status: tab === 'RUNNING' ? undefined : tab, pageSize: 25 } }),
      ]);
      setJobs(jobsRes.jobs);
      setEmails(emailRes.emails);
    } catch (err) {
      setError(err);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(jobId) {
    try {
      await api.post(`/admin/jobs/${jobId}/retry`, {});
      await load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Operations"
        description="Background jobs and notification delivery."
        action={<button type="button" className="btn-secondary" onClick={load}>Refresh</button>}
      />

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorBanner error={error} className="mb-4" />

      <section className="mb-8">
        <h2 className="mb-3 font-semibold text-slate-900">Jobs</h2>
        {!jobs ? (
          <Spinner />
        ) : jobs.length === 0 ? (
          <EmptyState
            title={tab === 'FAILED' ? 'Nothing has failed' : 'Nothing here'}
            description={
              tab === 'FAILED'
                ? 'Every job has either succeeded or is still being retried.'
                : undefined
            }
          />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {jobs.map((job) => (
              <li key={job.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-slate-800">{job.type}</span>
                      <Badge tone={JOB_TONE[job.status]}>{job.status.toLowerCase()}</Badge>
                      <span className="text-xs text-slate-500">
                        attempt {job.attempts}/{job.maxAttempts}
                      </span>
                    </div>
                    {job.lastError && (
                      <p className="mt-1 truncate text-xs text-red-600">{job.lastError}</p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-400">
                      {job.status === 'PENDING'
                        ? `Runs ${relativeTime(job.runAt)}`
                        : formatDateTime(job.updatedAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {job.errorLog?.length > 0 && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                      >
                        {expanded === job.id ? 'Hide' : 'History'}
                      </button>
                    )}
                    {job.status === 'FAILED' && (
                      <button type="button" className="btn-secondary" onClick={() => retry(job.id)}>
                        Retry
                      </button>
                    )}
                  </div>
                </div>

                {expanded === job.id && (
                  <ol className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                    {job.errorLog.map((entry, i) => (
                      <li key={i} className="text-slate-600">
                        <span className="font-medium text-slate-800">Attempt {entry.attempt}</span>{' '}
                        <span className="text-slate-400">{formatDateTime(entry.at)}</span>
                        <p className="font-mono text-red-600">{entry.error}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">Email delivery</h2>
        {!emails ? (
          <Spinner />
        ) : emails.length === 0 ? (
          <EmptyState title="No emails in this state" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">To</th>
                  <th className="px-4 py-2 font-medium">Template</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Attempts</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emails.map((email) => (
                  <tr key={email.id}>
                    <td className="px-4 py-2 text-slate-700">{email.to}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-600">{email.template}</td>
                    <td className="px-4 py-2">
                      <Badge tone={JOB_TONE[email.status]}>{email.status.toLowerCase()}</Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{email.attempts}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {formatDateTime(email.sentAt ?? email.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

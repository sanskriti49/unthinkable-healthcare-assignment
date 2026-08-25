import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateTime, relativeTime } from '../../lib/format.js';
import { Badge, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import {
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Terminal,
  Activity,
} from 'lucide-react';

const JOB_CONFIG = {
  PENDING: { tone: 'slate', label: 'Queued' },
  RUNNING: { tone: 'blue', label: 'Processing' },
  SUCCEEDED: { tone: 'green', label: 'Succeeded' },
  FAILED: { tone: 'red', label: 'Dead-Letter' },
  CANCELLED: { tone: 'slate', label: 'Cancelled' },
};

const TABS = [
  { key: 'FAILED', label: 'Dead-Letter Queue (DLQ)', icon: AlertTriangle },
  { key: 'PENDING', label: 'Pending / Scheduled', icon: Clock },
  { key: 'SUCCEEDED', label: 'Completed Jobs', icon: CheckCircle2 },
];

export default function AdminOperations() {
  const [tab, setTab] = useState('FAILED');
  const [jobs, setJobs] = useState(null);
  const [emails, setEmails] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const { toast } = useToast();

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
    setRetrying(jobId);
    try {
      await api.post(`/admin/jobs/${jobId}/retry`, {});
      toast('Job re-queued successfully!');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Background Worker Operations"
        description="Postgres job queue monitoring, retry backoff histories, and notification delivery pipelines."
        icon={Zap}
        action={
          <button type="button" className="btn-secondary text-xs" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Queue
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1.5 rounded-xl bg-slate-200/70 p-1 max-w-xl">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                tab === t.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${tab === t.key ? 'text-teal-600' : 'text-slate-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <ErrorBanner error={error} />

      {/* Jobs Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-teal-600" />
            Background Task Stream
          </h2>
          {jobs && <span className="text-2xs text-slate-400">{jobs.length} jobs in view</span>}
        </div>

        {!jobs ? (
          <Spinner label="Loading background tasks…" />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={tab === 'FAILED' ? 'Dead-letter queue is clear' : 'No jobs in this category'}
            description={
              tab === 'FAILED'
                ? 'All jobs have succeeded or are currently progressing through scheduled retries.'
                : undefined
            }
          />
        ) : (
          <ul className="card divide-y divide-slate-100 overflow-hidden">
            {jobs.map((job) => {
              const cfg = JOB_CONFIG[job.status] || { tone: 'slate', label: job.status };
              const isExpanded = expanded === job.id;

              return (
                <li key={job.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          {job.type}
                        </span>
                        <Badge tone={cfg.tone}>{cfg.label}</Badge>
                        <span className="text-2xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Attempt {job.attempts} / {job.maxAttempts}
                        </span>
                      </div>

                      {job.lastError && (
                        <p className="mt-1.5 text-xs text-red-700 font-mono bg-red-50 p-2 rounded-lg border border-red-100 truncate">
                          {job.lastError}
                        </p>
                      )}

                      <p className="mt-1 text-2xs text-slate-400">
                        {job.status === 'PENDING'
                          ? `Scheduled for ${relativeTime(job.runAt)}`
                          : `Last updated ${formatDateTime(job.updatedAt)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {job.errorLog?.length > 0 && (
                        <button
                          type="button"
                          className="btn-ghost text-xs text-slate-600"
                          onClick={() => setExpanded(isExpanded ? null : job.id)}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" /> Hide History
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" /> Error Log ({job.errorLog.length})
                            </>
                          )}
                        </button>
                      )}

                      {job.status === 'FAILED' && (
                        <button
                          type="button"
                          className="btn-primary text-xs"
                          disabled={retrying === job.id}
                          onClick={() => retry(job.id)}
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${retrying === job.id ? 'animate-spin' : ''}`} />
                          {retrying === job.id ? 'Requeuing…' : 'Retry Job'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandable Retry History Stack */}
                  {isExpanded && (
                    <div className="mt-3 rounded-xl bg-slate-900 p-3.5 text-xs text-slate-200 shadow-inner font-mono animate-in fade-in">
                      <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 mb-2 border-b border-slate-700 pb-1">
                        Retry Backoff History &amp; Diagnostics
                      </p>
                      <ol className="space-y-2">
                        {job.errorLog.map((entry, i) => (
                          <li key={i} className="text-2xs text-slate-300">
                            <span className="text-teal-400 font-semibold">[Attempt #{entry.attempt}]</span>{' '}
                            <span className="text-slate-400">({formatDateTime(entry.at)})</span>:
                            <p className="text-red-400 pl-3 mt-0.5 whitespace-pre-wrap">{entry.error}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Email Delivery Pipeline */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Mail className="w-4 h-4 text-teal-600" />
          Email Delivery Outbox
        </h2>

        {!emails ? (
          <Spinner label="Loading outbox records…" />
        ) : emails.length === 0 ? (
          <EmptyState icon={Mail} title="No email delivery events in this state" />
        ) : (
          <div className="card overflow-x-auto border-slate-200/80 bg-white">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-left font-bold text-slate-600 uppercase tracking-wider text-2xs">
                <tr>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Email Template</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Dispatched / Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emails.map((email) => (
                  <tr key={email.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{email.to}</td>
                    <td className="px-4 py-3 font-mono text-2xs text-teal-800 font-semibold">
                      {email.template}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={JOB_CONFIG[email.status]?.tone || 'slate'}>
                        {email.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono">{email.attempts}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-2xs">
                      {formatDateTime(email.sentAt ?? email.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

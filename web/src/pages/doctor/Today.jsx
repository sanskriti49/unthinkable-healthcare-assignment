import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDate, formatDateTime, formatTime, todayKey } from '../../lib/format.js';
import {
  Badge,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  StatusBadge,
  SourceNote,
  UrgencyBadge,
} from '../../components/ui.jsx';
import ConsultationForm from './ConsultationForm.jsx';

/**
 * The doctor's working view: the day's list, each patient's AI triage summary,
 * and the form to record the consultation.
 */
export default function DoctorToday() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [regenerating, setRegenerating] = useState(null);

  const load = useCallback(
    () => api.get('/doctor/today').then(setData).catch(setError),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function regenerate(appointmentId) {
    setRegenerating(appointmentId);
    try {
      await api.post(`/doctor/appointments/${appointmentId}/pre-visit-summary/regenerate`, {});
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setRegenerating(null);
    }
  }

  if (error && !data) return <ErrorBanner error={error} onRetry={load} />;
  if (!data) return <Spinner />;

  const today = todayKey();
  const groups = data.appointments.reduce((acc, appt) => {
    const key = appt.startsAt.slice(0, 10);
    (acc[key] ??= []).push(appt);
    return acc;
  }, {});

  // Sort HIGH urgency to the top within each day — the doctor should see the
  // patient who may need attention first, not just the earliest slot.
  const URGENCY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  return (
    <>
      <PageHeader title="Your clinic" description={formatDate(`${today}T12:00:00Z`)} />
      <ErrorBanner error={error} className="mb-4" />

      {Object.keys(groups).length === 0 ? (
        <EmptyState title="No appointments" description="Nothing is booked around today." />
      ) : (
        Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, appts]) => (
            <section key={date} className="mb-8">
              <h2 className="mb-3 font-semibold text-slate-900">
                {date === today ? 'Today' : formatDate(`${date}T12:00:00Z`)}
                <span className="ml-2 text-sm font-normal text-slate-400">{appts.length} patients</span>
              </h2>

              <ul className="space-y-3">
                {[...appts]
                  .sort(
                    (a, b) =>
                      (URGENCY_RANK[a.preVisitSummary?.urgency] ?? 3) -
                        (URGENCY_RANK[b.preVisitSummary?.urgency] ?? 3) ||
                      a.startsAt.localeCompare(b.startsAt)
                  )
                  .map((appt) => {
                    const summary = appt.preVisitSummary;
                    const isOpen = openId === appt.id;

                    return (
                      <li
                        key={appt.id}
                        className={`card overflow-hidden ${
                          summary?.urgency === 'HIGH' ? 'border-l-4 border-l-red-500' : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-brand-700">
                                {formatTime(appt.startsAt)}
                              </span>
                              <h3 className="font-semibold text-slate-900">{appt.patient?.fullName}</h3>
                              <StatusBadge status={appt.status} />
                              <UrgencyBadge urgency={summary?.urgency} />
                            </div>

                            {summary ? (
                              <div className="mt-3 space-y-2">
                                <p className="text-sm font-medium text-slate-800">
                                  {summary.chiefComplaint}
                                </p>
                                <p className="text-sm whitespace-pre-wrap text-slate-600">{summary.summary}</p>

                                {summary.redFlags?.length > 0 && (
                                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                                    <p className="text-xs font-semibold text-red-800">Flagged</p>
                                    <p className="text-sm text-red-700">{summary.redFlags.join(' · ')}</p>
                                  </div>
                                )}

                                {summary.suggestedQuestions?.length > 0 && (
                                  <details className="text-sm">
                                    <summary className="cursor-pointer font-medium text-slate-700">
                                      Suggested questions
                                    </summary>
                                    <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-slate-600">
                                      {summary.suggestedQuestions.map((q, i) => (
                                        <li key={i}>{q}</li>
                                      ))}
                                    </ol>
                                  </details>
                                )}

                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <SourceNote source={summary.source} />
                                  {summary.urgencyRationale && (
                                    <span className="text-xs text-slate-500">{summary.urgencyRationale}</span>
                                  )}
                                  {summary.source === 'HEURISTIC' && (
                                    <button
                                      type="button"
                                      className="text-xs font-semibold text-brand-700 hover:underline"
                                      disabled={regenerating === appt.id}
                                      onClick={() => regenerate(appt.id)}
                                    >
                                      {regenerating === appt.id ? 'Retrying…' : 'Retry AI summary'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : appt.symptoms ? (
                              <p className="mt-2 text-sm whitespace-pre-wrap text-slate-600">{appt.symptoms}</p>
                            ) : (
                              <p className="mt-2 text-sm text-slate-400">
                                The patient did not describe their symptoms.
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-col gap-2">
                            {appt.status === 'BOOKED' && (
                              <>
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => setOpenId(isOpen ? null : appt.id)}
                                >
                                  {isOpen ? 'Close' : 'Record consultation'}
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  onClick={async () => {
                                    if (!window.confirm('Mark this patient as a no-show?')) return;
                                    await api.post(`/doctor/appointments/${appt.id}/no-show`, {}).catch(setError);
                                    load();
                                  }}
                                >
                                  No-show
                                </button>
                              </>
                            )}
                            {appt.status === 'COMPLETED' && <Badge tone="blue">Notes recorded</Badge>}
                          </div>
                        </div>

                        {isOpen && (
                          <div className="border-t border-slate-200 bg-slate-50 p-5">
                            <ConsultationForm
                              appointment={appt}
                              onDone={() => {
                                setOpenId(null);
                                load();
                              }}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))
      )}
    </>
  );
}

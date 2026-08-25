import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDate, formatTime, todayKey } from '../../lib/format.js';
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  StatusBadge,
  SourceNote,
  UrgencyBadge,
  Stat,
} from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import ConsultationForm from './ConsultationForm.jsx';
import {
  HeartPulse,
  User,
  ShieldAlert,
  CheckCircle2,
  FileText,
  Copy,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

export default function DoctorToday() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [regenerating, setRegenerating] = useState(null);
  const { toast } = useToast();

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
      toast('Triage summary regenerated.');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setRegenerating(null);
    }
  }

  const copyQuestions = (questions) => {
    if (!questions?.length) return;
    navigator.clipboard.writeText(questions.join('\n'));
    toast('Questions copied to clipboard.');
  };

  if (error && !data) return <ErrorBanner error={error} onRetry={load} />;
  if (!data) return <Spinner label="Loading clinic queue…" />;

  const today = todayKey();
  const appointments = data.appointments || [];

  const groups = appointments.reduce((acc, appt) => {
    const key = appt.startsAt.slice(0, 10);
    (acc[key] ??= []).push(appt);
    return acc;
  }, {});

  const totalPatients = appointments.length;
  const highUrgencyCount = appointments.filter(
    (a) => a.preVisitSummary?.urgency === 'HIGH' && a.status === 'BOOKED'
  ).length;
  const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;

  const URGENCY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today's Clinic Queue"
        description={`Schedule for ${formatDate(`${today}T12:00:00Z`)} with pre-visit intake triage.`}
        action={
          <button type="button" onClick={load} className="btn-secondary text-xs">
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        }
      />

      {/* Summary KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Scheduled Patients"
          value={totalPatients}
          hint="Total bookings"
          icon={User}
          tone="slate"
        />
        <Stat
          label="High Urgency"
          value={highUrgencyCount}
          hint={highUrgencyCount > 0 ? 'Requires attention' : 'No critical flags'}
          icon={ShieldAlert}
          tone={highUrgencyCount > 0 ? 'red' : 'slate'}
        />
        <Stat
          label="Completed Consultations"
          value={completedCount}
          hint={`${totalPatients - completedCount} pending`}
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      <ErrorBanner error={error} />

      {Object.keys(groups).length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="No patients scheduled"
          description="Your queue is clear. Booked appointments will appear here with intake summaries."
        />
      ) : (
        Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, appts]) => (
            <section key={date} className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  {date === today ? "Today's Appointments" : formatDate(`${date}T12:00:00Z`)}
                  <span className="text-2xs font-normal text-slate-400 ml-2">
                    ({appts.length} patients)
                  </span>
                </h2>
              </div>

              <div className="space-y-3">
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
                    const isHigh = summary?.urgency === 'HIGH';

                    return (
                      <div
                        key={appt.id}
                        className={`card overflow-hidden ${
                          isHigh ? 'border-l-4 border-l-red-500' : ''
                        }`}
                      >
                        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                          {/* Patient Details & AI Triage */}
                          <div className="flex-1 min-w-0 space-y-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                {formatTime(appt.startsAt)}
                              </span>
                              <p className="font-bold text-sm text-slate-900">{appt.patient?.fullName}</p>
                              <StatusBadge status={appt.status} />
                              <UrgencyBadge urgency={summary?.urgency} />
                            </div>

                            {summary ? (
                              <div className="space-y-2 text-xs">
                                {summary.chiefComplaint && (
                                  <p className="text-slate-800">
                                    <span className="text-slate-400 font-medium">Chief Complaint: </span>
                                    <span className="font-semibold">{summary.chiefComplaint}</span>
                                  </p>
                                )}

                                <p className="text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded border border-slate-100 whitespace-pre-wrap">
                                  {summary.summary}
                                </p>

                                {summary.redFlags?.length > 0 && (
                                  <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                                    <span className="font-semibold flex items-center gap-1">
                                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                      Red Flags:
                                    </span>
                                    <span className="mt-0.5 block">{summary.redFlags.join(' · ')}</span>
                                  </div>
                                )}

                                {summary.suggestedQuestions?.length > 0 && (
                                  <div className="rounded bg-white border border-slate-200 p-2.5">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Suggested Intake Questions
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => copyQuestions(summary.suggestedQuestions)}
                                        className="text-2xs text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1"
                                      >
                                        <Copy className="w-3 h-3" /> Copy
                                      </button>
                                    </div>
                                    <ol className="list-decimal pl-4 space-y-0.5 text-slate-700 text-xs">
                                      {summary.suggestedQuestions.map((q, i) => (
                                        <li key={i}>{q}</li>
                                      ))}
                                    </ol>
                                  </div>
                                )}

                                <div className="flex items-center gap-2 pt-1">
                                  <SourceNote source={summary.source} />
                                  {summary.source === 'HEURISTIC' && (
                                    <button
                                      type="button"
                                      className="text-2xs font-medium text-teal-700 hover:underline inline-flex items-center gap-1"
                                      disabled={regenerating === appt.id}
                                      onClick={() => regenerate(appt.id)}
                                    >
                                      <RefreshCw className={`w-3 h-3 ${regenerating === appt.id ? 'animate-spin' : ''}`} />
                                      Retry AI summary
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : appt.symptoms ? (
                              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
                                {appt.symptoms}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400 italic">No pre-visit symptoms submitted.</p>
                            )}
                          </div>

                          {/* Action Button */}
                          <div className="flex lg:flex-col shrink-0 gap-2 items-end justify-between border-t lg:border-t-0 pt-2 lg:pt-0 border-slate-100">
                            {appt.status === 'BOOKED' && (
                              <>
                                <button
                                  type="button"
                                  className="btn-primary text-xs"
                                  onClick={() => setOpenId(isOpen ? null : appt.id)}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  {isOpen ? 'Close Form' : 'Record Consultation'}
                                </button>
                                <button
                                  type="button"
                                  className="text-2xs text-slate-400 hover:text-red-600"
                                  onClick={async () => {
                                    if (!window.confirm('Mark patient as no-show?')) return;
                                    await api.post(`/doctor/appointments/${appt.id}/no-show`, {}).catch(setError);
                                    toast('Marked as no-show');
                                    load();
                                  }}
                                >
                                  Mark No-show
                                </button>
                              </>
                            )}
                            {appt.status === 'COMPLETED' && (
                              <span className="text-xs text-slate-400 font-medium">Completed</span>
                            )}
                          </div>
                        </div>

                        {/* Consultation Recording Form Drawer */}
                        {isOpen && (
                          <div className="border-t border-slate-200 bg-slate-50 p-4 sm:p-5">
                            <div className="mb-3 flex items-center justify-between">
                              <h4 className="text-xs font-semibold text-slate-900">
                                Consultation Record for {appt.patient?.fullName}
                              </h4>
                              <button
                                type="button"
                                onClick={() => setOpenId(null)}
                                className="text-xs text-slate-500 hover:text-slate-800"
                              >
                                Cancel
                              </button>
                            </div>

                            <ConsultationForm
                              appointment={appt}
                              onDone={() => {
                                setOpenId(null);
                                toast('Consultation recorded successfully.');
                                load();
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          ))
      )}
    </div>
  );
}

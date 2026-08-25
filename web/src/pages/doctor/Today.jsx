import React, { useCallback, useEffect, useState } from 'react';
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
  Stat,
} from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import ConsultationForm from './ConsultationForm.jsx';
import {
  HeartPulse,
  Clock,
  User,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  FileText,
  Copy,
  RefreshCw,
  HelpCircle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
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
      toast('AI triage summary regenerated successfully!');
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
    toast('Suggested questions copied to clipboard!');
  };

  if (error && !data) return <ErrorBanner error={error} onRetry={load} />;
  if (!data) return <Spinner label="Loading today's clinic schedule…" />;

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
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Doctor's Clinical Queue"
        description={`Clinic schedule for ${formatDate(`${today}T12:00:00Z`)} with AI symptom triage.`}
        icon={HeartPulse}
        action={
          <button type="button" onClick={load} className="btn-secondary text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Queue
          </button>
        }
      />

      {/* Top Clinical Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Total Scheduled"
          value={totalPatients}
          hint="Patients booked around today"
          icon={User}
          tone="brand"
        />
        <Stat
          label="High Urgency Triage"
          value={highUrgencyCount}
          hint={highUrgencyCount > 0 ? 'Requires priority attention' : 'No critical flags'}
          icon={ShieldAlert}
          tone={highUrgencyCount > 0 ? 'red' : 'green'}
        />
        <Stat
          label="Consultations Recorded"
          value={completedCount}
          hint={`${totalPatients - completedCount} remaining`}
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      <ErrorBanner error={error} />

      {Object.keys(groups).length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="No patients scheduled"
          description="Your clinic queue is clear for today. Patients who book will appear here with AI triage summaries."
        />
      ) : (
        Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, appts]) => (
            <section key={date} className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>{date === today ? "Today's Appointments" : formatDate(`${date}T12:00:00Z`)}</span>
                  <span className="text-2xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {appts.length} patients
                  </span>
                </h2>
              </div>

              <ul className="space-y-4">
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
                      <li
                        key={appt.id}
                        className={`card overflow-hidden transition-all ${
                          isHigh
                            ? 'border-l-4 border-l-red-500 bg-gradient-to-r from-red-50/20 via-white to-white'
                            : 'border-slate-200/80 bg-white'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 p-5">
                          {/* Left: Patient Details & Triage */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200/40">
                                {formatTime(appt.startsAt)}
                              </span>
                              <h3 className="font-bold text-base text-slate-900">{appt.patient?.fullName}</h3>
                              <StatusBadge status={appt.status} />
                              <UrgencyBadge urgency={summary?.urgency} />
                            </div>

                            {summary ? (
                              <div className="mt-3.5 space-y-2.5">
                                {/* Chief Complaint */}
                                {summary.chiefComplaint && (
                                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                    <span className="text-slate-400 font-normal">Chief Complaint:</span>
                                    <span>{summary.chiefComplaint}</span>
                                  </div>
                                )}

                                {/* Symptom Brief */}
                                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/80 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap">
                                  {summary.summary}
                                </p>

                                {/* Flagged Red Flags */}
                                {summary.redFlags?.length > 0 && (
                                  <div className="rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs text-red-900 shadow-2xs">
                                    <p className="font-bold text-red-800 flex items-center gap-1.5 mb-1">
                                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                      Flagged Risk Factors / Red Flags
                                    </p>
                                    <p className="text-red-700 font-medium pl-5">{summary.redFlags.join(' · ')}</p>
                                  </div>
                                )}

                                {/* Suggested Questions */}
                                {summary.suggestedQuestions?.length > 0 && (
                                  <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                                        <HelpCircle className="w-3.5 h-3.5 text-teal-600" />
                                        Suggested Questions for Clinician
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => copyQuestions(summary.suggestedQuestions)}
                                        className="text-2xs text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1"
                                      >
                                        <Copy className="w-3 h-3" /> Copy
                                      </button>
                                    </div>
                                    <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-700">
                                      {summary.suggestedQuestions.map((q, i) => (
                                        <li key={i}>{q}</li>
                                      ))}
                                    </ol>
                                  </div>
                                )}

                                {/* Source & Meta */}
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <SourceNote source={summary.source} />
                                  {summary.urgencyRationale && (
                                    <span className="text-2xs text-slate-500 italic">
                                      Rationale: {summary.urgencyRationale}
                                    </span>
                                  )}
                                  {summary.source === 'HEURISTIC' && (
                                    <button
                                      type="button"
                                      className="text-2xs font-bold text-teal-700 hover:underline flex items-center gap-1"
                                      disabled={regenerating === appt.id}
                                      onClick={() => regenerate(appt.id)}
                                    >
                                      <RefreshCw className={`w-3 h-3 ${regenerating === appt.id ? 'animate-spin' : ''}`} />
                                      {regenerating === appt.id ? 'Regenerating…' : 'Retry AI summary'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : appt.symptoms ? (
                              <p className="mt-2 text-xs whitespace-pre-wrap text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                                {appt.symptoms}
                              </p>
                            ) : (
                              <p className="mt-2 text-xs text-slate-400 italic">
                                Patient did not describe symptoms in advance.
                              </p>
                            )}
                          </div>

                          {/* Right: Actions */}
                          <div className="flex lg:flex-col shrink-0 gap-2 items-end justify-between border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-100">
                            {appt.status === 'BOOKED' && (
                              <>
                                <button
                                  type="button"
                                  className="btn-primary text-xs w-full justify-center"
                                  onClick={() => setOpenId(isOpen ? null : appt.id)}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  {isOpen ? 'Close Form' : 'Record Consultation'}
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost text-xs text-slate-500 hover:text-red-700"
                                  onClick={async () => {
                                    if (!window.confirm('Mark this patient as a no-show?')) return;
                                    await api.post(`/doctor/appointments/${appt.id}/no-show`, {}).catch(setError);
                                    toast('Marked as no-show', 'warning');
                                    load();
                                  }}
                                >
                                  Mark No-show
                                </button>
                              </>
                            )}
                            {appt.status === 'COMPLETED' && (
                              <Badge tone="blue">Consultation Recorded</Badge>
                            )}
                          </div>
                        </div>

                        {/* Consultation Recording Form Drawer */}
                        {isOpen && (
                          <div className="border-t border-slate-200 bg-slate-50/80 p-5 sm:p-6 animate-in slide-in-from-top-2">
                            <div className="mb-4 flex items-center justify-between">
                              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-teal-600" />
                                Record Consultation &amp; Prescribe for {appt.patient?.fullName}
                              </h4>
                              <button
                                type="button"
                                onClick={() => setOpenId(null)}
                                className="btn-ghost text-xs"
                              >
                                Close
                              </button>
                            </div>

                            <ConsultationForm
                              appointment={appt}
                              onDone={() => {
                                setOpenId(null);
                                toast('Consultation recorded! Post-visit summary and reminders scheduled.');
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
    </div>
  );
}

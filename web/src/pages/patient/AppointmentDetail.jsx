import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api.js';
import { addDaysKey, formatDate, formatDateTime, formatTime, todayKey } from '../../lib/format.js';
import {
  Badge,
  ErrorBanner,
  PageHeader,
  Spinner,
  StatusBadge,
  SourceNote,
} from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import {
  Calendar,
  Clock,
  Stethoscope,
  Pill,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  CalendarCheck,
  FileText,
  MapPin,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  Info,
} from 'lucide-react';

export default function PatientAppointmentDetail() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [appointment, setAppointment] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [slots, setSlots] = useState(null);

  const load = useCallback(async () => {
    try {
      const { appointment: appt } = await api.get(`/appointments/${appointmentId}`);
      setAppointment(appt);

      if (appt.status === 'COMPLETED') {
        try {
          const { summary: s } = await api.get(`/patient/appointments/${appointmentId}/summary`);
          setSummary(s);
        } catch {
          // Summary might still be generating in background
        }
      }
    } catch (err) {
      setError(err);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (appointment?.status !== 'COMPLETED' || summary) return undefined;
    const timer = setInterval(load, 4000);
    const stop = setTimeout(() => clearInterval(timer), 40_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [appointment?.status, summary, load]);

  async function cancel() {
    if (!window.confirm('Cancel this appointment? Your doctor will be notified immediately.')) return;
    setBusy(true);
    try {
      await api.post(`/appointments/${appointmentId}/cancel`, {});
      toast('Appointment cancelled.', 'info');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function openReschedule() {
    setRescheduling(true);
    setSlots(null);
    try {
      const { days } = await api.get(`/doctors/${appointment.doctor.id}/availability`, {
        query: { from: todayKey(), to: addDaysKey(todayKey(), 20) },
      });
      setSlots(days.filter((d) => d.slots.length > 0));
    } catch (err) {
      setError(err);
    }
  }

  async function moveTo(startsAt) {
    setBusy(true);
    setError(null);
    try {
      const { appointment: created } = await api.post(`/appointments/${appointmentId}/reschedule`, {
        newStartsAt: startsAt,
      });
      setRescheduling(false);
      toast('Appointment rescheduled successfully!');
      navigate(`/patient/appointments/${created.id}`, { replace: true });
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') openReschedule();
    } finally {
      setBusy(false);
    }
  }

  if (error && !appointment) return <ErrorBanner error={error} onRetry={load} />;
  if (!appointment) return <Spinner label="Loading consultation details…" />;

  const canChange = appointment.status === 'BOOKED';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <Link to="/patient/appointments" className="btn-ghost text-xs">
          <ArrowLeft className="w-4 h-4" />
          Back to All Appointments
        </Link>
        <StatusBadge status={appointment.status} />
      </div>

      {location.state?.justBooked && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-xs flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-emerald-950">Appointment confirmed!</p>
            <p className="text-xs text-emerald-800 mt-0.5">
              A confirmation email has been dispatched, and a pre-visit symptom brief is ready for Dr. {appointment.doctor?.fullName}.
            </p>
          </div>
        </div>
      )}

      {/* Doctor & Appointment Hero */}
      <div className="card p-6 border-slate-200/80 bg-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 font-bold border border-teal-200/60 shadow-xs">
              <Stethoscope className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Dr. {appointment.doctor?.fullName}</h1>
              <p className="text-sm font-semibold text-teal-700">{appointment.doctor?.specialisation}</p>
              {appointment.doctor?.roomNumber && (
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Consultation Room {appointment.doctor?.roomNumber}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-left sm:text-right">
            <span className="text-2xs text-slate-400 block font-medium">Scheduled Time</span>
            <span className="text-sm font-bold text-slate-900">{formatDateTime(appointment.startsAt)}</span>
          </div>
        </div>
      </div>

      <ErrorBanner error={error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Main Appointment Metadata */}
          <section className="card p-6 border-slate-200/80 bg-white">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-teal-600" />
              Appointment Overview
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 rounded-xl bg-slate-50/70 p-4 border border-slate-100">
              <div>
                <dt className="text-2xs font-semibold uppercase tracking-wider text-slate-400">Date &amp; Time</dt>
                <dd className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(appointment.startsAt)}</dd>
              </div>
              <div>
                <dt className="text-2xs font-semibold uppercase tracking-wider text-slate-400">Clinic Room</dt>
                <dd className="mt-1 text-sm font-medium text-slate-800">
                  {appointment.doctor?.roomNumber ? `Room ${appointment.doctor.roomNumber}` : 'General OPD'}
                </dd>
              </div>
              {appointment.cancelledAt && (
                <div className="sm:col-span-2 border-t border-slate-200/60 pt-3">
                  <dt className="text-2xs font-semibold uppercase tracking-wider text-red-500">Cancelled On</dt>
                  <dd className="mt-1 text-xs text-red-700 font-medium">
                    {formatDateTime(appointment.cancelledAt)}
                    {appointment.cancelReason === 'DOCTOR_LEAVE'
                      ? ' — Doctor marked on scheduled leave (notification sent)'
                      : appointment.cancelReason === 'RESCHEDULED'
                        ? ' — Rescheduled to a new time'
                        : ''}
                  </dd>
                </div>
              )}
            </div>

            {appointment.symptoms && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Symptoms Described by You
                </p>
                <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 border border-slate-100">
                  {appointment.symptoms}
                </p>
              </div>
            )}

            {canChange && (
              <div className="mt-6 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={openReschedule}
                  disabled={busy}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reschedule Time Slot
                </button>
                <button
                  type="button"
                  className="btn-danger text-xs"
                  onClick={cancel}
                  disabled={busy}
                >
                  Cancel Appointment
                </button>
              </div>
            )}
          </section>

          {/* Reschedule Drawer/Box */}
          {rescheduling && (
            <section className="card p-6 border-teal-200 bg-teal-50/40 shadow-md animate-in slide-in-from-top-2">
              <div className="mb-4 flex items-center justify-between border-b border-teal-200/60 pb-3">
                <h3 className="font-bold text-sm text-teal-950 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-teal-700" />
                  Select a New Appointment Time
                </h3>
                <button type="button" className="btn-ghost text-xs" onClick={() => setRescheduling(false)}>
                  Close
                </button>
              </div>

              {!slots ? (
                <Spinner label="Checking new slot availability…" />
              ) : slots.length === 0 ? (
                <p className="text-xs text-slate-500">No other open slots in the next 3 weeks.</p>
              ) : (
                <div className="space-y-4">
                  {slots.map((day) => (
                    <div key={day.date} className="rounded-xl bg-white p-3.5 border border-slate-200 shadow-2xs">
                      <p className="mb-2 text-xs font-bold text-slate-800">{formatDate(`${day.date}T12:00:00Z`)}</p>
                      <div className="flex flex-wrap gap-2">
                        {day.slots.map((slot) => (
                          <button
                            key={slot.startsAt}
                            type="button"
                            disabled={busy}
                            onClick={() => moveTo(slot.startsAt)}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-900 transition-all cursor-pointer"
                          >
                            {formatTime(slot.startsAt)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Post-Visit Care Plan & AI Summary (when COMPLETED) */}
          {appointment.status === 'COMPLETED' && (
            <section className="card p-6 border-teal-100 bg-white shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  Post-Visit Care Plan
                </h2>
                <SourceNote source={summary?.source} />
              </div>

              {!summary ? (
                <div className="py-6 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                  <Spinner label="Your doctor's notes are being summarized..." />
                </div>
              ) : (
                <div className="space-y-5">
                  {summary.patientSummary && (
                    <div className="rounded-xl bg-teal-50/60 p-4 border border-teal-100 text-xs leading-relaxed text-teal-950 whitespace-pre-wrap">
                      <p className="font-bold text-teal-900 mb-1">Doctor's Consultation Summary</p>
                      {summary.patientSummary}
                    </div>
                  )}

                  {summary.careInstructions?.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                        Care Instructions &amp; Action Steps
                      </h3>
                      <ul className="space-y-1.5 pl-1">
                        {summary.careInstructions.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summary.warningSigns?.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                      <h3 className="text-xs font-bold text-amber-900 mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        When to Seek Medical Attention Sooner:
                      </h3>
                      <ul className="space-y-1 pl-1">
                        {summary.warningSigns.map((item, i) => (
                          <li key={i} className="text-xs text-amber-800 flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summary.followUpInDays && (
                    <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-700">
                        Recommended follow-up in <strong>{summary.followUpInDays} days</strong>.
                      </span>
                      <Link to="/patient/find" className="btn-primary py-1 px-3 text-xs">
                        Book Follow-up Slot →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Sidebar: Medications & Raw Prescription */}
        <div className="space-y-6">
          {summary?.medications?.length > 0 && (
            <section className="card p-6 border-slate-200/80 bg-white">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-3">
                <Pill className="w-4 h-4 text-teal-600" />
                Prescribed Medications
              </h2>

              <ul className="space-y-4 divide-y divide-slate-100">
                {summary.medications.map((med) => (
                  <li key={med.id} className="pt-3 first:pt-0">
                    <p className="font-bold text-sm text-slate-900">{med.name}</p>
                    <p className="text-xs text-teal-800 font-medium">
                      {[med.dosage, med.frequency].filter(Boolean).join(' · ')}
                    </p>
                    {med.instructions && (
                      <p className="text-2xs text-slate-500 mt-0.5">{med.instructions}</p>
                    )}

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {med.timesOfDay.map((t) => (
                        <Badge key={t} tone="brand">{t}</Badge>
                      ))}
                      <Badge tone="slate">{med.durationDays} days</Badge>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-5 pt-3 border-t border-slate-100 text-center">
                <Link to="/patient/medications" className="btn-secondary w-full text-xs justify-center">
                  View Full Medication Schedule →
                </Link>
              </div>
            </section>
          )}

          {summary?.prescriptionText && (
            <section className="card p-6 border-slate-200/80 bg-white">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Prescription as Written
              </h3>
              <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-2xs whitespace-pre-wrap text-slate-700 border border-slate-100">
                {summary.prescriptionText}
              </pre>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

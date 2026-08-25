import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api.js';
import { addDaysKey, formatDate, formatDateTime, formatTime, todayKey } from '../../lib/format.js';
import {
  Badge,
  ErrorBanner,
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
  FileText,
  MapPin,
  RefreshCw,
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
    if (!window.confirm('Cancel this appointment? Your doctor will be notified.')) return;
    setBusy(true);
    try {
      await api.post(`/appointments/${appointmentId}/cancel`, {});
      toast('Appointment cancelled.');
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
      toast('Appointment rescheduled successfully.');
      navigate(`/patient/appointments/${created.id}`, { replace: true });
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') openReschedule();
    } finally {
      setBusy(false);
    }
  }

  if (error && !appointment) return <ErrorBanner error={error} onRetry={load} />;
  if (!appointment) return <Spinner label="Loading appointment details…" />;

  const canChange = appointment.status === 'BOOKED';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to="/patient/appointments" className="btn-ghost text-xs inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          All appointments
        </Link>
        <StatusBadge status={appointment.status} />
      </div>

      {location.state?.justBooked && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-900">Appointment Confirmed</p>
            <p className="text-emerald-800 mt-0.5">
              Your consultation with Dr. {appointment.doctor?.fullName} has been booked.
            </p>
          </div>
        </div>
      )}

      {/* Doctor & Appointment Header Card */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-medium border border-teal-200/60">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Dr. {appointment.doctor?.fullName}</h1>
              <p className="text-xs text-teal-700 font-medium">{appointment.doctor?.specialisation}</p>
              {appointment.doctor?.roomNumber && (
                <p className="text-xs text-slate-400 mt-0.5">Room {appointment.doctor?.roomNumber}</p>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-2xs text-slate-400 block font-medium">Scheduled Time</span>
            <span className="text-xs font-semibold text-slate-900">{formatDateTime(appointment.startsAt)}</span>
          </div>
        </div>
      </div>

      <ErrorBanner error={error} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Main Appointment Details */}
          <section className="card p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Appointment Details
            </h2>

            <div className="grid gap-3 sm:grid-cols-2 rounded-lg bg-slate-50 p-3.5 border border-slate-100 text-xs">
              <div>
                <dt className="text-2xs text-slate-400 font-medium">Date &amp; Time</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{formatDateTime(appointment.startsAt)}</dd>
              </div>
              <div>
                <dt className="text-2xs text-slate-400 font-medium">Location</dt>
                <dd className="font-medium text-slate-800 mt-0.5">
                  {appointment.doctor?.roomNumber ? `Room ${appointment.doctor.roomNumber}` : 'General OPD'}
                </dd>
              </div>
              {appointment.cancelledAt && (
                <div className="sm:col-span-2 border-t border-slate-200 pt-2 text-xs">
                  <dt className="text-2xs text-red-500 font-medium">Cancelled On</dt>
                  <dd className="text-red-700 mt-0.5">
                    {formatDateTime(appointment.cancelledAt)}
                    {appointment.cancelReason === 'DOCTOR_LEAVE'
                      ? ' (Doctor on leave)'
                      : appointment.cancelReason === 'RESCHEDULED'
                        ? ' (Rescheduled)'
                        : ''}
                  </dd>
                </div>
              )}
            </div>

            {appointment.symptoms && (
              <div className="border-t border-slate-100 pt-3">
                <p className="text-2xs uppercase tracking-wider font-semibold text-slate-400 mb-1">
                  Reported Symptoms
                </p>
                <p className="text-xs text-slate-700 whitespace-pre-wrap rounded bg-slate-50 p-2.5 border border-slate-100">
                  {appointment.symptoms}
                </p>
              </div>
            )}

            {canChange && (
              <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={openReschedule}
                  disabled={busy}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reschedule
                </button>
                <button
                  type="button"
                  className="btn-danger text-xs"
                  onClick={cancel}
                  disabled={busy}
                >
                  Cancel appointment
                </button>
              </div>
            )}
          </section>

          {/* Reschedule Drawer */}
          {rescheduling && (
            <section className="card p-5 border-teal-200 bg-teal-50/20 space-y-3">
              <div className="flex items-center justify-between border-b border-teal-200/60 pb-2">
                <h3 className="font-semibold text-xs text-teal-950">Select New Appointment Time</h3>
                <button type="button" className="btn-ghost text-xs py-0.5 px-2" onClick={() => setRescheduling(false)}>
                  Close
                </button>
              </div>

              {!slots ? (
                <Spinner label="Checking available slots…" />
              ) : slots.length === 0 ? (
                <p className="text-xs text-slate-500">No other open slots in the next 3 weeks.</p>
              ) : (
                <div className="space-y-3">
                  {slots.map((day) => (
                    <div key={day.date} className="rounded bg-white p-3 border border-slate-200">
                      <p className="text-xs font-semibold text-slate-800 mb-2">{formatDate(`${day.date}T12:00:00Z`)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {day.slots.map((slot) => (
                          <button
                            key={slot.startsAt}
                            type="button"
                            disabled={busy}
                            onClick={() => moveTo(slot.startsAt)}
                            className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-900 transition-colors cursor-pointer"
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

          {/* Post-Visit Care Plan */}
          {appointment.status === 'COMPLETED' && (
            <section className="card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Post-Visit Care Plan
                </h2>
                <SourceNote source={summary?.source} />
              </div>

              {!summary ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  <Spinner label="Generating care plan summary…" />
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  {summary.patientSummary && (
                    <div className="rounded bg-teal-50/50 p-3 border border-teal-100 text-slate-800 leading-relaxed whitespace-pre-wrap">
                      <p className="font-semibold text-teal-950 mb-1">Doctor's Summary</p>
                      {summary.patientSummary}
                    </div>
                  )}

                  {summary.careInstructions?.length > 0 && (
                    <div>
                      <p className="font-semibold text-slate-700 mb-1.5">Care Instructions</p>
                      <ul className="list-disc pl-4 space-y-1 text-slate-600">
                        {summary.careInstructions.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summary.warningSigns?.length > 0 && (
                    <div className="rounded border border-amber-200 bg-amber-50/80 p-3">
                      <p className="font-semibold text-amber-900 mb-1">When to seek care sooner:</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                        {summary.warningSigns.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summary.followUpInDays && (
                    <div className="rounded bg-slate-50 p-2.5 border border-slate-200 flex items-center justify-between text-xs">
                      <span>Follow-up recommended in <strong>{summary.followUpInDays} days</strong>.</span>
                      <Link to="/patient/find" className="btn-primary text-xs py-1 px-2.5">
                        Book Follow-up
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Sidebar: Medications */}
        <div className="space-y-5">
          {summary?.medications?.length > 0 && (
            <section className="card p-5 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Prescribed Medications
              </h2>

              <ul className="space-y-3 divide-y divide-slate-100">
                {summary.medications.map((med) => (
                  <li key={med.id} className="pt-2.5 first:pt-0 text-xs">
                    <p className="font-semibold text-slate-900">{med.name}</p>
                    <p className="text-slate-600 mt-0.5">
                      {[med.dosage, med.frequency].filter(Boolean).join(' · ')}
                    </p>
                    {med.instructions && (
                      <p className="text-2xs text-slate-400 mt-0.5">{med.instructions}</p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1">
                      {med.timesOfDay.map((t) => (
                        <Badge key={t} tone="brand">{t}</Badge>
                      ))}
                      <Badge tone="slate">{med.durationDays}d</Badge>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="pt-2 border-t border-slate-100">
                <Link to="/patient/medications" className="btn-secondary w-full text-xs justify-center">
                  Full Medication Schedule
                </Link>
              </div>
            </section>
          )}

          {summary?.prescriptionText && (
            <section className="card p-5 space-y-2">
              <p className="text-2xs uppercase tracking-wider font-semibold text-slate-400">
                Raw Prescription
              </p>
              <pre className="overflow-x-auto rounded bg-slate-50 p-2.5 font-mono text-2xs whitespace-pre-wrap text-slate-700 border border-slate-100">
                {summary.prescriptionText}
              </pre>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

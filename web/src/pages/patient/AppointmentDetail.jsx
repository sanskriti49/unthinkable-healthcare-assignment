import { useCallback, useEffect, useState } from 'react';
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

export default function PatientAppointmentDetail() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

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
          // The summary job may still be running — the page works without it.
        }
      }
    } catch (err) {
      setError(err);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * A just-completed visit has its summary generated in the background, so poll
   * briefly rather than making the patient reload the page.
   */
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
      navigate(`/patient/appointments/${created.id}`, { replace: true });
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') openReschedule();
    } finally {
      setBusy(false);
    }
  }

  if (error && !appointment) return <ErrorBanner error={error} />;
  if (!appointment) return <Spinner />;

  const canChange = appointment.status === 'BOOKED';

  return (
    <>
      <Link to="/patient/appointments" className="btn-ghost mb-4">← All appointments</Link>

      {location.state?.justBooked && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Your appointment is confirmed.</p>
          <p className="mt-0.5 text-sm text-emerald-800">
            A confirmation email is on its way, and you will get a reminder the day before.
          </p>
        </div>
      )}

      <PageHeader
        title={`Dr ${appointment.doctor?.fullName}`}
        description={appointment.doctor?.specialisation}
        action={<StatusBadge status={appointment.status} />}
      />

      <ErrorBanner error={error} className="mb-4" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Appointment</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-slate-500">When</dt>
                <dd className="text-sm font-medium text-slate-900">{formatDateTime(appointment.startsAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Room</dt>
                <dd className="text-sm text-slate-900">{appointment.doctor?.roomNumber ?? '—'}</dd>
              </div>
              {appointment.cancelledAt && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-500">Cancelled</dt>
                  <dd className="text-sm text-red-700">
                    {formatDateTime(appointment.cancelledAt)}
                    {appointment.cancelReason === 'DOCTOR_LEAVE'
                      ? ' — the doctor was unavailable that day'
                      : appointment.cancelReason === 'RESCHEDULED'
                        ? ' — moved to a new time'
                        : ''}
                  </dd>
                </div>
              )}
            </dl>

            {appointment.symptoms && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium text-slate-500">What you told us</p>
                <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{appointment.symptoms}</p>
              </div>
            )}

            {canChange && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button type="button" className="btn-secondary" onClick={openReschedule} disabled={busy}>
                  Reschedule
                </button>
                <button type="button" className="btn-danger" onClick={cancel} disabled={busy}>
                  Cancel appointment
                </button>
              </div>
            )}
          </section>

          {rescheduling && (
            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Pick a new time</h2>
                <button type="button" className="btn-ghost" onClick={() => setRescheduling(false)}>
                  Cancel
                </button>
              </div>
              {!slots ? (
                <Spinner label="Loading availability…" />
              ) : slots.length === 0 ? (
                <p className="text-sm text-slate-500">No other slots are free in the next three weeks.</p>
              ) : (
                <div className="space-y-3">
                  {slots.map((day) => (
                    <div key={day.date}>
                      <p className="mb-1.5 text-sm font-medium text-slate-700">{formatDate(`${day.date}T12:00:00Z`)}</p>
                      <div className="flex flex-wrap gap-2">
                        {day.slots.map((slot) => (
                          <button
                            key={slot.startsAt}
                            type="button"
                            disabled={busy}
                            onClick={() => moveTo(slot.startsAt)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-brand-500 hover:bg-brand-50"
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

          {appointment.status === 'COMPLETED' && (
            <section className="card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-900">After your visit</h2>
                <SourceNote source={summary?.source} />
              </div>

              {!summary ? (
                <p className="text-sm text-slate-500">
                  Your summary is being prepared and will appear here shortly.
                </p>
              ) : (
                <div className="space-y-5">
                  {summary.patientSummary && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                      {summary.patientSummary}
                    </p>
                  )}

                  {summary.careInstructions?.length > 0 && (
                    <div>
                      <h3 className="mb-1.5 text-sm font-semibold text-slate-800">What to do</h3>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {summary.careInstructions.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summary.warningSigns?.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <h3 className="mb-1.5 text-sm font-semibold text-amber-900">
                        Get medical help sooner if:
                      </h3>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
                        {summary.warningSigns.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summary.followUpInDays && (
                    <p className="text-sm text-slate-600">
                      Your doctor asked you to follow up in <strong>{summary.followUpInDays} days</strong>.{' '}
                      <Link to="/patient/find" className="font-semibold text-brand-700 hover:underline">
                        Book a follow-up
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          {summary?.medications?.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold text-slate-900">Your medication</h2>
              <ul className="space-y-4">
                {summary.medications.map((med) => (
                  <li key={med.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                    <p className="font-semibold text-slate-900">{med.name}</p>
                    <p className="text-sm text-slate-600">
                      {[med.dosage, med.frequency].filter(Boolean).join(' · ')}
                    </p>
                    {med.instructions && <p className="text-sm text-slate-500">{med.instructions}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {med.timesOfDay.map((t) => (
                        <Badge key={t} tone="brand">{t}</Badge>
                      ))}
                      <Badge tone="slate">{med.durationDays} days</Badge>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                We will email you a reminder at each of these times.
              </p>
              <Link to="/patient/medications" className="btn-ghost mt-2">Full schedule →</Link>
            </section>
          )}

          {summary?.prescriptionText && (
            <section className="card p-5">
              <h2 className="mb-2 font-semibold text-slate-900">Prescription as written</h2>
              <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-xs whitespace-pre-wrap text-slate-700">
                {summary.prescriptionText}
              </pre>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

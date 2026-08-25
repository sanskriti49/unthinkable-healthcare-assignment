import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { formatDate, formatDateTime, todayKey } from '../../lib/format.js';
import { EmptyState, ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import {
  CalendarX,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Trash2,
  Users,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

export default function DoctorLeave() {
  const [leave, setLeave] = useState(null);
  const [form, setForm] = useState({ date: '', reason: '' });
  const [conflicts, setConflicts] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const { toast } = useToast();

  const load = useCallback(
    () => api.get('/doctor/leave').then((r) => setLeave(r.leave)).catch(setError),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e, force = false) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    if (!force) setResult(null);

    try {
      const response = await api.post('/doctor/leave', {
        date: form.date,
        reason: form.reason || undefined,
        force,
      });
      setConflicts(null);
      setResult(response);
      setForm({ date: '', reason: '' });
      toast('Leave date marked successfully!');
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LEAVE_HAS_CONFLICTS') {
        setConflicts(err.details);
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Remove this leave day? Slots become bookable again.')) return;
    try {
      await api.del(`/doctor/leave/${id}`);
      toast('Leave day removed. Slots reopened.');
      await load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Leave Planner &amp; Conflict Resolver"
        description="Schedule time off with automatic conflict detection, patient cancellation, and rescheduling notifications."
        icon={CalendarX}
      />

      <ErrorBanner error={error} />

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950 flex items-start gap-3 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">Leave successfully registered.</p>
            <p className="text-xs text-emerald-800 mt-0.5">
              {result.cancelled > 0
                ? `${result.cancelled} existing appointment(s) were safely cancelled and ${result.notified} patient(s) received automated emails with alternative slots.`
                : 'No existing patient appointments were affected.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mark Leave Form */}
        <section className="card p-6 border-slate-200/80 bg-white">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
            <CalendarX className="w-4 h-4 text-teal-600" />
            Schedule Leave Day
          </h2>

          <form onSubmit={(e) => submit(e, false)} className="space-y-4">
            <Field label="Leave Date" required>
              <input
                type="date"
                required
                min={todayKey()}
                className="input"
                value={form.date}
                onChange={(e) => {
                  setForm({ ...form, date: e.target.value });
                  setConflicts(null);
                }}
              />
            </Field>

            <Field label="Reason (Optional)" hint="Included in the notification email sent to affected patients.">
              <input
                className="input"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. Attending Medical Symposium / Personal leave"
              />
            </Field>

            {conflicts ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 space-y-3 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-950">
                      Conflict Detected: {conflicts.appointments.length} patient(s) already booked on {formatDate(`${conflicts.date}T12:00:00Z`)}
                    </p>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Confirming will cancel their bookings and automatically email each patient alternative slots.
                    </p>
                  </div>
                </div>

                <ul className="rounded-lg bg-white/70 p-3 border border-amber-200 space-y-1.5 text-xs text-amber-900">
                  {conflicts.appointments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between">
                      <span className="font-semibold">{a.patientName}</span>
                      <span className="font-mono text-2xs text-amber-700">{formatDateTime(a.startsAt)}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className="btn-danger text-xs"
                    disabled={busy}
                    onClick={() => submit(null, true)}
                  >
                    {busy ? 'Processing Cancellations…' : 'Confirm & Notify Affected Patients'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => setConflicts(null)}
                  >
                    Cancel Action
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="submit"
                className="btn-primary text-xs"
                disabled={busy || !form.date}
              >
                {busy ? 'Checking Conflicts…' : 'Schedule Leave Date'}
              </button>
            )}
          </form>
        </section>

        {/* Existing Scheduled Leave List */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-600" />
            Active Scheduled Leaves
          </h2>

          {!leave ? (
            <Spinner label="Loading scheduled leaves…" />
          ) : leave.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No upcoming leaves scheduled"
              description="Your normal clinic working hours apply on all upcoming dates."
            />
          ) : (
            <div className="card divide-y divide-slate-100 overflow-hidden">
              {leave.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 font-bold text-xs border border-amber-200/60">
                      <CalendarX className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900">{formatDate(l.date)}</p>
                      {l.reason ? (
                        <p className="text-xs text-slate-500">{l.reason}</p>
                      ) : (
                        <p className="text-2xs text-slate-400 italic">No reason specified</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-ghost text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => remove(l.id)}
                    title="Remove leave"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

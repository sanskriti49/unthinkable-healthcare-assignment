import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { formatDate, formatDateTime, todayKey } from '../../lib/format.js';
import { EmptyState, ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui.jsx';

/**
 * Leave management.
 *
 * Marking leave on a day that already has patients is destructive, so the flow
 * is deliberately two-step: the first submit comes back with the list of
 * affected patients (HTTP 409), and only an explicit confirmation cancels them.
 */
export default function DoctorLeave() {
  const [leave, setLeave] = useState(null);
  const [form, setForm] = useState({ date: '', reason: '' });
  const [conflicts, setConflicts] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

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
    if (!window.confirm('Remove this leave day? Slots become bookable again — already-cancelled appointments are not restored.')) return;
    try {
      await api.del(`/doctor/leave/${id}`);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Leave"
        description="Block out a day. Patients already booked on it are cancelled and notified with alternative times."
      />

      <ErrorBanner error={error} className="mb-4" />

      {result && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Leave recorded.</p>
          <p className="mt-0.5 text-sm text-emerald-800">
            {result.cancelled > 0
              ? `${result.cancelled} appointment(s) were cancelled and ${result.notified} patient(s) notified by email with alternative slots.`
              : 'No appointments were affected.'}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Mark a day as leave</h2>

          <form onSubmit={(e) => submit(e, false)} className="space-y-4">
            <Field label="Date" required>
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

            <Field label="Reason" hint="Shown to affected patients in their cancellation email.">
              <input
                className="input"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. Attending a conference"
              />
            </Field>

            {conflicts ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">
                  {conflicts.appointments.length} patient(s) are booked on {formatDate(`${conflicts.date}T12:00:00Z`)}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {conflicts.appointments.map((a) => (
                    <li key={a.id}>
                      {formatDateTime(a.startsAt)} — {a.patientName}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-amber-800">
                  Confirming cancels these appointments and emails each patient with your next available slots.
                  This cannot be undone.
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-danger" disabled={busy} onClick={() => submit(null, true)}>
                    {busy ? 'Cancelling…' : 'Cancel them and mark leave'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setConflicts(null)}>
                    Keep appointments
                  </button>
                </div>
              </div>
            ) : (
              <button type="submit" className="btn-primary" disabled={busy || !form.date}>
                {busy ? 'Checking…' : 'Mark as leave'}
              </button>
            )}
          </form>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-slate-900">Scheduled leave</h2>
          {!leave ? (
            <Spinner />
          ) : leave.length === 0 ? (
            <EmptyState title="No leave scheduled" description="Your working hours apply on every day." />
          ) : (
            <ul className="card divide-y divide-slate-100">
              {leave.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{formatDate(l.date)}</p>
                    {l.reason && <p className="text-sm text-slate-500">{l.reason}</p>}
                  </div>
                  <button type="button" className="btn-ghost text-red-600" onClick={() => remove(l.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

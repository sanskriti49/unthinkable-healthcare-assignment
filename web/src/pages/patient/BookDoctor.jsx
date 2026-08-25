import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api.js';
import { addDaysKey, formatDayLabel, formatFee, formatTime, todayKey } from '../../lib/format.js';
import { Badge, ErrorBanner, Field, PageHeader, Spinner, EmptyState } from '../../components/ui.jsx';

const WINDOW_DAYS = 14;

/** Live countdown on the hold, so the patient can see their time running out. */
function useCountdown(expiresAt) {
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.max(0, new Date(expiresAt) - Date.now()) : 0
  );

  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = () => setRemaining(Math.max(0, new Date(expiresAt) - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return {
    expired: remaining <= 0,
    label: `${minutes}:${String(seconds).padStart(2, '0')}`,
  };
}

export default function BookDoctor() {
  const { doctorId } = useParams();
  const navigate = useNavigate();

  const [doctor, setDoctor] = useState(null);
  const [days, setDays] = useState(null);
  const [error, setError] = useState(null);
  const [rangeStart, setRangeStart] = useState(() => addDaysKey(todayKey(), 0));

  // Two-step booking: hold the slot, then confirm with symptoms.
  const [hold, setHold] = useState(null);
  const [symptoms, setSymptoms] = useState('');
  const [busy, setBusy] = useState(false);
  const symptomsRef = useRef(null);

  const countdown = useCountdown(hold?.holdExpiresAt);

  const loadAvailability = useCallback(async () => {
    setDays(null);
    setError(null);
    try {
      const { days: result } = await api.get(`/doctors/${doctorId}/availability`, {
        query: { from: rangeStart, to: addDaysKey(rangeStart, WINDOW_DAYS - 1) },
      });
      setDays(result);
    } catch (err) {
      setError(err);
    }
  }, [doctorId, rangeStart]);

  useEffect(() => {
    api.get(`/doctors/${doctorId}`).then((r) => setDoctor(r.doctor)).catch(setError);
  }, [doctorId]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const daysWithSlots = useMemo(() => (days ?? []).filter((d) => d.slots.length > 0), [days]);

  async function takeHold(slot) {
    setBusy(true);
    setError(null);
    try {
      const { hold: created } = await api.post('/appointments/hold', {
        doctorId,
        startsAt: slot.startsAt,
      });
      setHold(created);
      // Move focus to the form so the next step is obvious.
      setTimeout(() => symptomsRef.current?.focus(), 50);
    } catch (err) {
      setError(err);
      // Somebody else took it — refresh so the grid reflects reality.
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') loadAvailability();
    } finally {
      setBusy(false);
    }
  }

  async function releaseHold() {
    if (!hold) return;
    try {
      await api.del(`/appointments/${hold.id}/hold`);
    } catch {
      /* it will expire on its own anyway */
    }
    setHold(null);
    setSymptoms('');
    loadAvailability();
  }

  async function confirm(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { appointment } = await api.post(`/appointments/${hold.id}/confirm`, {
        holdToken: hold.holdToken,
        symptoms: symptoms.trim() || undefined,
      });
      navigate(`/patient/appointments/${appointment.id}`, { state: { justBooked: true } });
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === 'HOLD_EXPIRED') {
        setHold(null);
        loadAvailability();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!doctor) return error ? <ErrorBanner error={error} /> : <Spinner />;

  return (
    <>
      <Link to="/patient/find" className="btn-ghost mb-4">← Back to search</Link>

      <PageHeader
        title={`Dr ${doctor.fullName}`}
        description={`${doctor.specialisation}${doctor.qualifications ? ` · ${doctor.qualifications}` : ''}`}
        action={<Badge tone="brand">{formatFee(doctor.consultationFee)} · {doctor.slotDurationMinutes} min</Badge>}
      />

      <ErrorBanner error={error} className="mb-4" />

      {hold && !countdown.expired ? (
        <form onSubmit={confirm} className="card mb-6 border-brand-200 bg-brand-50/40 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Slot reserved for you — {formatDayLabel(hold.startsAt.slice(0, 10))} at {formatTime(hold.startsAt)}
              </p>
              <p className="text-xs text-brand-700">
                Held for {countdown.label} more. Nobody else can take it while you finish.
              </p>
            </div>
            <button type="button" onClick={releaseHold} className="btn-secondary">
              Release slot
            </button>
          </div>

          <Field
            label="What brings you in?"
            hint="Your doctor sees this before the visit. Optional, but it helps them prepare."
          >
            <textarea
              ref={symptomsRef}
              rows={4}
              maxLength={5000}
              className="input"
              placeholder="Describe your symptoms — when they started, whether they are getting worse, and anything that makes them better."
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
            />
          </Field>

          <button type="submit" className="btn-primary mt-4" disabled={busy}>
            {busy ? 'Confirming…' : 'Confirm booking'}
          </button>
        </form>
      ) : hold && countdown.expired ? (
        <div className="card mb-6 border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">Your reservation expired</p>
          <p className="mt-1 text-sm text-amber-800">
            The slot has been released so someone else can book it. Please choose a time again.
          </p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() => {
              setHold(null);
              loadAvailability();
            }}
          >
            Choose another slot
          </button>
        </div>
      ) : null}

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Available slots</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={rangeStart <= todayKey()}
            onClick={() => setRangeStart(addDaysKey(rangeStart, -WINDOW_DAYS))}
          >
            ← Earlier
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setRangeStart(addDaysKey(rangeStart, WINDOW_DAYS))}
          >
            Later →
          </button>
        </div>
      </div>

      {!days ? (
        <Spinner label="Checking availability…" />
      ) : daysWithSlots.length === 0 ? (
        <EmptyState
          title="No free slots in this period"
          description="Try the next two weeks, or pick another doctor in the same specialisation."
        />
      ) : (
        <div className="space-y-4">
          {daysWithSlots.map((day) => (
            <section key={day.date} className="card p-4">
              <div className="mb-3 flex items-center gap-3">
                <h3 className="font-semibold text-slate-800">{formatDayLabel(day.date)}</h3>
                <span className="text-xs text-slate-400">{day.slots.length} available</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {day.slots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    disabled={busy || Boolean(hold)}
                    onClick={() => takeHold(slot)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium
                               text-slate-700 transition-colors hover:border-brand-500 hover:bg-brand-50
                               hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {formatTime(slot.startsAt)}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {days?.some((d) => d.onLeave) && (
        <p className="mt-4 text-xs text-slate-500">
          Days marked as leave are not shown:{' '}
          {days.filter((d) => d.onLeave).map((d) => formatDayLabel(d.date)).join(', ')}.
        </p>
      )}
    </>
  );
}

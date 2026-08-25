import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api.js';
import { addDaysKey, formatDayLabel, formatFee, formatTime, todayKey } from '../../lib/format.js';
import { Badge, ErrorBanner, Field, PageHeader, Spinner, EmptyState } from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import {
  Clock,
  Calendar,
  Stethoscope,
  AlertTriangle,
  ArrowLeft,
  Lock,
  Sun,
  Sunset,
  Moon,
} from 'lucide-react';

const WINDOW_DAYS = 14;

const SYMPTOM_TAGS = [
  'Fever',
  'Headache',
  'Cough',
  'Chest discomfort',
  'Skin rash',
  'Routine checkup',
  'Prescription refill',
];

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
  const { toast } = useToast();

  const [doctor, setDoctor] = useState(null);
  const [days, setDays] = useState(null);
  const [error, setError] = useState(null);
  const [rangeStart, setRangeStart] = useState(() => addDaysKey(todayKey(), 0));

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
      toast('Slot reserved. Please describe your symptoms to confirm.');
      setTimeout(() => symptomsRef.current?.focus(), 50);
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') {
        toast('This slot was just booked by another user. Refreshing…', 'warning');
        loadAvailability();
      }
    } finally {
      setBusy(false);
    }
  }

  async function releaseHold() {
    if (!hold) return;
    try {
      await api.del(`/appointments/${hold.id}/hold`);
    } catch {
      /* fallback */
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
      toast('Appointment confirmed successfully.');
      navigate(`/patient/appointments/${appointment.id}`, { state: { justBooked: true } });
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === 'HOLD_EXPIRED') {
        setHold(null);
        toast('Your slot reservation expired. Please pick a slot again.', 'error');
        loadAvailability();
      }
    } finally {
      setBusy(false);
    }
  }

  const addSymptomTag = (tag) => {
    setSymptoms((prev) => (prev ? `${prev}, ${tag}` : tag));
  };

  if (!doctor) return error ? <ErrorBanner error={error} /> : <Spinner label="Loading doctor availability…" />;

  return (
    <div className="space-y-6">
      <Link to="/patient/find" className="btn-ghost text-xs inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to doctor search
      </Link>

      {/* Doctor Summary Card */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-medium border border-teal-200/60">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">Dr. {doctor.fullName}</h1>
                <Badge tone="green">Accepting Patients</Badge>
              </div>
              <p className="text-xs font-medium text-teal-700 mt-0.5">{doctor.specialisation}</p>
              {doctor.qualifications && (
                <p className="text-2xs text-slate-400 mt-0.5">{doctor.qualifications}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="text-right">
              <span className="text-2xs text-slate-400 block">Consultation Fee</span>
              <span className="font-semibold text-slate-900">{formatFee(doctor.consultationFee)}</span>
            </div>
            <div className="text-right border-l border-slate-200 pl-4">
              <span className="text-2xs text-slate-400 block">Slot Length</span>
              <span className="font-semibold text-slate-900">{doctor.slotDurationMinutes} mins</span>
            </div>
            {doctor.roomNumber && (
              <div className="text-right border-l border-slate-200 pl-4">
                <span className="text-2xs text-slate-400 block">Room</span>
                <span className="font-semibold text-slate-900">#{doctor.roomNumber}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <ErrorBanner error={error} />

      {/* Slot Hold & Symptoms Confirmation Form */}
      {hold && !countdown.expired ? (
        <form onSubmit={confirm} className="card p-5 border-teal-200 bg-teal-50/30 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-200/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-teal-700 text-white">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Slot held: {formatDayLabel(hold.startsAt.slice(0, 10))} at {formatTime(hold.startsAt)}
                </p>
                <p className="text-2xs text-slate-500">
                  Temporary reservation active. Complete intake below to confirm.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-mono font-medium text-teal-800 border border-teal-200">
                <Clock className="w-3 h-3 text-teal-600" />
                {countdown.label}
              </span>
              <button type="button" onClick={releaseHold} className="btn-secondary text-xs py-1">
                Release
              </button>
            </div>
          </div>

          <Field
            label="Reason for consultation / symptoms (optional)"
            hint="Summarized by clinical AI to assist the doctor before consultation."
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-2xs text-slate-400">Quick suggestions:</span>
              {SYMPTOM_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addSymptomTag(tag)}
                  className="rounded bg-white border border-slate-200 px-2 py-0.5 text-2xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  + {tag}
                </button>
              ))}
            </div>

            <textarea
              ref={symptomsRef}
              rows={3}
              maxLength={5000}
              className="input text-xs"
              placeholder="Describe your symptoms, duration, and any current medications..."
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={releaseHold} className="btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs px-4" disabled={busy}>
              {busy ? 'Confirming…' : 'Confirm Appointment'}
            </button>
          </div>
        </form>
      ) : hold && countdown.expired ? (
        <div className="card p-4 border-amber-200 bg-amber-50 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">Reservation hold expired</p>
              <p className="text-amber-800 mt-0.5">
                The temporary slot hold has ended. Please select an available slot below.
              </p>
              <button
                type="button"
                className="btn-secondary text-xs mt-2"
                onClick={() => {
                  setHold(null);
                  loadAvailability();
                }}
              >
                Refresh slots
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Available Slots Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-700" />
              Available Time Slots
            </h2>
            <p className="text-xs text-slate-500">
              Showing availability for the next 14 days
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="btn-secondary text-xs py-1"
              disabled={rangeStart <= todayKey()}
              onClick={() => setRangeStart(addDaysKey(rangeStart, -WINDOW_DAYS))}
            >
              ← Previous 2 weeks
            </button>
            <button
              type="button"
              className="btn-secondary text-xs py-1"
              onClick={() => setRangeStart(addDaysKey(rangeStart, WINDOW_DAYS))}
            >
              Next 2 weeks →
            </button>
          </div>
        </div>

        {!days ? (
          <Spinner label="Checking doctor schedule…" />
        ) : daysWithSlots.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No open slots in this 14-day window"
            description="The doctor may be fully booked or on leave. Check the next time window."
            action={
              <button
                type="button"
                className="btn-primary text-xs"
                onClick={() => setRangeStart(addDaysKey(rangeStart, WINDOW_DAYS))}
              >
                Check Next 2 Weeks →
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {daysWithSlots.map((day) => {
              const morningSlots = day.slots.filter((s) => {
                const hour = parseInt(s.startsAt.slice(11, 13), 10);
                return hour < 12;
              });
              const afternoonSlots = day.slots.filter((s) => {
                const hour = parseInt(s.startsAt.slice(11, 13), 10);
                return hour >= 12 && hour < 17;
              });
              const eveningSlots = day.slots.filter((s) => {
                const hour = parseInt(s.startsAt.slice(11, 13), 10);
                return hour >= 17;
              });

              return (
                <div key={day.date} className="card p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <p className="font-semibold text-xs text-slate-900">{formatDayLabel(day.date)}</p>
                    <span className="text-2xs text-slate-400">{day.slots.length} available</span>
                  </div>

                  <div className="space-y-2.5">
                    {morningSlots.length > 0 && (
                      <div className="flex items-start gap-3">
                        <span className="text-2xs font-medium text-slate-400 w-16 shrink-0 pt-1 flex items-center gap-1">
                          <Sun className="w-3 h-3 text-amber-500" /> Morning
                        </span>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {morningSlots.map((slot) => (
                            <button
                              key={slot.startsAt}
                              type="button"
                              disabled={busy || Boolean(hold)}
                              onClick={() => takeHold(slot)}
                              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-900 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {formatTime(slot.startsAt)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {afternoonSlots.length > 0 && (
                      <div className="flex items-start gap-3">
                        <span className="text-2xs font-medium text-slate-400 w-16 shrink-0 pt-1 flex items-center gap-1">
                          <Sunset className="w-3 h-3 text-orange-500" /> Afternoon
                        </span>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {afternoonSlots.map((slot) => (
                            <button
                              key={slot.startsAt}
                              type="button"
                              disabled={busy || Boolean(hold)}
                              onClick={() => takeHold(slot)}
                              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-900 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {formatTime(slot.startsAt)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {eveningSlots.length > 0 && (
                      <div className="flex items-start gap-3">
                        <span className="text-2xs font-medium text-slate-400 w-16 shrink-0 pt-1 flex items-center gap-1">
                          <Moon className="w-3 h-3 text-indigo-500" /> Evening
                        </span>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {eveningSlots.map((slot) => (
                            <button
                              key={slot.startsAt}
                              type="button"
                              disabled={busy || Boolean(hold)}
                              onClick={() => takeHold(slot)}
                              className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-600 hover:bg-teal-50 hover:text-teal-900 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {formatTime(slot.startsAt)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

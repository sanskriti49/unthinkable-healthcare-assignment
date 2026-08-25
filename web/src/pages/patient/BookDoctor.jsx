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
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  Sun,
  Sunset,
  Moon,
  Coins,
  MapPin,
} from 'lucide-react';

const WINDOW_DAYS = 14;

const SYMPTOM_TAGS = [
  'Fever & chills',
  'Severe headache',
  'Persistent dry cough',
  'Chest discomfort',
  'Skin rash / allergy',
  'Routine health checkup',
  'Prescription follow-up',
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

  const totalMs = 10 * 60 * 1000; // 10 minutes default
  const percent = Math.min(100, Math.max(0, (remaining / totalMs) * 100));
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return {
    expired: remaining <= 0,
    percent,
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
      toast('Slot held for 10 minutes! Fill in symptoms to confirm.', 'info');
      setTimeout(() => symptomsRef.current?.focus(), 50);
    } catch (err) {
      setError(err);
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') {
        toast('That slot was just booked by another user. Refreshing...', 'warning');
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
      toast('Slot hold released.', 'info');
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
      toast('Appointment booked successfully! Preparing AI summary...');
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

  if (!doctor) return error ? <ErrorBanner error={error} /> : <Spinner label="Loading doctor details…" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <Link to="/patient/find" className="btn-ghost text-xs">
          <ArrowLeft className="w-4 h-4" />
          Back to Doctor Search
        </Link>
        <span className="inline-flex items-center gap-1 text-2xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200/60">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
          Advisory Lock Protection Active
        </span>
      </div>

      {/* Doctor Summary Header Card */}
      <div className="card p-6 border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 font-bold border border-teal-200/60 shadow-xs">
              <Stethoscope className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Dr. {doctor.fullName}</h1>
                <Badge tone="green">Accepting Patients</Badge>
              </div>
              <p className="text-sm font-semibold text-teal-700">{doctor.specialisation}</p>
              {doctor.qualifications && (
                <p className="text-xs text-slate-500 mt-0.5">{doctor.qualifications}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-200/70 text-right">
              <span className="text-2xs text-slate-400 block font-medium">Consultation Fee</span>
              <span className="text-sm font-bold text-slate-900">{formatFee(doctor.consultationFee)}</span>
            </div>
            <div className="rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-200/70 text-right">
              <span className="text-2xs text-slate-400 block font-medium">Slot Length</span>
              <span className="text-sm font-bold text-slate-900">{doctor.slotDurationMinutes} min</span>
            </div>
            {doctor.roomNumber && (
              <div className="rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-200/70 text-right">
                <span className="text-2xs text-slate-400 block font-medium">Room</span>
                <span className="text-sm font-bold text-slate-900">#{doctor.roomNumber}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <ErrorBanner error={error} />

      {/* Step 2: Slot Hold & Confirmation Form (Visible when hold is active) */}
      {hold && !countdown.expired ? (
        <form onSubmit={confirm} className="card p-6 border-teal-300 bg-gradient-to-br from-teal-50/70 to-emerald-50/50 shadow-md animate-in slide-in-from-top-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-teal-200/60 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-teal-950">
                  Slot Reserved: {formatDayLabel(hold.startsAt.slice(0, 10))} at {formatTime(hold.startsAt)}
                </p>
                <p className="text-xs text-teal-800">
                  Nobody else can book this slot while your countdown is running.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-xs font-bold text-teal-900 border border-teal-300 shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-teal-600 animate-spin" style={{ animationDuration: '4s' }} />
                <span>{countdown.label} left</span>
              </div>
              <button type="button" onClick={releaseHold} className="btn-secondary text-xs">
                Release Slot
              </button>
            </div>
          </div>

          {/* Progress Countdown Bar */}
          <div className="w-full bg-teal-200/50 rounded-full h-1.5 mb-5 overflow-hidden">
            <div
              className="bg-teal-600 h-1.5 rounded-full transition-all duration-1000"
              style={{ width: `${countdown.percent}%` }}
            />
          </div>

          {/* Symptoms Description & Quick Chips */}
          <div className="space-y-3">
            <Field
              label="Describe what brings you in"
              hint="Your symptoms are analyzed by AI to prepare a pre-visit summary with urgency level for the doctor."
            >
              {/* Quick Tags */}
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-2xs font-semibold text-slate-500">Quick tags:</span>
                {SYMPTOM_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addSymptomTag(tag)}
                    className="rounded-full bg-white border border-teal-200 px-2.5 py-0.5 text-2xs font-medium text-teal-800 hover:bg-teal-100 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              <textarea
                ref={symptomsRef}
                rows={4}
                maxLength={5000}
                className="input"
                placeholder="E.g. Feeling feverish and fatigued since yesterday evening. Mild throat pain and dry cough, getting worse with cold drinks."
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
              />
            </Field>

            <div className="flex items-center justify-between pt-2">
              <span className="text-2xs text-slate-500">
                Symptoms will generate a clinical triage summary for Dr. {doctor.fullName}.
              </span>
              <button type="submit" className="btn-primary px-6" disabled={busy}>
                {busy ? 'Confirming Booking…' : 'Confirm & Complete Booking'}
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      ) : hold && countdown.expired ? (
        <div className="card p-5 border-amber-200 bg-amber-50 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">Your 10-minute reservation expired</p>
              <p className="text-xs text-amber-800 mt-0.5">
                The slot has been released back into the pool. Please select your preferred slot again below.
              </p>
              <button
                type="button"
                className="btn-secondary mt-3 text-xs"
                onClick={() => {
                  setHold(null);
                  loadAvailability();
                }}
              >
                Choose Another Slot
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Step 1: Available Slots Selector */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              Available Time Slots
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing next 14 days · Slots are reserved exclusively upon selection
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={rangeStart <= todayKey()}
              onClick={() => setRangeStart(addDaysKey(rangeStart, -WINDOW_DAYS))}
            >
              ← Previous 2 Weeks
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => setRangeStart(addDaysKey(rangeStart, WINDOW_DAYS))}
            >
              Next 2 Weeks →
            </button>
          </div>
        </div>

        {!days ? (
          <Spinner label="Checking real-time doctor availability…" />
        ) : daysWithSlots.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No open slots in this 14-day window"
            description="The doctor may be fully booked or on scheduled leave. Try the next time window."
            action={
              <button
                type="button"
                className="btn-primary"
                onClick={() => setRangeStart(addDaysKey(rangeStart, WINDOW_DAYS))}
              >
                Check Next 2 Weeks →
              </button>
            }
          />
        ) : (
          <div className="space-y-4">
            {daysWithSlots.map((day) => {
              // Group slots into Morning, Afternoon, Evening
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
                <section key={day.date} className="card p-5 border-slate-200/80 bg-white shadow-xs">
                  <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-bold text-xs">
                        {new Date(day.date).getDate()}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">{formatDayLabel(day.date)}</h3>
                        <span className="text-2xs text-slate-400">{day.slots.length} appointments available</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Morning Slots */}
                    {morningSlots.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-2xs font-semibold text-amber-700 mb-2">
                          <Sun className="w-3.5 h-3.5 text-amber-500" /> Morning
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {morningSlots.map((slot) => (
                            <button
                              key={slot.startsAt}
                              type="button"
                              disabled={busy || Boolean(hold)}
                              onClick={() => takeHold(slot)}
                              className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-900 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {formatTime(slot.startsAt)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Afternoon Slots */}
                    {afternoonSlots.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-2xs font-semibold text-orange-700 mb-2">
                          <Sunset className="w-3.5 h-3.5 text-orange-500" /> Afternoon
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {afternoonSlots.map((slot) => (
                            <button
                              key={slot.startsAt}
                              type="button"
                              disabled={busy || Boolean(hold)}
                              onClick={() => takeHold(slot)}
                              className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-900 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {formatTime(slot.startsAt)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Evening Slots */}
                    {eveningSlots.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-2xs font-semibold text-indigo-700 mb-2">
                          <Moon className="w-3.5 h-3.5 text-indigo-500" /> Evening
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {eveningSlots.map((slot) => (
                            <button
                              key={slot.startsAt}
                              type="button"
                              disabled={busy || Boolean(hold)}
                              onClick={() => takeHold(slot)}
                              className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-900 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {formatTime(slot.startsAt)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

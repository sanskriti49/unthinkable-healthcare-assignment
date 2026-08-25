import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { ErrorBanner, Field } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  HeartPulse,
  ShieldCheck,
  CalendarCheck2,
  Stethoscope,
  ArrowRight,
  Lock,
  Mail,
  Sparkles,
  Activity,
  CheckCircle2,
} from 'lucide-react';

export default function Login() {
  const { login, user, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={location.state?.from ?? homeFor(user.role)} replace />;

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await login(form.email, form.password);
      toast(`Welcome back, ${me.fullName}!`);
      navigate(location.state?.from ?? homeFor(me.role), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-teal-700 to-teal-500 text-white shadow-lg shadow-teal-600/25 mb-3">
            <HeartPulse className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight font-display">CarePulse Healthcare</h1>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            Clinical appointment scheduling with concurrency protection, AI-assisted pre-visit triage, and patient care plans.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-12 items-stretch">
          {/* Main Login Form */}
          <div className="lg:col-span-6 card p-6 sm:p-8 shadow-sm flex flex-col justify-between">
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 font-display">Sign in to your portal</h2>
                <p className="text-xs text-slate-500 mt-1">Enter your registered email and password to access your account.</p>
              </div>

              <ErrorBanner error={error} className="mb-5" />

              <form onSubmit={submit} className="space-y-4">
                <Field label="Email Address" required>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      className="input pl-10"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="e.g. name@clinic.local or email@domain.com"
                    />
                  </div>
                </Field>

                <Field label="Password" required>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      className="input pl-10"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
                </Field>

                <button type="submit" className="btn-primary w-full py-2.5 mt-2" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            <div className="pt-6 mt-6 text-center border-t border-slate-100 text-xs text-slate-500">
              New patient?{' '}
              <Link to="/register" className="font-bold text-teal-700 hover:text-teal-800 hover:underline">
                Create a patient account
              </Link>
            </div>
          </div>

          {/* Right: Clinical Platform Highlights */}
          <div className="lg:col-span-6 card p-6 sm:p-8 bg-gradient-to-br from-teal-900 to-slate-900 text-white flex flex-col justify-between shadow-sm">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/20 px-3 py-1 text-2xs font-semibold text-teal-300 border border-teal-400/30 mb-4">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                Clinical Reliability &amp; Safety
              </div>

              <h3 className="text-xl font-bold font-display text-white mb-2">
                Modern Patient Care &amp; Clinical Management
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed mb-6">
                Engineered for hospitals and clinical practices with zero-friction appointment booking, LLM-powered triage summaries, and automated care workflows.
              </p>

              <div className="space-y-4 text-xs text-slate-200">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300 mt-0.5">
                    <CalendarCheck2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Concurrency-Safe Booking</p>
                    <p className="text-2xs text-slate-400">Postgres advisory locks guarantee no two patients can ever double-book the same slot.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Clinical Pre &amp; Post-Visit AI</p>
                    <p className="text-2xs text-slate-400">Automated intake triage, urgency scoring, doctor consultation notes rewriting, and prescription parsing.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300 mt-0.5">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Adherence &amp; Outbox Pipeline</p>
                    <p className="text-2xs text-slate-400">Automated medication reminder schedules, retry backoff queues, and dead-letter monitoring.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800 flex items-center justify-between text-2xs text-slate-400">
              <span>Patient · Doctor · Admin Portals</span>
              <span className="flex items-center gap-1 text-teal-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Production Ready
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

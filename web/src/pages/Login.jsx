import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { ErrorBanner, Field } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  HeartPulse,
  Sparkles,
  ShieldCheck,
  CalendarCheck2,
  Stethoscope,
  User,
  ShieldAlert,
  ArrowRight,
  Lock,
  Mail,
  Zap,
} from 'lucide-react';

const DEMO_ACCOUNTS = [
  {
    role: 'Patient',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    desc: 'Book slots, describe symptoms & track prescriptions',
    icon: User,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400',
    badge: 'bg-emerald-100 text-emerald-800',
  },
  {
    role: 'Doctor',
    name: 'Dr. Mehta',
    email: 'dr.mehta@clinic.local',
    desc: 'General Medicine (30m slots) · AI Triage & Consultations',
    icon: Stethoscope,
    color: 'bg-teal-50 text-teal-700 border-teal-200 hover:border-teal-400',
    badge: 'bg-teal-100 text-teal-800',
  },
  {
    role: 'Doctor',
    name: 'Dr. Iyer',
    email: 'dr.iyer@clinic.local',
    desc: 'Cardiology (20m slots) · Schedule & Consultations',
    icon: HeartPulse,
    color: 'bg-sky-50 text-sky-700 border-sky-200 hover:border-sky-400',
    badge: 'bg-sky-100 text-sky-800',
  },
  {
    role: 'Admin',
    name: 'Clinic Operations',
    email: 'admin@clinic.local',
    desc: 'Doctor management, queue monitoring & DLQ retries',
    icon: ShieldAlert,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:border-indigo-400',
    badge: 'bg-indigo-100 text-indigo-800',
  },
];

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

  const loginWithDemo = async (email) => {
    setForm({ email, password: 'Password123!' });
    setBusy(true);
    setError(null);
    try {
      const me = await login(email, 'Password123!');
      toast(`Signed in as ${me.fullName} (${me.role})`);
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
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">CarePulse Healthcare</h1>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            Appointment scheduling with race-condition prevention, AI-powered pre-visit triage, and structured care plans.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-12 items-start">
          {/* Main Login Form */}
          <div className="lg:col-span-6 card p-6 sm:p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">Sign in to your account</h2>
              <p className="text-xs text-slate-500 mt-1">Enter your email credentials or pick a demo profile.</p>
            </div>

            <ErrorBanner error={error} className="mb-5" />

            <form onSubmit={submit} className="space-y-4">
              <Field label="Email Address" required>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    className="input pl-9"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="name@clinic.local"
                  />
                </div>
              </Field>

              <Field label="Password" required>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    className="input pl-9"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </Field>

              <button type="submit" className="btn-primary w-full py-2.5 mt-2" disabled={busy}>
                {busy ? 'Authenticating…' : 'Sign in'}
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="pt-3 text-center border-t border-slate-100 text-sm text-slate-500">
                New patient?{' '}
                <Link to="/register" className="font-semibold text-teal-700 hover:text-teal-800 hover:underline">
                  Create an account
                </Link>
              </div>
            </form>
          </div>

          {/* Quick 1-Click Demo Profiles Showcase */}
          <div className="lg:col-span-6 space-y-4">
            <div className="card p-5 sm:p-6 bg-white/90 border-teal-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">1-Click Instant Demo Login</h3>
                </div>
                <span className="text-2xs bg-teal-100 text-teal-800 font-semibold px-2 py-0.5 rounded-full">
                  Evaluator Mode
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Click any profile to instantly authenticate and evaluate that portal's features:
              </p>

              <div className="grid gap-2.5">
                {DEMO_ACCOUNTS.map((d) => {
                  const Icon = d.icon;
                  return (
                    <button
                      key={d.email}
                      type="button"
                      disabled={busy}
                      onClick={() => loginWithDemo(d.email)}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${d.color}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white shadow-2xs border border-black/5">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900 truncate">{d.name}</p>
                            <span className={`text-2xs font-semibold px-1.5 py-0.2 rounded ${d.badge}`}>
                              {d.role}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">{d.desc}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-2xs text-slate-400">
                <span>Default Demo Password: <code className="font-mono text-slate-600 font-semibold">Password123!</code></span>
                <span className="flex items-center gap-1 text-teal-600 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" /> Ready to test
                </span>
              </div>
            </div>

            {/* Feature Highlights Card */}
            <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <Zap className="w-4 h-4 text-amber-500" /> Key Guarantees Tested &amp; Built In:
              </div>
              <ul className="grid grid-cols-2 gap-2 text-2xs text-slate-500 pl-1">
                <li className="flex items-center gap-1.5">✓ 10-Min Advisory Slot Holds</li>
                <li className="flex items-center gap-1.5">✓ Claude AI Pre-visit Triage</li>
                <li className="flex items-center gap-1.5">✓ Leave Conflict Detection</li>
                <li className="flex items-center gap-1.5">✓ Postgres DLQ &amp; Retries</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

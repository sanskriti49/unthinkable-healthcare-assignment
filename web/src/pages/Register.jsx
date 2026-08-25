import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { ErrorBanner, Field } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  HeartPulse,
  User,
  Mail,
  Lock,
  Phone,
  Calendar,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export default function Register() {
  const { register, user, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/patient" replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      const me = await register(payload);
      toast(`Account created! Welcome, ${me.fullName}.`);
      navigate('/patient', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="text-center mb-6">
          <Link to="/login" className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-teal-700 to-teal-500 text-white shadow-lg shadow-teal-600/25 mb-3">
            <HeartPulse className="w-7 h-7" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Patient Account</h1>
          <p className="mt-1 text-xs text-slate-500">
            Register to consult with clinic specialists and manage prescriptions.
          </p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6 sm:p-8 shadow-sm">
          <ErrorBanner error={error} />

          <Field label="Full Name" required>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                required
                minLength={2}
                className="input pl-9"
                value={form.fullName}
                onChange={set('fullName')}
                placeholder="e.g. Priya Sharma"
              />
            </div>
          </Field>

          <Field label="Email Address" required>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                autoComplete="email"
                className="input pl-9"
                value={form.email}
                onChange={set('email')}
                placeholder="priya@example.com"
              />
            </div>
          </Field>

          <Field label="Password" required hint="At least 8 characters, including a letter and a number.">
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="input pl-9"
                value={form.password}
                onChange={set('password')}
                placeholder="••••••••"
              />
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone Number">
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  className="input pl-9"
                  value={form.phone}
                  onChange={set('phone')}
                  placeholder="+91 98765 43210"
                />
              </div>
            </Field>

            <Field label="Date of Birth" hint="Helps doctor with dosage.">
              <input
                type="date"
                className="input"
                value={form.dateOfBirth}
                onChange={set('dateOfBirth')}
              />
            </Field>
          </div>

          <Field label="Gender">
            <select className="input" value={form.gender} onChange={set('gender')}>
              <option value="">Prefer not to say</option>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
            </select>
          </Field>

          <button type="submit" className="btn-primary w-full py-2.5 mt-2" disabled={busy}>
            {busy ? 'Creating account…' : 'Complete Registration'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="pt-3 text-center border-t border-slate-100 text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-teal-700 hover:text-teal-800 hover:underline">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

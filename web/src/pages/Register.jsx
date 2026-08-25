import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { ErrorBanner, Field } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { HeartPulse } from 'lucide-react';

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
    <div className="min-h-screen flex flex-col justify-center bg-slate-50 px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white mb-3">
            <HeartPulse className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Create Patient Account</h1>
          <p className="mt-1 text-xs text-slate-500">
            Register to book specialist appointments and manage care plans
          </p>
        </div>

        <form onSubmit={submit} className="card p-6 bg-white space-y-4 shadow-xs">
          <ErrorBanner error={error} />

          <Field label="Full name" required>
            <input
              required
              minLength={2}
              className="input"
              value={form.fullName}
              onChange={set('fullName')}
              placeholder="e.g. Priya Sharma"
            />
          </Field>

          <Field label="Email address" required>
            <input
              type="email"
              required
              autoComplete="email"
              className="input"
              value={form.email}
              onChange={set('email')}
              placeholder="priya@example.com"
            />
          </Field>

          <Field label="Password" required hint="At least 8 characters (letters and numbers).">
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone number">
              <input
                className="input"
                value={form.phone}
                onChange={set('phone')}
                placeholder="+91 98765 43210"
              />
            </Field>

            <Field label="Date of birth">
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
              <option value="">Select gender</option>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
              <option>Prefer not to say</option>
            </select>
          </Field>

          <button type="submit" className="btn-primary w-full py-2 mt-2" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>

          <div className="pt-4 text-center border-t border-slate-100 text-xs text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-teal-700 hover:text-teal-800">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { ErrorBanner, Field } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { HeartPulse } from 'lucide-react';

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
      toast(`Signed in as ${me.fullName}`);
      navigate(location.state?.from ?? homeFor(me.role), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center bg-slate-50 px-4 py-12 sm:px-6">
      <div className="mx-auto w-full max-w-sm">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white mb-3">
            <HeartPulse className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Sign in to CarePulse</h1>
          <p className="mt-1 text-xs text-slate-500">
            Clinical appointment scheduling and care management
          </p>
        </div>

        {/* Authentication Card */}
        <div className="card p-6 bg-white shadow-xs">
          <ErrorBanner error={error} className="mb-4" />

          <form onSubmit={submit} className="space-y-4">
            <Field label="Email address" required>
              <input
                type="email"
                required
                autoComplete="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@clinic.local"
              />
            </Field>

            <Field label="Password" required>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </Field>

            <button type="submit" className="btn-primary w-full py-2" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
            Need a patient account?{' '}
            <Link to="/register" className="font-medium text-teal-700 hover:text-teal-800">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

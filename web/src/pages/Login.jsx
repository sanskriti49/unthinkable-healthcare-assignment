import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { ErrorBanner, Field } from '../components/ui.jsx';

const DEMO = [
  { role: 'Patient', email: 'priya@example.com' },
  { role: 'Doctor', email: 'dr.mehta@clinic.local' },
  { role: 'Admin', email: 'admin@clinic.local' },
];

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={location.state?.from ?? homeFor(user.role)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await login(form.email, form.password);
      navigate(location.state?.from ?? homeFor(me.role), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">
          C
        </span>
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Appointments, follow-ups and prescriptions in one place.</p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-6">
        <ErrorBanner error={error} />

        <Field label="Email" required>
          <input
            type="email"
            required
            autoComplete="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
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
          />
        </Field>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-slate-500">
          New patient?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      </form>

      <div className="card mt-6 p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Demo accounts</p>
        <div className="space-y-1">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => setForm({ email: d.email, password: 'Password123!' })}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-700">{d.role}</span>
              <span className="font-mono text-xs text-slate-500">{d.email}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">Password for all demo accounts: Password123!</p>
      </div>
    </div>
  );
}

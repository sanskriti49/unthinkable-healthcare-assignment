import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { ErrorBanner, Field } from '../components/ui.jsx';

export default function Register() {
  const { register, user, loading } = useAuth();
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
      // Empty optional fields must be omitted, not sent as "".
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      await register(payload);
      navigate('/patient', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Patient registration. Doctor accounts are created by the clinic administrator.
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-6">
        <ErrorBanner error={error} />

        <Field label="Full name" required>
          <input required minLength={2} className="input" value={form.fullName} onChange={set('fullName')} />
        </Field>

        <Field label="Email" required>
          <input type="email" required autoComplete="email" className="input" value={form.email} onChange={set('email')} />
        </Field>

        <Field label="Password" required hint="At least 8 characters, including a letter and a number.">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
            value={form.password}
            onChange={set('password')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+91 …" />
          </Field>
          <Field label="Date of birth" hint="Helps the doctor with context.">
            <input type="date" className="input" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
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

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}

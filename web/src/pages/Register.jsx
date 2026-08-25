import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';
import { ErrorBanner, Field } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';
import { HeartPulse, Stethoscope, User } from 'lucide-react';

export default function Register() {
  const { register, user, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [role, setRole] = useState('PATIENT');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    specialisation: 'General Medicine',
    qualifications: 'MBBS',
    roomNumber: '101',
    consultationFee: 50000,
    slotDurationMinutes: 30,
    bio: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={homeFor(user.role)} replace />;

  const set = (key) => (e) => {
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setForm({ ...form, [key]: value });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        role,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        ...(role === 'PATIENT'
          ? {
              dateOfBirth: form.dateOfBirth || undefined,
              gender: form.gender || undefined,
            }
          : {
              specialisation: form.specialisation.trim() || 'General Medicine',
              qualifications: form.qualifications.trim() || 'MBBS',
              roomNumber: form.roomNumber.trim() || undefined,
              consultationFee: form.consultationFee,
              slotDurationMinutes: form.slotDurationMinutes,
              bio: form.bio.trim() || undefined,
            }),
      };

      const me = await register(payload);
      toast(`Account created! Welcome, ${me.fullName} (${me.role}).`);
      navigate(homeFor(me.role), { replace: true });
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
          <h1 className="text-xl font-semibold text-slate-900">Create Your Account</h1>
          <p className="mt-1 text-xs text-slate-500">
            Sign up as a patient or clinical doctor
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div className="flex rounded-lg bg-slate-200/80 p-1 mb-4">
          <button
            type="button"
            onClick={() => setRole('PATIENT')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              role === 'PATIENT'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            I am a Patient
          </button>
          <button
            type="button"
            onClick={() => setRole('DOCTOR')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              role === 'DOCTOR'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            I am a Doctor
          </button>
        </div>

        <form onSubmit={submit} className="card p-6 bg-white space-y-4 shadow-xs">
          <ErrorBanner error={error} />

          <Field label={role === 'DOCTOR' ? 'Doctor Full Name' : 'Full Name'} required>
            <input
              required
              minLength={2}
              className="input"
              value={form.fullName}
              onChange={set('fullName')}
              placeholder={role === 'DOCTOR' ? 'Dr. Ananya Sharma' : 'Priya Sharma'}
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
              placeholder={role === 'DOCTOR' ? 'dr.sharma@clinic.local' : 'priya@example.com'}
            />
          </Field>

          <Field label="Password" required hint="At least 8 characters with letters &amp; numbers.">
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

          {/* Doctor-Specific Configuration */}
          {role === 'DOCTOR' ? (
            <>
              <Field label="Medical Specialisation" required>
                <input
                  required
                  className="input"
                  value={form.specialisation}
                  onChange={set('specialisation')}
                  placeholder="e.g. Cardiology, Dermatology, General Medicine"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Qualifications">
                  <input
                    className="input"
                    value={form.qualifications}
                    onChange={set('qualifications')}
                    placeholder="MBBS, MD"
                  />
                </Field>
                <Field label="Room / OPD #">
                  <input
                    className="input"
                    value={form.roomNumber}
                    onChange={set('roomNumber')}
                    placeholder="Room 102"
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Slot length (mins)" required>
                  <select
                    className="input"
                    value={form.slotDurationMinutes}
                    onChange={set('slotDurationMinutes')}
                  >
                    <option value={15}>15 mins</option>
                    <option value={20}>20 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                  </select>
                </Field>
                <Field label="Consultation fee (paise)" hint="50000 = ₹500">
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    className="input"
                    value={form.consultationFee}
                    onChange={set('consultationFee')}
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
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
            </>
          )}

          <button type="submit" className="btn-primary w-full py-2 mt-2" disabled={busy}>
            {busy ? 'Creating account…' : role === 'DOCTOR' ? 'Register as Doctor' : 'Register as Patient'}
          </button>

          <div className="pt-4 text-center border-t border-slate-100 text-xs text-slate-500">
            Already registered?{' '}
            <Link to="/login" className="font-medium text-teal-700 hover:text-teal-800">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

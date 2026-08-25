import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { DAY_NAMES } from '../../lib/format.js';
import { ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import {
  UserPlus,
  Stethoscope,
  Clock,
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Lock,
  Mail,
  User,
} from 'lucide-react';

const DEFAULT_HOURS = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: '09:00',
  endTime: '17:00',
}));

const blank = {
  email: '',
  password: '',
  fullName: '',
  phone: '',
  specialisation: '',
  qualifications: '',
  bio: '',
  roomNumber: '',
  consultationFee: 50000,
  slotDurationMinutes: 30,
  bookingHorizonDays: 30,
  isAcceptingPatients: true,
};

export default function AdminDoctorForm() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(doctorId);
  const { toast } = useToast();

  const [form, setForm] = useState(blank);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api
      .get(`/admin/doctors/${doctorId}`)
      .then(({ doctor }) => {
        setForm({
          ...blank,
          ...doctor,
          fullName: doctor.user.fullName,
          email: doctor.user.email,
          phone: doctor.user.phone ?? '',
          qualifications: doctor.qualifications ?? '',
          bio: doctor.bio ?? '',
          roomNumber: doctor.roomNumber ?? '',
        });
        setHours(
          doctor.workingHours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            startTime: h.startTime,
            endTime: h.endTime,
          }))
        );
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [doctorId, isEdit]);

  const set = (key) => (e) => {
    const value =
      e.target.type === 'checkbox'
        ? e.target.checked
        : e.target.type === 'number'
          ? Number(e.target.value)
          : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (isEdit) {
        await api.patch(`/admin/doctors/${doctorId}`, {
          fullName: form.fullName,
          phone: form.phone || undefined,
          specialisation: form.specialisation,
          qualifications: form.qualifications || undefined,
          bio: form.bio || undefined,
          roomNumber: form.roomNumber || undefined,
          consultationFee: form.consultationFee,
          slotDurationMinutes: form.slotDurationMinutes,
          bookingHorizonDays: form.bookingHorizonDays,
          isAcceptingPatients: form.isAcceptingPatients,
          workingHours: hours,
        });
        toast('Doctor details updated successfully!');
      } else {
        await api.post('/admin/doctors', {
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          phone: form.phone || undefined,
          specialisation: form.specialisation,
          qualifications: form.qualifications || undefined,
          bio: form.bio || undefined,
          roomNumber: form.roomNumber || undefined,
          consultationFee: form.consultationFee,
          slotDurationMinutes: form.slotDurationMinutes,
          bookingHorizonDays: form.bookingHorizonDays,
          workingHours: hours,
        });
        toast('New doctor registered!');
      }
      navigate('/admin/doctors');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading doctor details…" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <Link to="/admin/doctors" className="btn-ghost text-xs">
        <ArrowLeft className="w-4 h-4" />
        Back to Doctor Directory
      </Link>

      <PageHeader
        title={isEdit ? `Edit Dr. ${form.fullName}` : 'Register New Doctor'}
        description="Configure account credentials, medical practice details, and working shifts."
        icon={UserPlus}
      />

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
        <ErrorBanner error={error} className="lg:col-span-2" />

        {/* Account Credentials */}
        <section className="card p-6 border-slate-200/80 bg-white space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <User className="w-4 h-4 text-teal-600" />
            Doctor Account &amp; Access
          </h2>

          <Field label="Full Name" required>
            <input
              required
              className="input text-xs"
              value={form.fullName}
              onChange={set('fullName')}
              placeholder="e.g. Dr. Ananya Sharma"
            />
          </Field>

          <Field label="Email Address" required hint={isEdit ? 'Email cannot be changed after creation.' : undefined}>
            <input
              type="email"
              required
              className="input text-xs"
              value={form.email}
              onChange={set('email')}
              disabled={isEdit}
              placeholder="dr.sharma@clinic.local"
            />
          </Field>

          {!isEdit && (
            <Field label="Initial Temporary Password" required hint="At least 8 characters. Doctor can change it later.">
              <input
                type="text"
                required
                minLength={8}
                className="input text-xs"
                value={form.password}
                onChange={set('password')}
                placeholder="Password123!"
              />
            </Field>
          )}

          <Field label="Phone Number">
            <input
              className="input text-xs"
              value={form.phone}
              onChange={set('phone')}
              placeholder="+91 98765 43210"
            />
          </Field>
        </section>

        {/* Medical Practice & Grid Settings */}
        <section className="card p-6 border-slate-200/80 bg-white space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-teal-600" />
            Specialisation &amp; Slot Rules
          </h2>

          <Field label="Medical Specialisation" required hint="Used for patient search filters.">
            <input
              required
              className="input text-xs"
              value={form.specialisation}
              onChange={set('specialisation')}
              placeholder="e.g. Cardiology, Dermatology, General Medicine"
            />
          </Field>

          <Field label="Degrees &amp; Qualifications">
            <input
              className="input text-xs"
              value={form.qualifications}
              onChange={set('qualifications')}
              placeholder="e.g. MBBS, MD, DM (Cardiology)"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room / OPD Number">
              <input
                className="input text-xs"
                value={form.roomNumber}
                onChange={set('roomNumber')}
                placeholder="e.g. 104"
              />
            </Field>
            <Field label="Consultation Fee (in paise)" hint="50000 = ₹500">
              <input
                type="number"
                min={0}
                className="input text-xs"
                value={form.consultationFee}
                onChange={set('consultationFee')}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Slot Duration (Minutes)"
              required
              hint={isEdit ? 'Defines the booking grid.' : 'e.g. 15, 20, 30 min'}
            >
              <input
                type="number"
                min={5}
                max={240}
                required
                className="input text-xs"
                value={form.slotDurationMinutes}
                onChange={set('slotDurationMinutes')}
              />
            </Field>
            <Field label="Booking Horizon (Days)" hint="How far ahead patients can book.">
              <input
                type="number"
                min={1}
                max={365}
                className="input text-xs"
                value={form.bookingHorizonDays}
                onChange={set('bookingHorizonDays')}
              />
            </Field>
          </div>

          <Field label="Professional Bio">
            <textarea
              rows={2}
              className="input text-xs"
              value={form.bio}
              onChange={set('bio')}
              placeholder="Clinical summary and special interests..."
            />
          </Field>

          {isEdit && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 pt-1 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                checked={form.isAcceptingPatients}
                onChange={set('isAcceptingPatients')}
              />
              Accepting new patient bookings
            </label>
          )}
        </section>

        {/* Working Hours Editor */}
        <section className="card p-6 border-slate-200/80 bg-white space-y-4 lg:col-span-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              Weekly Clinic Hours
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Slots are generated strictly inside these time windows based on the doctor's slot length.
            </p>
          </div>

          <div className="space-y-2.5">
            {hours.map((h, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <select
                  className="input text-xs w-44 py-1"
                  value={h.dayOfWeek}
                  onChange={(e) => {
                    const next = [...hours];
                    next[i] = { ...h, dayOfWeek: Number(e.target.value) };
                    setHours(next);
                  }}
                >
                  {DAY_NAMES.map((name, day) => (
                    <option key={day} value={day}>{name}</option>
                  ))}
                </select>
                <input
                  type="time"
                  className="input text-xs w-32 py-1"
                  value={h.startTime}
                  onChange={(e) => {
                    const next = [...hours];
                    next[i] = { ...h, startTime: e.target.value };
                    setHours(next);
                  }}
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="time"
                  className="input text-xs w-32 py-1"
                  value={h.endTime}
                  onChange={(e) => {
                    const next = [...hours];
                    next[i] = { ...h, endTime: e.target.value };
                    setHours(next);
                  }}
                />
                <button
                  type="button"
                  className="btn-ghost p-1 text-slate-400 hover:text-red-600"
                  onClick={() => setHours(hours.filter((_, j) => j !== i))}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setHours([...hours, { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' }])}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Working Window
          </button>
        </section>

        <div className="flex items-center gap-3 lg:col-span-2 pt-2">
          <button type="submit" className="btn-primary text-xs" disabled={busy}>
            <Save className="w-3.5 h-3.5" />
            {busy ? 'Saving Profile…' : isEdit ? 'Save Changes' : 'Create Doctor Profile'}
          </button>
          <Link to="/admin/doctors" className="btn-secondary text-xs">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

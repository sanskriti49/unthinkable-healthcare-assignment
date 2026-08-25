import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { DAY_NAMES } from '../../lib/format.js';
import { ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui.jsx';

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
  consultationFee: 0,
  slotDurationMinutes: 30,
  bookingHorizonDays: 30,
  isAcceptingPatients: true,
};

export default function AdminDoctorForm() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(doctorId);

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
      }
      navigate('/admin/doctors');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <Link to="/admin/doctors" className="btn-ghost mb-4">← All doctors</Link>
      <PageHeader title={isEdit ? `Edit Dr ${form.fullName}` : 'Add a doctor'} />

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
        <ErrorBanner error={error} className="lg:col-span-2" />

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Account</h2>

          <Field label="Full name" required>
            <input required className="input" value={form.fullName} onChange={set('fullName')} />
          </Field>

          <Field label="Email" required hint={isEdit ? 'Sign-in address cannot be changed here.' : undefined}>
            <input
              type="email"
              required
              className="input"
              value={form.email}
              onChange={set('email')}
              disabled={isEdit}
            />
          </Field>

          {!isEdit && (
            <Field label="Temporary password" required hint="At least 8 characters. Share it with the doctor securely.">
              <input type="text" required minLength={8} className="input" value={form.password} onChange={set('password')} />
            </Field>
          )}

          <Field label="Phone">
            <input className="input" value={form.phone} onChange={set('phone')} />
          </Field>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Practice</h2>

          <Field label="Specialisation" required hint="Patients search by this.">
            <input required className="input" value={form.specialisation} onChange={set('specialisation')} placeholder="e.g. Cardiology" />
          </Field>

          <Field label="Qualifications">
            <input className="input" value={form.qualifications} onChange={set('qualifications')} placeholder="MBBS, MD" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room number">
              <input className="input" value={form.roomNumber} onChange={set('roomNumber')} />
            </Field>
            <Field label="Consultation fee (paise)" hint="50000 = ₹500">
              <input type="number" min={0} className="input" value={form.consultationFee} onChange={set('consultationFee')} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Slot length (minutes)"
              required
              hint={isEdit ? 'Cannot change while upcoming appointments exist.' : 'Defines the booking grid.'}
            >
              <input
                type="number"
                min={5}
                max={240}
                required
                className="input"
                value={form.slotDurationMinutes}
                onChange={set('slotDurationMinutes')}
              />
            </Field>
            <Field label="Booking horizon (days)" hint="How far ahead patients may book.">
              <input
                type="number"
                min={1}
                max={365}
                className="input"
                value={form.bookingHorizonDays}
                onChange={set('bookingHorizonDays')}
              />
            </Field>
          </div>

          <Field label="Bio">
            <textarea rows={3} className="input" value={form.bio} onChange={set('bio')} />
          </Field>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={form.isAcceptingPatients}
                onChange={set('isAcceptingPatients')}
              />
              Accepting new bookings
            </label>
          )}
        </section>

        <section className="card space-y-4 p-5 lg:col-span-2">
          <div>
            <h2 className="font-semibold text-slate-900">Working hours</h2>
            <p className="text-sm text-slate-500">
              Appointment slots are generated inside these windows. A day with no window offers no slots.
            </p>
          </div>

          <div className="space-y-2">
            {hours.map((h, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  className="input w-40"
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
                  className="input w-32"
                  value={h.startTime}
                  onChange={(e) => {
                    const next = [...hours];
                    next[i] = { ...h, startTime: e.target.value };
                    setHours(next);
                  }}
                />
                <span className="text-slate-400">to</span>
                <input
                  type="time"
                  className="input w-32"
                  value={h.endTime}
                  onChange={(e) => {
                    const next = [...hours];
                    next[i] = { ...h, endTime: e.target.value };
                    setHours(next);
                  }}
                />
                <button
                  type="button"
                  className="btn-ghost text-red-600"
                  onClick={() => setHours(hours.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setHours([...hours, { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' }])}
          >
            + Add a window
          </button>
        </section>

        <div className="flex gap-2 lg:col-span-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create doctor'}
          </button>
          <Link to="/admin/doctors" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </>
  );
}

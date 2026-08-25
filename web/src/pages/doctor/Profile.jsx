import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { DAY_NAMES } from '../../lib/format.js';
import { ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui.jsx';
import CalendarConnect from '../../components/CalendarConnect.jsx';

export default function DoctorProfile() {
  const [doctor, setDoctor] = useState(null);
  const [hours, setHours] = useState([]);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/doctor/me')
      .then((r) => {
        setDoctor(r.doctor);
        setHours(
          r.doctor.workingHours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            startTime: h.startTime,
            endTime: h.endTime,
          }))
        );
      })
      .catch(setError);
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { doctor: updated } = await api.patch('/doctor/me', {
        bio: doctor.bio ?? '',
        qualifications: doctor.qualifications ?? '',
        roomNumber: doctor.roomNumber ?? '',
        isAcceptingPatients: doctor.isAcceptingPatients,
      });
      setDoctor((d) => ({ ...d, ...updated }));
      setSaved('Profile saved.');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveHours(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put('/doctor/working-hours', { hours });
      setSaved('Working hours updated. New slots are available immediately.');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (error && !doctor) return <ErrorBanner error={error} />;
  if (!doctor) return <Spinner />;

  return (
    <>
      <PageHeader title="Your profile" description="What patients see, and when you are available." />

      <ErrorBanner error={error} className="mb-4" />
      {saved && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {saved}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-900">Public profile</h2>

          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-800">Dr {doctor.user.fullName}</p>
            <p className="text-slate-500">
              {doctor.specialisation} · {doctor.slotDurationMinutes} minute slots
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Name, specialisation and slot length are set by the administrator.
            </p>
          </div>

          <Field label="Qualifications">
            <input
              className="input"
              value={doctor.qualifications ?? ''}
              onChange={(e) => setDoctor({ ...doctor, qualifications: e.target.value })}
            />
          </Field>

          <Field label="Room number">
            <input
              className="input"
              value={doctor.roomNumber ?? ''}
              onChange={(e) => setDoctor({ ...doctor, roomNumber: e.target.value })}
            />
          </Field>

          <Field label="About you" hint="Shown on your card in patient search.">
            <textarea
              rows={4}
              className="input"
              value={doctor.bio ?? ''}
              onChange={(e) => setDoctor({ ...doctor, bio: e.target.value })}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
              checked={doctor.isAcceptingPatients}
              onChange={(e) => setDoctor({ ...doctor, isAcceptingPatients: e.target.checked })}
            />
            Accepting new bookings
          </label>

          <button type="submit" className="btn-primary" disabled={busy}>
            Save profile
          </button>
        </form>

        <div className="space-y-6">
          <form onSubmit={saveHours} className="card space-y-4 p-5">
            <div>
              <h2 className="font-semibold text-slate-900">Working hours</h2>
              <p className="text-sm text-slate-500">
                Slots are generated inside these windows on a {doctor.slotDurationMinutes}-minute grid.
              </p>
            </div>

            <div className="space-y-2">
              {hours.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="input flex-1"
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
                    aria-label="Remove window"
                  >
                    ✕
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

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              Save working hours
            </button>
          </form>

          <CalendarConnect />
        </div>
      </div>
    </>
  );
}

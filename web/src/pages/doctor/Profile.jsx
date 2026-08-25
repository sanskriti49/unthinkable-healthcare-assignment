import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { DAY_NAMES } from '../../lib/format.js';
import { ErrorBanner, Field, PageHeader, Spinner, Badge } from '../../components/ui.jsx';
import CalendarConnect from '../../components/CalendarConnect.jsx';
import { useToast } from '../../components/Toast.jsx';
import {
  User,
  Clock,
  CheckCircle2,
  Calendar,
  Save,
  Plus,
  Trash2,
  Stethoscope,
  MapPin,
  FileText,
} from 'lucide-react';

export default function DoctorProfile() {
  const [doctor, setDoctor] = useState(null);
  const [hours, setHours] = useState([]);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

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
      toast('Public profile updated successfully!');
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
      toast('Working hours updated! New slot grid generated.');
      setSaved('Working hours updated.');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (error && !doctor) return <ErrorBanner error={error} />;
  if (!doctor) return <Spinner label="Loading doctor profile…" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Doctor Profile &amp; Clinic Hours"
        description="Manage patient-facing qualifications, bio, consultation room, and recurring working hours."
        icon={User}
      />

      <ErrorBanner error={error} />
      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{saved}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Profile Form */}
        <form onSubmit={saveProfile} className="card p-6 border-slate-200/80 bg-white space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-teal-600" />
            Public Doctor Profile
          </h2>

          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 space-y-1">
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm text-slate-900">Dr. {doctor.user.fullName}</p>
              <Badge tone="brand">{doctor.slotDurationMinutes} min slots</Badge>
            </div>
            <p className="text-xs font-semibold text-teal-700">{doctor.specialisation}</p>
            <p className="text-2xs text-slate-400">
              Specialisation and slot duration are managed by clinic administration.
            </p>
          </div>

          <Field label="Medical Qualifications">
            <input
              className="input text-xs"
              value={doctor.qualifications ?? ''}
              onChange={(e) => setDoctor({ ...doctor, qualifications: e.target.value })}
              placeholder="e.g. MBBS, MD (Internal Medicine), FACP"
            />
          </Field>

          <Field label="Consultation Room / OPD Location">
            <input
              className="input text-xs"
              value={doctor.roomNumber ?? ''}
              onChange={(e) => setDoctor({ ...doctor, roomNumber: e.target.value })}
              placeholder="e.g. 204"
            />
          </Field>

          <Field label="Professional Bio" hint="Displayed on your doctor card in patient search.">
            <textarea
              rows={4}
              className="input text-xs"
              value={doctor.bio ?? ''}
              onChange={(e) => setDoctor({ ...doctor, bio: e.target.value })}
              placeholder="Specialist in preventive care, hypertension, and lifestyle medicine with over 10 years of clinical experience."
            />
          </Field>

          <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 pt-1 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              checked={doctor.isAcceptingPatients}
              onChange={(e) => setDoctor({ ...doctor, isAcceptingPatients: e.target.checked })}
            />
            <span>Currently accepting new patient bookings</span>
          </label>

          <div className="pt-2">
            <button type="submit" className="btn-primary text-xs" disabled={busy}>
              <Save className="w-3.5 h-3.5" />
              {busy ? 'Saving…' : 'Save Profile Changes'}
            </button>
          </div>
        </form>

        {/* Right: Working Hours & Calendar Sync */}
        <div className="space-y-6">
          <form onSubmit={saveHours} className="card p-6 border-slate-200/80 bg-white space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" />
                Weekly Working Hours
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Patients book slots generated on your {doctor.slotDurationMinutes}-minute grid within these hours.
              </p>
            </div>

            <div className="space-y-2.5">
              {hours.map((h, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100">
                  <select
                    className="input text-xs flex-1 py-1"
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
                    className="input text-xs w-28 py-1"
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
                    className="input text-xs w-28 py-1"
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
                    title="Remove window"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setHours([...hours, { dayOfWeek: 1, startTime: '09:00', endTime: '13:00' }])}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Time Window
              </button>

              <button type="submit" className="btn-primary text-xs" disabled={busy}>
                <Save className="w-3.5 h-3.5" />
                Save Working Hours
              </button>
            </div>
          </form>

          <CalendarConnect />
        </div>
      </div>
    </div>
  );
}

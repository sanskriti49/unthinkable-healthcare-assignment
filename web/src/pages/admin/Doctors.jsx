import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { DAY_SHORT, formatFee } from '../../lib/format.js';
import { Badge, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import {
  Users,
  Plus,
  Stethoscope,
  Clock,
  Coins,
  Calendar,
  Edit,
  UserX,
  ShieldCheck,
  Search,
} from 'lucide-react';

function formatDoctorSchedule(workingHours) {
  if (!workingHours?.length) return 'No shifts scheduled';
  const byDay = new Map();
  for (const h of workingHours) {
    if (!byDay.has(h.dayOfWeek)) byDay.set(h.dayOfWeek, []);
    byDay.get(h.dayOfWeek).push(`${h.startTime}–${h.endTime}`);
  }
  const bySchedule = new Map();
  for (const [day, windows] of byDay.entries()) {
    const key = windows.join(', ');
    if (!bySchedule.has(key)) bySchedule.set(key, []);
    bySchedule.get(key).push(day);
  }
  const parts = [];
  for (const [windowStr, days] of bySchedule.entries()) {
    days.sort((a, b) => a - b);
    const isConsecutive = days.length >= 3 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    const dayLabel = isConsecutive
      ? `${DAY_SHORT[days[0]]}–${DAY_SHORT[days[days.length - 1]]}`
      : days.map((d) => DAY_SHORT[d]).join(', ');
    parts.push(`${dayLabel} (${windowStr})`);
  }
  return parts.join(' · ');
}

export default function AdminDoctors() {
  const [doctors, setDoctors] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  const load = () => api.get('/admin/doctors').then((r) => setDoctors(r.doctors)).catch(setError);

  useEffect(() => {
    load();
  }, []);

  async function deactivate(doctor) {
    if (
      !window.confirm(
        `Deactivate Dr. ${doctor.user.fullName}? They will no longer appear in patient search. Their history remains preserved.`
      )
    )
      return;
    try {
      const result = await api.del(`/admin/doctors/${doctor.id}`);
      if (result.warning) window.alert(result.warning);
      toast(`Dr. ${doctor.user.fullName} deactivated.`);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  const filtered = (doctors || []).filter(
    (d) =>
      d.user.fullName.toLowerCase().includes(search.toLowerCase()) ||
      d.specialisation.toLowerCase().includes(search.toLowerCase()) ||
      d.user.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Doctor Profiles &amp; Medical Staff"
        description="Configure specialists, slot durations, consultation fees, and recurring clinic shifts."
        icon={Users}
        action={
          <Link to="/admin/doctors/new" className="btn-primary text-xs">
            <Plus className="w-3.5 h-3.5" />
            Add Doctor Profile
          </Link>
        }
      />

      {/* Search Header */}
      <div className="card p-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            className="input pl-10 text-xs"
            placeholder="Search doctors by name, specialty, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ErrorBanner error={error} />

      {!doctors ? (
        <Spinner label="Loading doctor profiles…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No doctor profiles found"
          action={
            <Link to="/admin/doctors/new" className="btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" />
              Add First Doctor
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map((doctor) => (
            <article
              key={doctor.id}
              className="card p-5 border-slate-200/80 bg-white card-hover flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 font-bold text-xs border border-teal-200/60">
                    <Stethoscope className="w-4 h-4" />
                  </div>
                  <h2 className="font-bold text-base text-slate-900 font-display">Dr. {doctor.user.fullName}</h2>
                  <Badge tone="brand">{doctor.specialisation}</Badge>
                  {!doctor.user.isActive && <Badge tone="red">Deactivated</Badge>}
                  {doctor.user.isActive && !doctor.isAcceptingPatients && (
                    <Badge tone="amber">Not Accepting</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 pl-11">{doctor.user.email}</p>

                <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-4 pl-11">
                  <div>
                    <dt className="text-2xs text-slate-400 font-medium uppercase">Slot Grid</dt>
                    <dd className="font-bold text-slate-800">{doctor.slotDurationMinutes} mins</dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-slate-400 font-medium uppercase">Consultation Fee</dt>
                    <dd className="font-bold text-slate-800 font-mono">{formatFee(doctor.consultationFee)}</dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-slate-400 font-medium uppercase">Booking Horizon</dt>
                    <dd className="font-bold text-slate-800">{doctor.bookingHorizonDays} days</dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-slate-400 font-medium uppercase">Bookings Handled</dt>
                    <dd className="font-bold text-teal-700">{doctor._count.appointments} visits</dd>
                  </div>

                  <div className="col-span-full pt-1">
                    <dt className="text-2xs text-slate-400 font-medium uppercase">Weekly Working Hours</dt>
                    <dd className="text-xs text-slate-700 font-mono font-medium">
                      {formatDoctorSchedule(doctor.workingHours)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                <Link to={`/admin/doctors/${doctor.id}`} className="btn-secondary text-xs">
                  <Edit className="w-3.5 h-3.5" />
                  Edit Settings
                </Link>
                {doctor.user.isActive && (
                  <button
                    type="button"
                    className="btn-danger text-xs"
                    onClick={() => deactivate(doctor)}
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Deactivate
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatFee, DAY_SHORT } from '../../lib/format.js';
import { ErrorBanner, PageHeader, Spinner, EmptyState, Badge } from '../../components/ui.jsx';
import {
  Search,
  Stethoscope,
  Clock,
  Coins,
  MapPin,
  CalendarCheck,
  ChevronRight,
  Filter,
  Sparkles,
} from 'lucide-react';

function formatDoctorSchedule(workingHours) {
  if (!workingHours?.length) return 'Hours upon request';

  // Group windows per day
  const byDay = new Map();
  for (const h of workingHours) {
    if (!byDay.has(h.dayOfWeek)) byDay.set(h.dayOfWeek, []);
    byDay.get(h.dayOfWeek).push(`${h.startTime}–${h.endTime}`);
  }

  // Group identical window schedules
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

export default function FindDoctor() {
  const [specialisations, setSpecialisations] = useState([]);
  const [filter, setFilter] = useState({ specialisation: '', q: '' });
  const [doctors, setDoctors] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/doctors/specialisations').then((r) => setSpecialisations(r.specialisations)).catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setDoctors(null);
    const timer = setTimeout(() => {
      api
        .get('/doctors', { query: { ...filter, acceptingOnly: 'true' }, signal: controller.signal })
        .then((r) => setDoctors(r.doctors))
        .catch((err) => {
          if (err.name !== 'AbortError') setError(err);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filter.specialisation, filter.q]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Find a Specialist Doctor"
        description="Filter by medical specialty, view clinic hours & fees, and pick an appointment slot."
        icon={Search}
      />

      {/* Search & Filter Header Card */}
      <div className="card p-5 space-y-4">
        {/* Quick Filter Specialty Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setFilter({ ...filter, specialisation: '' })}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              filter.specialisation === ''
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
            }`}
          >
            All Specialisations
          </button>
          {specialisations.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setFilter({ ...filter, specialisation: s.name })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filter.specialisation === s.name
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              {s.name} ({s.doctorCount})
            </button>
          ))}
        </div>

        {/* Search by doctor name or qualification */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            id="q"
            className="input pl-10 text-sm"
            placeholder="Search by doctor name, specialisation, or qualifications (e.g. Mehta, MD, Cardiology)..."
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          />
        </div>
      </div>

      <ErrorBanner error={error} />

      {!doctors ? (
        <Spinner label="Searching available doctors…" />
      ) : doctors.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No doctors match your query"
          description="Try selecting a different specialty or clearing the search query."
          action={
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setFilter({ specialisation: '', q: '' })}
            >
              Reset Filters
            </button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {doctors.map((doctor) => (
            <article
              key={doctor.id}
              className="card p-6 card-hover flex flex-col justify-between border-slate-200/80 bg-white"
            >
              <div>
                {/* Doctor Avatar & Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 font-bold border border-teal-200/60 shadow-2xs">
                      <Stethoscope className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 font-display">Dr. {doctor.fullName}</h2>
                      <p className="text-xs font-semibold text-teal-700">{doctor.specialisation}</p>
                      {doctor.qualifications && (
                        <p className="text-2xs text-slate-500 font-medium">{doctor.qualifications}</p>
                      )}
                    </div>
                  </div>
                  <Badge tone="brand">{doctor.slotDurationMinutes} min slot</Badge>
                </div>

                {doctor.bio && (
                  <p className="mt-3.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {doctor.bio}
                  </p>
                )}

                {/* Details Badges */}
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50/80 p-3 border border-slate-100 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="text-2xs text-slate-400 block font-medium">Consultation Fee</span>
                      <span className="font-bold text-slate-900 font-mono">{formatFee(doctor.consultationFee)}</span>
                    </div>
                  </div>

                  {doctor.roomNumber && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
                      <div>
                        <span className="text-2xs text-slate-400 block font-medium">Location</span>
                        <span className="font-bold text-slate-900">Room {doctor.roomNumber}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Clean Working Hours Badge */}
                <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-teal-50/50 p-2.5 border border-teal-100/70 text-xs text-slate-700">
                  <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 text-2xs block text-slate-500 uppercase tracking-wider">Weekly Availability</span>
                    <span className="font-medium text-slate-700 text-xs font-mono truncate block">
                      {formatDoctorSchedule(doctor.workingHours)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100">
                <Link
                  to={`/patient/doctors/${doctor.id}`}
                  className="btn-primary w-full justify-center"
                >
                  <CalendarCheck className="w-4 h-4" />
                  Select Doctor &amp; Choose Slot
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatFee, DAY_SHORT } from '../../lib/format.js';
import { ErrorBanner, PageHeader, Spinner, EmptyState, Badge } from '../../components/ui.jsx';
import {
  Search,
  Stethoscope,
  Clock,
  CalendarCheck,
} from 'lucide-react';

function formatDoctorSchedule(workingHours) {
  if (!workingHours?.length) return 'Hours upon request';

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
      <div className="card p-4 space-y-3">
        {/* Quick Filter Specialty Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setFilter({ ...filter, specialisation: '' })}
            className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filter.specialisation === ''
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Specialisations
          </button>
          {specialisations.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setFilter({ ...filter, specialisation: s.name })}
              className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                filter.specialisation === s.name
                  ? 'bg-teal-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
            className="input pl-10 text-xs"
            placeholder="Search by doctor name, specialisation, or qualifications..."
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
              className="btn-secondary text-xs"
              onClick={() => setFilter({ specialisation: '', q: '' })}
            >
              Reset Filters
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {doctors.map((doctor) => (
            <article
              key={doctor.id}
              className="card p-5 flex flex-col justify-between border-slate-200/80 bg-white"
            >
              <div>
                {/* Doctor Avatar & Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 font-bold border border-teal-200/60">
                      <Stethoscope className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 font-display">Dr. {doctor.fullName}</h2>
                      <p className="text-xs font-semibold text-teal-700">{doctor.specialisation}</p>
                      {doctor.qualifications && (
                        <p className="text-2xs text-slate-400 font-normal">{doctor.qualifications}</p>
                      )}
                    </div>
                  </div>
                  <Badge tone="brand">{doctor.slotDurationMinutes}m slot</Badge>
                </div>

                {doctor.bio && (
                  <p className="mt-3 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {doctor.bio}
                  </p>
                )}

                {/* Consultation Fee & Location */}
                <div className="mt-3.5 flex items-center justify-between text-xs py-2 border-y border-slate-100">
                  <div>
                    <span className="text-2xs text-slate-400 block font-medium">Consultation Fee</span>
                    <span className="font-semibold text-slate-900">{formatFee(doctor.consultationFee)}</span>
                  </div>
                  {doctor.roomNumber && (
                    <div className="text-right">
                      <span className="text-2xs text-slate-400 block font-medium">Location</span>
                      <span className="font-medium text-slate-700">Room {doctor.roomNumber}</span>
                    </div>
                  )}
                </div>

                {/* Clean Working Hours */}
                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-2xs text-slate-500 truncate">{formatDoctorSchedule(doctor.workingHours)}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <Link
                  to={`/patient/doctors/${doctor.id}`}
                  className="btn-primary w-full justify-center text-xs py-2"
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  Book Appointment
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

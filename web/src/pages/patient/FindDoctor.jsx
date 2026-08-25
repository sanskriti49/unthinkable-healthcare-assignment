import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatFee, DAY_SHORT } from '../../lib/format.js';
import { ErrorBanner, PageHeader, Spinner, EmptyState, Badge } from '../../components/ui.jsx';

/** Collapse per-day windows into "Mon–Fri 09:00–17:00"-style summaries. */
function summariseHours(workingHours) {
  if (!workingHours?.length) return 'Hours not published';
  const byDay = new Map();
  for (const h of workingHours) {
    if (!byDay.has(h.dayOfWeek)) byDay.set(h.dayOfWeek, []);
    byDay.get(h.dayOfWeek).push(`${h.startTime}–${h.endTime}`);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, windows]) => `${DAY_SHORT[day]} ${windows.join(', ')}`)
    .join(' · ');
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
    // Debounced so typing in the search box does not fire a request per keystroke.
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
    <>
      <PageHeader title="Find a doctor" description="Search by specialisation, then pick a time that suits you." />

      <div className="card mb-6 flex flex-wrap gap-4 p-4">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="spec">Specialisation</label>
          <select
            id="spec"
            className="input"
            value={filter.specialisation}
            onChange={(e) => setFilter({ ...filter, specialisation: e.target.value })}
          >
            <option value="">All specialisations</option>
            {specialisations.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.doctorCount})
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="q">Search</label>
          <input
            id="q"
            className="input"
            placeholder="Name or qualification"
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          />
        </div>
      </div>

      <ErrorBanner error={error} className="mb-4" />

      {!doctors ? (
        <Spinner />
      ) : doctors.length === 0 ? (
        <EmptyState title="No doctors match" description="Try a different specialisation or clear the search." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {doctors.map((doctor) => (
            <article key={doctor.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Dr {doctor.fullName}</h2>
                  <p className="text-sm font-medium text-brand-700">{doctor.specialisation}</p>
                  {doctor.qualifications && (
                    <p className="text-xs text-slate-500">{doctor.qualifications}</p>
                  )}
                </div>
                <Badge tone="slate">{doctor.slotDurationMinutes} min</Badge>
              </div>

              {doctor.bio && <p className="mt-3 text-sm text-slate-600">{doctor.bio}</p>}

              <dl className="mt-4 space-y-1 text-xs text-slate-500">
                <div className="flex gap-2">
                  <dt className="font-medium">Hours</dt>
                  <dd>{summariseHours(doctor.workingHours)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium">Fee</dt>
                  <dd>{formatFee(doctor.consultationFee)}</dd>
                </div>
              </dl>

              <Link to={`/patient/doctors/${doctor.id}`} className="btn-primary mt-4 self-start">
                See available slots
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDayLabel, formatTime } from '../../lib/format.js';
import { Badge, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui.jsx';

export default function Medications() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setData(null);
    api.get('/patient/medications', { query: { days } }).then(setData).catch(setError);
  }, [days]);

  if (error) return <ErrorBanner error={error} />;
  if (!data) return <Spinner />;

  const { schedule, activeCourses } = data;

  return (
    <>
      <PageHeader
        title="Medication schedule"
        description="Every dose your doctor prescribed, with an email reminder at each time."
        action={
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={3}>Next 3 days</option>
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </select>
        }
      />

      {activeCourses.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 font-semibold text-slate-900">Current courses</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeCourses.map((course) => (
              <article key={course.id} className="card p-4">
                <p className="font-semibold text-slate-900">{course.name}</p>
                <p className="text-sm text-slate-600">
                  {[course.dosage, course.frequency].filter(Boolean).join(' · ')}
                </p>
                {course.instructions && <p className="mt-0.5 text-sm text-slate-500">{course.instructions}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {course.timesOfDay.map((t) => (
                    <Badge key={t} tone="brand">{t}</Badge>
                  ))}
                  <Badge tone="slate">{course.durationDays} days</Badge>
                </div>
                {/*
                  When the AI could not parse the prescription, the schedule came
                  from a rule-based reading of the doctor's text. Saying so lets
                  the patient double-check rather than assume it is authoritative.
                */}
                {course.parsedByFallback && (
                  <p className="mt-2 text-xs text-amber-700">
                    Times were derived automatically from your prescription — check with your doctor if
                    they look wrong.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <h2 className="mb-3 font-semibold text-slate-900">Upcoming doses</h2>
      {schedule.length === 0 ? (
        <EmptyState
          title="No doses scheduled"
          description="When a doctor prescribes medication after a visit, your schedule will appear here."
        />
      ) : (
        <div className="space-y-4">
          {schedule.map((day) => (
            <section key={day.date} className="card p-4">
              <h3 className="mb-3 font-semibold text-slate-800">{formatDayLabel(day.date)}</h3>
              <ul className="divide-y divide-slate-100">
                {day.doses.map((dose) => (
                  <li key={dose.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-sm font-semibold text-brand-700">
                        {formatTime(dose.scheduledFor)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{dose.medication.name}</p>
                        <p className="text-xs text-slate-500">
                          {[dose.medication.dosage, dose.medication.instructions].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    {dose.sentAt && <Badge tone="green">Reminder sent</Badge>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

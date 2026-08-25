import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDayLabel, formatTime } from '../../lib/format.js';
import { Badge, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui.jsx';
import {
  Pill,
  Clock,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Sun,
  Sunset,
  Moon,
  Info,
  Sparkles,
} from 'lucide-react';

export default function Medications() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setData(null);
    api.get('/patient/medications', { query: { days } }).then(setData).catch(setError);
  }, [days]);

  if (error) return <ErrorBanner error={error} />;
  if (!data) return <Spinner label="Loading your medication schedule…" />;

  const { schedule, activeCourses } = data;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Medication Schedule &amp; Reminders"
        description="Prescribed drug courses, dose schedules, and automated email reminders."
        icon={Pill}
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">Timeframe:</span>
            <select
              className="input w-auto text-xs font-semibold"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={3}>Next 3 Days</option>
              <option value={7}>Next 7 Days</option>
              <option value={14}>Next 14 Days</option>
              <option value={30}>Next 30 Days</option>
            </select>
          </div>
        }
      />

      {/* Active Courses Grid */}
      {activeCourses.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Pill className="w-4 h-4 text-teal-600" />
              Active Medication Courses
            </h2>
            <span className="text-2xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
              {activeCourses.length} active
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeCourses.map((course) => (
              <article key={course.id} className="card p-5 border-slate-200/80 bg-white card-hover">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                      <Pill className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900">{course.name}</p>
                      <p className="text-xs text-teal-700 font-medium">
                        {[course.dosage, course.frequency].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                </div>

                {course.instructions && (
                  <p className="mt-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {course.instructions}
                  </p>
                )}

                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {course.timesOfDay.map((t) => (
                    <Badge key={t} tone="brand">{t}</Badge>
                  ))}
                  <Badge tone="slate">{course.durationDays} days duration</Badge>
                </div>

                {course.parsedByFallback && (
                  <p className="mt-3 text-2xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200/60 flex items-start gap-1">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>Schedule generated via rule-based fallback from doctor prescription.</span>
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Daily Timeline */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-600" />
          Scheduled Doses
        </h2>

        {schedule.length === 0 ? (
          <EmptyState
            icon={Pill}
            title="No scheduled doses in this timeframe"
            description="When your doctor completes a consultation with prescriptions, dose reminders will appear here."
          />
        ) : (
          <div className="space-y-4">
            {schedule.map((day) => (
              <section key={day.date} className="card p-5 border-slate-200/80 bg-white">
                <div className="mb-3 flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-bold text-xs">
                    {new Date(day.date).getDate()}
                  </div>
                  <h3 className="font-bold text-sm text-slate-800">{formatDayLabel(day.date)}</h3>
                  <span className="text-2xs text-slate-400 font-medium ml-auto">{day.doses.length} doses scheduled</span>
                </div>

                <ul className="divide-y divide-slate-100">
                  {day.doses.map((dose) => (
                    <li key={dose.id} className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-1">
                      <div className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-xs font-bold text-teal-800 bg-teal-50/80 px-2 py-1 rounded-md text-center border border-teal-200/40">
                          {formatTime(dose.scheduledFor)}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{dose.medication.name}</p>
                          <p className="text-2xs text-slate-500">
                            {[dose.medication.dosage, dose.medication.instructions].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>

                      <div>
                        {dose.sentAt ? (
                          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-2xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" /> Queued
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

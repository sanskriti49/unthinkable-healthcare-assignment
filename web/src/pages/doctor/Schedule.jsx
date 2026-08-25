import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { addDaysKey, formatDayLabel, formatTime, todayKey } from '../../lib/format.js';
import { Badge, ErrorBanner, PageHeader, Spinner, UrgencyBadge } from '../../components/ui.jsx';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  CalendarCheck,
} from 'lucide-react';

const REASON_LABEL = {
  BOOKED: 'Booked',
  TOO_SOON: 'Lead time',
  BEYOND_HORIZON: 'Future horizon',
  NOT_ACCEPTING: 'Closed',
};

export default function DoctorSchedule() {
  const [from, setFrom] = useState(todayKey());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    api
      .get('/doctor/schedule', { query: { from, to: addDaysKey(from, 6) } })
      .then(setData)
      .catch(setError);
  }, [from]);

  const byStart = new Map((data?.appointments ?? []).map((a) => [a.startsAt, a]));

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Weekly Schedule Grid"
        description="View availability, booked patient slots, and urgency status for each day."
        icon={CalendarDays}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => setFrom(addDaysKey(from, -7))}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => setFrom(todayKey())}
            >
              Current Week
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => setFrom(addDaysKey(from, 7))}
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      />

      <ErrorBanner error={error} />

      {!data ? (
        <Spinner label="Loading weekly schedule…" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.days.map((day) => (
            <section key={day.date} className="card p-4 border-slate-200/80 bg-white flex flex-col justify-between">
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-bold text-xs">
                      {new Date(day.date).getDate()}
                    </div>
                    <h2 className="text-xs font-bold text-slate-800">{formatDayLabel(day.date)}</h2>
                  </div>
                  {day.onLeave && <Badge tone="red">On Leave</Badge>}
                </div>

                {day.onLeave ? (
                  <p className="text-2xs text-slate-500 italic p-2 bg-red-50/50 rounded-lg border border-red-100">
                    {day.leaveReason || 'Doctor on leave'}
                  </p>
                ) : day.slots.length === 0 ? (
                  <p className="text-2xs text-slate-400 italic p-2">No clinic hours published for this day.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                    {day.slots.map((slot) => {
                      const appt = byStart.get(slot.startsAt);
                      return (
                        <li
                          key={slot.startsAt}
                          className={`rounded-lg p-2 text-xs border transition-all ${
                            appt
                              ? 'bg-teal-50/80 border-teal-200 text-teal-950 font-medium'
                              : slot.available
                                ? 'bg-emerald-50/50 border-emerald-200/60 text-emerald-800'
                                : 'bg-slate-50 border-slate-100 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-2xs font-bold">{formatTime(slot.startsAt)}</span>
                            {appt ? (
                              <UrgencyBadge urgency={appt.preVisitSummary?.urgency} />
                            ) : (
                              <span className="text-2xs font-semibold">
                                {slot.available ? '● Available' : (REASON_LABEL[slot.reason] ?? 'Closed')}
                              </span>
                            )}
                          </div>
                          {appt && (
                            <p className="mt-1 font-bold text-slate-900 truncate flex items-center gap-1 text-2xs">
                              <User className="w-3 h-3 text-teal-600 shrink-0" />
                              {appt.patient?.fullName}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

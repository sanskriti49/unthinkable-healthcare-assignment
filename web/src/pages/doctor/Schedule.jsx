import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { addDaysKey, formatDayLabel, formatTime, todayKey } from '../../lib/format.js';
import { Badge, ErrorBanner, PageHeader, Spinner, UrgencyBadge } from '../../components/ui.jsx';

const REASON_LABEL = {
  BOOKED: 'Booked',
  TOO_SOON: 'Too soon',
  BEYOND_HORIZON: 'Beyond horizon',
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
    <>
      <PageHeader
        title="Schedule"
        description="Your week, including who is booked into each slot."
        action={
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setFrom(addDaysKey(from, -7))}>
              ← Previous
            </button>
            <button type="button" className="btn-secondary" onClick={() => setFrom(todayKey())}>
              This week
            </button>
            <button type="button" className="btn-secondary" onClick={() => setFrom(addDaysKey(from, 7))}>
              Next →
            </button>
          </div>
        }
      />

      <ErrorBanner error={error} className="mb-4" />

      {!data ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.days.map((day) => (
            <section key={day.date} className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">{formatDayLabel(day.date)}</h2>
                {day.onLeave && <Badge tone="red">On leave</Badge>}
              </div>

              {day.onLeave ? (
                <p className="text-xs text-slate-500">{day.leaveReason}</p>
              ) : day.slots.length === 0 ? (
                <p className="text-xs text-slate-400">No clinic</p>
              ) : (
                <ul className="space-y-1.5">
                  {day.slots.map((slot) => {
                    const appt = byStart.get(slot.startsAt);
                    return (
                      <li
                        key={slot.startsAt}
                        className={`rounded-lg px-2.5 py-1.5 text-xs ${
                          appt
                            ? 'bg-brand-50 text-brand-900'
                            : slot.available
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-medium">{formatTime(slot.startsAt)}</span>
                          {appt ? (
                            <UrgencyBadge urgency={appt.preVisitSummary?.urgency} />
                          ) : (
                            <span>{slot.available ? 'Free' : (REASON_LABEL[slot.reason] ?? '')}</span>
                          )}
                        </div>
                        {appt && <p className="mt-0.5 truncate font-medium">{appt.patient?.fullName}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

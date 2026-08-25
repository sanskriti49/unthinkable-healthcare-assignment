import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateTime, relativeTime } from '../../lib/format.js';
import { ErrorBanner, PageHeader, Spinner, EmptyState, StatusBadge } from '../../components/ui.jsx';

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

export default function PatientAppointments() {
  const [scope, setScope] = useState('upcoming');
  const [appointments, setAppointments] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setAppointments(null);
    api
      .get('/appointments', { query: { scope } })
      .then((r) => setAppointments(r.appointments))
      .catch(setError);
  }, [scope]);

  return (
    <>
      <PageHeader
        title="My appointments"
        action={<Link to="/patient/find" className="btn-primary">Book another</Link>}
      />

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setScope(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              scope === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ErrorBanner error={error} className="mb-4" />

      {!appointments ? (
        <Spinner />
      ) : appointments.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description={scope === 'upcoming' ? 'You have no upcoming appointments.' : 'No appointments to show.'}
          action={<Link to="/patient/find" className="btn-primary">Find a doctor</Link>}
        />
      ) : (
        <ul className="space-y-3">
          {appointments.map((appt) => (
            <li key={appt.id}>
              <Link
                to={`/patient/appointments/${appt.id}`}
                className="card flex flex-wrap items-center justify-between gap-4 p-4 transition-shadow hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">Dr {appt.doctor?.fullName}</p>
                  <p className="text-sm text-slate-500">{appt.doctor?.specialisation}</p>
                  <p className="mt-1 text-sm font-medium text-brand-700">{formatDateTime(appt.startsAt)}</p>
                  {appt.status === 'CANCELLED' && appt.cancelReason === 'DOCTOR_LEAVE' && (
                    <p className="mt-1 text-xs text-red-700">Cancelled — the doctor was unavailable that day.</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {appt.status === 'BOOKED' && (
                    <span className="text-xs text-slate-500">{relativeTime(appt.startsAt)}</span>
                  )}
                  <StatusBadge status={appt.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

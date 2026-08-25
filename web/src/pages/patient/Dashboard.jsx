import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateTime, formatTime, relativeTime } from '../../lib/format.js';
import { ErrorBanner, PageHeader, Spinner, EmptyState, Stat } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';

export default function PatientDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    api
      .get('/patient/dashboard')
      .then(setData)
      .catch(setError);

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorBanner error={error} onRetry={() => { setError(null); load(); }} />;
  if (!data) return <Spinner />;

  const { nextAppointment, dosesToday, completedVisits } = data;

  return (
    <>
      <PageHeader
        title={`Hello, ${user.fullName.split(' ')[0]}`}
        description="Your upcoming care at a glance."
        action={<Link to="/patient/find" className="btn-primary">Book an appointment</Link>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Doses due today" value={dosesToday.length} />
        <Stat label="Completed visits" value={completedVisits} />
        <Stat
          label="Next appointment"
          value={nextAppointment ? relativeTime(nextAppointment.startsAt) : '—'}
          hint={nextAppointment ? `Dr ${nextAppointment.doctor.user.fullName}` : 'Nothing booked'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold text-slate-900">Next appointment</h2>
          {nextAppointment ? (
            <div className="card p-5">
              <p className="text-lg font-semibold text-slate-900">
                Dr {nextAppointment.doctor.user.fullName}
              </p>
              <p className="text-sm text-slate-500">{nextAppointment.doctor.specialisation}</p>
              <p className="mt-3 text-sm font-medium text-brand-700">
                {formatDateTime(nextAppointment.startsAt)}
              </p>
              {nextAppointment.doctor.roomNumber && (
                <p className="text-sm text-slate-500">Room {nextAppointment.doctor.roomNumber}</p>
              )}
              <Link to={`/patient/appointments/${nextAppointment.id}`} className="btn-secondary mt-4">
                View details
              </Link>
            </div>
          ) : (
            <EmptyState
              title="No upcoming appointments"
              description="Search by specialisation to find a doctor and book a slot."
              action={<Link to="/patient/find" className="btn-primary">Find a doctor</Link>}
            />
          )}
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-slate-900">Medication due in the next 24 hours</h2>
          {dosesToday.length === 0 ? (
            <EmptyState title="Nothing due" description="Any prescribed medication will appear here with reminders." />
          ) : (
            <ul className="card divide-y divide-slate-100">
              {dosesToday.map((dose) => (
                <li key={dose.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{dose.medication.name}</p>
                    <p className="text-sm text-slate-500">
                      {dose.medication.dosage}
                      {dose.medication.instructions ? ` · ${dose.medication.instructions}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-brand-700">
                    {formatTime(dose.scheduledFor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/patient/medications" className="btn-ghost mt-2">
            Full schedule →
          </Link>
        </section>
      </div>
    </>
  );
}

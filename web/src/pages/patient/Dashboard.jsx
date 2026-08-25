import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateTime, formatTime, relativeTime } from '../../lib/format.js';
import { ErrorBanner, PageHeader, Spinner, EmptyState, Stat, StatusBadge } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';
import {
  Calendar,
  Clock,
  Pill,
  Search,
  CheckCircle2,
  Stethoscope,
  ArrowRight,
} from 'lucide-react';

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
  if (!data) return <Spinner label="Loading your dashboard…" />;

  const { nextAppointment, dosesToday, completedVisits } = data;
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="View your upcoming clinic consultations, prescriptions, and daily medication schedule."
        action={
          <Link to="/patient/find" className="btn-primary">
            <Search className="w-4 h-4" />
            Find a Doctor
          </Link>
        }
      />

      {/* Summary KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Doses Due Today"
          value={dosesToday.length}
          hint={dosesToday.length > 0 ? 'Active medication schedule' : 'No pending medication'}
          icon={Pill}
          tone={dosesToday.length > 0 ? 'brand' : 'slate'}
        />
        <Stat
          label="Completed Consultations"
          value={completedVisits}
          hint="Past care records saved"
          icon={CheckCircle2}
          tone="green"
        />
        <Stat
          label="Next Appointment"
          value={nextAppointment ? relativeTime(nextAppointment.startsAt) : 'None'}
          hint={nextAppointment ? `Dr. ${nextAppointment.doctor.user.fullName}` : 'No upcoming visits'}
          icon={Calendar}
          tone={nextAppointment ? 'brand' : 'slate'}
        />
      </div>

      {/* Next Appointment & Today's Doses */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Next Appointment Card */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-700" />
              Upcoming Appointment
            </h2>
            {nextAppointment && (
              <Link to="/patient/appointments" className="text-xs font-medium text-teal-700 hover:underline">
                View all visits →
              </Link>
            )}
          </div>

          {nextAppointment ? (
            <div className="card p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-medium border border-teal-200/60">
                    <Stethoscope className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">
                      Dr. {nextAppointment.doctor.user.fullName}
                    </p>
                    <p className="text-xs text-teal-700 font-medium">
                      {nextAppointment.doctor.specialisation}
                    </p>
                    {nextAppointment.doctor.roomNumber && (
                      <p className="text-xs text-slate-400 mt-0.5">Room {nextAppointment.doctor.roomNumber}</p>
                    )}
                  </div>
                </div>
                <StatusBadge status="BOOKED" />
              </div>

              <div className="rounded-md bg-slate-50 p-3 border border-slate-100 flex items-center justify-between text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium">{formatDateTime(nextAppointment.startsAt)}</span>
                </div>
                <span className="text-slate-500 font-medium">
                  {relativeTime(nextAppointment.startsAt)}
                </span>
              </div>

              <div>
                <Link
                  to={`/patient/appointments/${nextAppointment.id}`}
                  className="btn-secondary w-full justify-center text-xs"
                >
                  View Details &amp; Care Plan
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No upcoming visits scheduled"
              description="Choose a doctor and book an available consultation slot."
              action={
                <Link to="/patient/find" className="btn-primary text-xs">
                  <Search className="w-3.5 h-3.5" />
                  Find a Doctor
                </Link>
              }
            />
          )}
        </section>

        {/* Medication Due Today */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Pill className="w-4 h-4 text-teal-700" />
              Medications Due Today
            </h2>
            <Link to="/patient/medications" className="text-xs font-medium text-teal-700 hover:underline">
              Full Schedule →
            </Link>
          </div>

          {dosesToday.length === 0 ? (
            <EmptyState
              icon={Pill}
              title="No medications due today"
              description="Prescribed medications and reminder schedules will appear here after a consultation."
            />
          ) : (
            <div className="card divide-y divide-slate-100 overflow-hidden">
              {dosesToday.map((dose) => (
                <div key={dose.id} className="flex items-center justify-between gap-4 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-600">
                      <Pill className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="font-medium text-xs text-slate-900">{dose.medication.name}</p>
                      <p className="text-2xs text-slate-500">
                        {dose.medication.dosage}
                        {dose.medication.instructions ? ` · ${dose.medication.instructions}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {formatTime(dose.scheduledFor)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

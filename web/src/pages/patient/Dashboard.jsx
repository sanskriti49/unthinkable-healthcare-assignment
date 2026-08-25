import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateTime, formatTime, relativeTime } from '../../lib/format.js';
import { ErrorBanner, PageHeader, Spinner, EmptyState, Stat, Badge } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';
import {
  Calendar,
  Clock,
  Pill,
  Search,
  CheckCircle2,
  Stethoscope,
  HeartPulse,
  ArrowRight,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  User,
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
  if (!data) return <Spinner label="Loading your medical dashboard…" />;

  const { nextAppointment, dosesToday, completedVisits } = data;
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Personalized Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 p-6 sm:p-8 text-white shadow-lg shadow-teal-950/10">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 backdrop-blur-sm border border-teal-400/20 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-teal-300" />
              Patient Health Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {firstName} 👋
            </h1>
            <p className="mt-2 text-sm text-teal-100/80 leading-relaxed">
              Find specialists, track scheduled appointments with 10-minute hold safety, and receive timely dose reminders.
            </p>
          </div>
          <Link
            to="/patient/find"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-teal-950 shadow-md hover:bg-teal-300 transition-all hover:scale-[1.02] shrink-0"
          >
            <Search className="w-4 h-4" />
            Book an Appointment
          </Link>
        </div>
        {/* Background ambient medical pattern */}
        <div className="absolute right-0 top-0 -mt-8 -mr-8 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Doses Due Today"
          value={dosesToday.length}
          hint={dosesToday.length > 0 ? 'Upcoming reminders active' : 'No pending medication'}
          icon={Pill}
          tone={dosesToday.length > 0 ? 'brand' : 'slate'}
        />
        <Stat
          label="Completed Consultations"
          value={completedVisits}
          hint="Care plans & history saved"
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

      {/* Main Content: Next Appointment & Today's Doses */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Next Appointment Card */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              Upcoming Appointment
            </h2>
            {nextAppointment && (
              <Link to="/patient/appointments" className="text-xs font-semibold text-teal-700 hover:underline">
                View all ({completedVisits + 1}) →
              </Link>
            )}
          </div>

          {nextAppointment ? (
            <div className="card p-6 card-hover border-teal-100 bg-white relative overflow-hidden">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 font-bold border border-teal-200/60 shadow-2xs">
                    <Stethoscope className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Dr. {nextAppointment.doctor.user.fullName}
                    </h3>
                    <p className="text-xs font-medium text-teal-700">
                      {nextAppointment.doctor.specialisation}
                      {nextAppointment.doctor.qualifications ? ` · ${nextAppointment.doctor.qualifications}` : ''}
                    </p>
                    {nextAppointment.doctor.roomNumber && (
                      <p className="text-xs text-slate-500 mt-1">Consultation Room {nextAppointment.doctor.roomNumber}</p>
                    )}
                  </div>
                </div>
                <Badge tone="green">Confirmed</Badge>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-3.5 border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <Clock className="w-4 h-4 text-teal-600" />
                  <span>{formatDateTime(nextAppointment.startsAt)}</span>
                </div>
                <span className="text-2xs font-semibold text-slate-500">
                  {relativeTime(nextAppointment.startsAt)}
                </span>
              </div>

              <div className="mt-5 flex items-center justify-between pt-2">
                <Link
                  to={`/patient/appointments/${nextAppointment.id}`}
                  className="btn-primary w-full justify-center"
                >
                  Manage Appointment Details
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No upcoming visits scheduled"
              description="Pick a specialist doctor and book a slot in under 2 minutes."
              action={
                <Link to="/patient/find" className="btn-primary">
                  <Search className="w-4 h-4" />
                  Find a Doctor
                </Link>
              }
            />
          )}
        </section>

        {/* Medication Due Today */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Pill className="w-4 h-4 text-teal-600" />
              Medication Due (Next 24h)
            </h2>
            <Link to="/patient/medications" className="text-xs font-semibold text-teal-700 hover:underline">
              Full Schedule →
            </Link>
          </div>

          {dosesToday.length === 0 ? (
            <EmptyState
              icon={Pill}
              title="No medication due today"
              description="Prescribed medications and reminder schedules from your doctor will automatically appear here."
            />
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-100">
              {dosesToday.map((dose) => (
                <div key={dose.id} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                      <Pill className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900">{dose.medication.name}</p>
                      <p className="text-xs text-slate-500">
                        {dose.medication.dosage}
                        {dose.medication.instructions ? ` · ${dose.medication.instructions}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 border border-teal-200/60">
                      <Clock className="w-3 h-3 text-teal-600" />
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

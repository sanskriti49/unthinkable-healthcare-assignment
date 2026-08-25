import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { formatDateTime, relativeTime } from '../../lib/format.js';
import { ErrorBanner, PageHeader, Spinner, EmptyState, StatusBadge, Badge } from '../../components/ui.jsx';
import {
  Calendar,
  Clock,
  Stethoscope,
  Search,
  ChevronRight,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

const TABS = [
  { key: 'upcoming', label: 'Upcoming Visits' },
  { key: 'past', label: 'Past & Completed' },
  { key: 'all', label: 'All History' },
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
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="My Appointments"
        description="Review upcoming consultation details, care plans, prescriptions, and reschedule if needed."
        icon={Calendar}
        action={
          <Link to="/patient/find" className="btn-primary">
            <Search className="w-4 h-4" />
            Book New Appointment
          </Link>
        }
      />

      {/* Modern Filter Tabs */}
      <div className="flex gap-1.5 rounded-xl bg-slate-200/70 p-1 max-w-md">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setScope(tab.key)}
            className={`flex-1 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              scope === tab.key
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ErrorBanner error={error} />

      {!appointments ? (
        <Spinner label="Loading appointments…" />
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={scope === 'upcoming' ? 'No upcoming visits' : 'No appointments in this category'}
          description={
            scope === 'upcoming'
              ? 'You have no pending consultations scheduled with clinic specialists.'
              : 'Past consultations and care plans will be listed here.'
          }
          action={
            <Link to="/patient/find" className="btn-primary">
              <Search className="w-4 h-4" />
              Find a Doctor
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3.5">
          {appointments.map((appt) => (
            <Link
              key={appt.id}
              to={`/patient/appointments/${appt.id}`}
              className="card p-5 card-hover flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-slate-200/80 bg-white group"
            >
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 font-bold border border-teal-200/60 shadow-2xs group-hover:scale-105 transition-transform">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-base text-slate-900">Dr. {appt.doctor?.fullName}</p>
                    <StatusBadge status={appt.status} />
                  </div>
                  <p className="text-xs font-semibold text-teal-700">{appt.doctor?.specialisation}</p>
                  <p className="mt-1 text-xs text-slate-600 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {formatDateTime(appt.startsAt)}
                  </p>
                  {appt.status === 'CANCELLED' && appt.cancelReason === 'DOCTOR_LEAVE' && (
                    <p className="mt-1 text-xs text-red-700 font-medium">
                      Cancelled — doctor was marked on leave.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                {appt.status === 'BOOKED' && (
                  <span className="text-2xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                    {relativeTime(appt.startsAt)}
                  </span>
                )}
                <div className="flex items-center gap-1 text-xs font-bold text-teal-700 group-hover:translate-x-0.5 transition-transform">
                  <span>View Details</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

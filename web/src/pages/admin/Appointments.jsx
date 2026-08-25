import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateTime } from '../../lib/format.js';
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusBadge, UrgencyBadge } from '../../components/ui.jsx';
import { Calendar, Filter, User, Stethoscope, Clock, ShieldAlert } from 'lucide-react';

export default function AdminAppointments() {
  const [appointments, setAppointments] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [filter, setFilter] = useState({ status: '', doctorId: '' });
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/admin/doctors').then((r) => setDoctors(r.doctors)).catch(() => {});
  }, []);

  useEffect(() => {
    setAppointments(null);
    api
      .get('/admin/appointments', { query: { ...filter, pageSize: 100 } })
      .then((r) => setAppointments(r.appointments))
      .catch(setError);
  }, [filter.status, filter.doctorId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Clinic-wide Appointments"
        description="Live monitor of all patient bookings, concurrency slot holds, cancellations, and AI triage status."
        icon={Calendar}
      />

      {/* Filter Controls */}
      <div className="card p-4 flex flex-wrap gap-4 border-slate-200/80 bg-white">
        <div className="min-w-48 flex-1">
          <label className="label text-xs" htmlFor="status">Filter by Status</label>
          <select
            id="status"
            className="input text-xs"
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">All Statuses</option>
            {['HELD', 'BOOKED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div className="min-w-48 flex-1">
          <label className="label text-xs" htmlFor="doctor">Filter by Doctor</label>
          <select
            id="doctor"
            className="input text-xs"
            value={filter.doctorId}
            onChange={(e) => setFilter({ ...filter, doctorId: e.target.value })}
          >
            <option value="">All Doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>Dr. {d.user.fullName} ({d.specialisation})</option>
            ))}
          </select>
        </div>
      </div>

      <ErrorBanner error={error} />

      {!appointments ? (
        <Spinner label="Loading clinic appointments…" />
      ) : appointments.length === 0 ? (
        <EmptyState icon={Calendar} title="No appointments match the selected filters" />
      ) : (
        <div className="card overflow-x-auto border-slate-200/80 bg-white shadow-xs">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-left font-bold text-slate-600 uppercase tracking-wider text-2xs">
              <tr>
                <th className="px-4 py-3">Scheduled Time</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Doctor &amp; Specialty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">AI Triage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.map((appt) => (
                <tr key={appt.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900 font-mono text-2xs">
                    {formatDateTime(appt.startsAt)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {appt.patient?.fullName}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900 block">Dr. {appt.doctor?.fullName}</span>
                    <span className="text-2xs text-teal-700 font-medium">{appt.doctor?.specialisation}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={appt.status} />
                    {appt.cancelReason === 'DOCTOR_LEAVE' && (
                      <span className="mt-0.5 block text-2xs text-red-600 font-medium">Doctor on leave</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <UrgencyBadge urgency={appt.preVisitSummary?.urgency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

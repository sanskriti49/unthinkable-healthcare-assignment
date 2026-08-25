import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDateTime } from '../../lib/format.js';
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusBadge, UrgencyBadge } from '../../components/ui.jsx';

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
    <>
      <PageHeader title="All appointments" description="Every booking across the clinic." />

      <div className="card mb-6 flex flex-wrap gap-4 p-4">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="status">Status</label>
          <select
            id="status"
            className="input"
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">All</option>
            {['HELD', 'BOOKED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="doctor">Doctor</label>
          <select
            id="doctor"
            className="input"
            value={filter.doctorId}
            onChange={(e) => setFilter({ ...filter, doctorId: e.target.value })}
          >
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>Dr {d.user.fullName}</option>
            ))}
          </select>
        </div>
      </div>

      <ErrorBanner error={error} className="mb-4" />

      {!appointments ? (
        <Spinner />
      ) : appointments.length === 0 ? (
        <EmptyState title="No appointments match" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">Doctor</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Triage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.map((appt) => (
                <tr key={appt.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-700">{formatDateTime(appt.startsAt)}</td>
                  <td className="px-4 py-2 text-slate-700">{appt.patient?.fullName}</td>
                  <td className="px-4 py-2 text-slate-700">
                    Dr {appt.doctor?.fullName}
                    <span className="block text-xs text-slate-400">{appt.doctor?.specialisation}</span>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={appt.status} />
                    {appt.cancelReason === 'DOCTOR_LEAVE' && (
                      <span className="mt-0.5 block text-xs text-red-600">doctor on leave</span>
                    )}
                  </td>
                  <td className="px-4 py-2"><UrgencyBadge urgency={appt.preVisitSummary?.urgency} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

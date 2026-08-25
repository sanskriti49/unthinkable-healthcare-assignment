import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { DAY_SHORT, formatFee } from '../../lib/format.js';
import { Badge, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui.jsx';

export default function AdminDoctors() {
  const [doctors, setDoctors] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api.get('/admin/doctors').then((r) => setDoctors(r.doctors)).catch(setError);

  useEffect(() => {
    load();
  }, []);

  async function deactivate(doctor) {
    if (
      !window.confirm(
        `Deactivate Dr ${doctor.user.fullName}? They can no longer sign in and will not appear in search. Their appointment history is kept.`
      )
    )
      return;
    try {
      const result = await api.del(`/admin/doctors/${doctor.id}`);
      if (result.warning) window.alert(result.warning);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Doctors"
        description="Profiles, specialisations, slot lengths and working hours."
        action={<Link to="/admin/doctors/new" className="btn-primary">Add a doctor</Link>}
      />

      <ErrorBanner error={error} className="mb-4" />

      {!doctors ? (
        <Spinner />
      ) : doctors.length === 0 ? (
        <EmptyState title="No doctors yet" action={<Link to="/admin/doctors/new" className="btn-primary">Add the first</Link>} />
      ) : (
        <div className="space-y-3">
          {doctors.map((doctor) => (
            <article key={doctor.id} className="card flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-900">Dr {doctor.user.fullName}</h2>
                  <Badge tone="brand">{doctor.specialisation}</Badge>
                  {!doctor.user.isActive && <Badge tone="red">Deactivated</Badge>}
                  {doctor.user.isActive && !doctor.isAcceptingPatients && (
                    <Badge tone="amber">Not accepting</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500">{doctor.user.email}</p>

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="font-medium text-slate-500">Slot length</dt>
                    <dd>{doctor.slotDurationMinutes} min</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-medium text-slate-500">Fee</dt>
                    <dd>{formatFee(doctor.consultationFee)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-medium text-slate-500">Horizon</dt>
                    <dd>{doctor.bookingHorizonDays} days</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-medium text-slate-500">Appointments</dt>
                    <dd>{doctor._count.appointments}</dd>
                  </div>
                  <div className="col-span-full flex gap-2">
                    <dt className="font-medium text-slate-500">Hours</dt>
                    <dd>
                      {doctor.workingHours.length === 0
                        ? 'Not set — no slots will be offered'
                        : doctor.workingHours
                            .map((h) => `${DAY_SHORT[h.dayOfWeek]} ${h.startTime}–${h.endTime}`)
                            .join(' · ')}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex shrink-0 gap-2">
                <Link to={`/admin/doctors/${doctor.id}`} className="btn-secondary">Edit</Link>
                {doctor.user.isActive && (
                  <button type="button" className="btn-danger" onClick={() => deactivate(doctor)}>
                    Deactivate
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

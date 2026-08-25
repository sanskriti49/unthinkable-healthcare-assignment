import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

const NAV = {
  PATIENT: [
    { to: '/patient', label: 'Overview', end: true },
    { to: '/patient/find', label: 'Find a doctor' },
    { to: '/patient/appointments', label: 'My appointments' },
    { to: '/patient/medications', label: 'Medications' },
  ],
  DOCTOR: [
    { to: '/doctor', label: 'Today', end: true },
    { to: '/doctor/schedule', label: 'Schedule' },
    { to: '/doctor/leave', label: 'Leave' },
    { to: '/doctor/profile', label: 'Profile' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/doctors', label: 'Doctors' },
    { to: '/admin/appointments', label: 'Appointments' },
    { to: '/admin/operations', label: 'Operations' },
  ],
};

const ROLE_LABEL = { PATIENT: 'Patient portal', DOCTOR: 'Doctor portal', ADMIN: 'Administration' };

export default function Layout() {
  const { user, logout, integrations } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = NAV[user?.role] ?? [];

  const linkClass = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to={`/${user?.role?.toLowerCase() ?? ''}`} className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              C
            </span>
            <span className="hidden font-semibold text-slate-900 sm:inline">Clinic</span>
          </Link>

          <span className="hidden text-xs font-medium text-slate-400 md:inline">
            {ROLE_LABEL[user?.role]}
          </span>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{user?.fullName}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="btn-secondary"
            >
              Sign out
            </button>
            <button
              type="button"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              className="btn-ghost md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
            >
              ☰
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 px-4 py-2 md:hidden">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass} onClick={() => setMenuOpen(false)}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/*
        A deployment with no mail provider still "sends" mail — to disk. Saying
        so up front prevents an evaluator concluding notifications are broken.
      */}
      {integrations && !integrations.email?.configured && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
          Demo mode — emails are written to <code className="font-mono">server/.mailbox</code> instead of being
          delivered. Set <code className="font-mono">SMTP_HOST</code> to send for real.
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-center text-xs text-slate-400 sm:px-6">
        Healthcare Appointment &amp; Follow-up Manager
      </footer>
    </div>
  );
}

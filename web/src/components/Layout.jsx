import React, { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import {
  HeartPulse,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

const NAV_CONFIG = {
  PATIENT: [
    { to: '/patient', label: 'Overview', end: true },
    { to: '/patient/find', label: 'Find Doctor' },
    { to: '/patient/appointments', label: 'Appointments' },
    { to: '/patient/medications', label: 'Medications' },
  ],
  DOCTOR: [
    { to: '/doctor', label: "Today's Schedule", end: true },
    { to: '/doctor/schedule', label: 'Calendar' },
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

const ROLE_LABELS = {
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
  ADMIN: 'Administrator',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileDropdown, setProfileDropdown] = useState(false);

  const links = NAV_CONFIG[user?.role] ?? [];

  const linkClass = ({ isActive }) =>
    `px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
      isActive
        ? 'bg-slate-100 text-slate-900 font-semibold'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Quiet, Professional Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* Brand Logo & Portal Tag */}
          <div className="flex items-center gap-3 shrink-0">
            <Link to={`/${user?.role?.toLowerCase() ?? ''}`} className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-700 text-white">
                <HeartPulse className="w-4 h-4" />
              </div>
              <span className="font-semibold text-slate-900 text-base">
                CarePulse
              </span>
            </Link>

            <span className="hidden sm:inline-block text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
              {ROLE_LABELS[user?.role] ?? user?.role?.toLowerCase()}
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          {/* Right User Profile & Sign Out */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileDropdown(!profileDropdown)}
                className="flex items-center gap-2 rounded-md p-1.5 text-left hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                  {user?.fullName?.charAt(0) ?? 'U'}
                </div>
                <span className="hidden sm:inline text-xs font-medium text-slate-700 truncate max-w-[120px]">
                  {user?.fullName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileDropdown(false)} />
                  <div className="absolute right-0 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg z-50">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="font-medium text-xs text-slate-900 truncate">{user?.fullName}</p>
                      <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Mobile Toggle */}
            <button
              type="button"
              aria-label="Toggle navigation"
              className="p-1.5 md:hidden text-slate-600 rounded hover:bg-slate-100"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 bg-white px-4 py-2 md:hidden">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={linkClass}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Page Content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      {/* Clean Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>CarePulse Healthcare</span>
          <span className="text-slate-400">PostgreSQL Concurrency Protection &amp; Structured AI Summaries</span>
        </div>
      </footer>
    </div>
  );
}

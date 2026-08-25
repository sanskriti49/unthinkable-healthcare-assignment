import React, { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import {
  HeartPulse,
  LogOut,
  Menu,
  X,
  ChevronDown,
  User,
  ShieldCheck,
} from 'lucide-react';

const NAV_CONFIG = {
  PATIENT: [
    { to: '/patient', label: 'Overview', end: true },
    { to: '/patient/find', label: 'Find a Doctor' },
    { to: '/patient/appointments', label: 'Appointments' },
    { to: '/patient/medications', label: 'Medications' },
  ],
  DOCTOR: [
    { to: '/doctor', label: "Today's Clinic", end: true },
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
    `rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
      isActive
        ? 'bg-teal-600 text-white shadow-xs'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/60 selection:bg-teal-100 selection:text-teal-900">
      {/* Modern Spacious Header */}
      <header className="sticky top-0 z-30 glass-header">
        <div className="mx-auto flex max-w-7xl h-16 items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          {/* Left: Brand Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <Link to={`/${user?.role?.toLowerCase() ?? ''}`} className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-700 to-teal-500 text-white shadow-sm group-hover:scale-105 transition-transform">
                <HeartPulse className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-slate-900 tracking-tight text-lg font-display">
                CarePulse
              </span>
            </Link>

            <span className="hidden sm:inline-flex text-2xs font-bold uppercase tracking-wider text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 rounded-full">
              {ROLE_LABELS[user?.role] ?? user?.role?.toLowerCase()}
            </span>
          </div>

          {/* Center: Spacious Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1.5 rounded-full bg-slate-100/90 p-1 border border-slate-200/60">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          {/* Right: Unified Profile Menu */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileDropdown(!profileDropdown)}
                className="flex items-center gap-2.5 rounded-full p-1 sm:pr-3 bg-white border border-slate-200/90 hover:border-teal-400 hover:shadow-xs transition-all cursor-pointer"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800 border border-teal-200">
                  {user?.fullName?.charAt(0) ?? 'U'}
                </div>
                <div className="hidden sm:block text-left text-xs leading-tight">
                  <p className="font-bold text-slate-800 truncate max-w-[120px]">{user?.fullName}</p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {/* Floating Profile & Sign Out Menu */}
              {profileDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileDropdown(false)} />
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl z-50 animate-in fade-in zoom-in-95">
                    {/* User Info Header */}
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <p className="font-bold text-xs text-slate-900">{user?.fullName}</p>
                      <p className="text-2xs text-slate-400 truncate mt-0.5">{user?.email}</p>
                      <div className="mt-2 inline-flex items-center gap-1 text-2xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                        <ShieldCheck className="w-3 h-3 text-teal-600" />
                        {ROLE_LABELS[user?.role] ?? user?.role}
                      </div>
                    </div>

                    {/* Sign Out */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          navigate('/login');
                        }}
                        className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              className="btn-ghost p-2 md:hidden text-slate-600 rounded-lg"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 bg-white px-4 py-3 md:hidden shadow-lg animate-in slide-in-from-top-2">
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

      {/* Main Page Content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      {/* Modern Medical Footer */}
      <footer className="mt-auto border-t border-slate-200/80 bg-white/60 py-6 text-center text-xs text-slate-400">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>CarePulse — Healthcare Appointment &amp; Care Management</span>
          </div>
          <p className="text-slate-400">
            Secure · Concurrency Protected · Clinical AI Summaries
          </p>
        </div>
      </footer>
    </div>
  );
}

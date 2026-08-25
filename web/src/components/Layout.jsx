import React, { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import {
  HeartPulse,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Activity,
} from 'lucide-react';

const NAV_CONFIG = {
  PATIENT: [
    { to: '/patient', label: 'Overview', end: true },
    { to: '/patient/find', label: 'Find Doctor' },
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
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileDropdown, setProfileDropdown] = useState(false);

  const links = NAV_CONFIG[user?.role] ?? [];

  const linkClass = ({ isActive }) =>
    `relative px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 cursor-pointer select-none ${
      isActive
        ? 'bg-slate-900 text-white shadow-xs'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 selection:bg-teal-100 selection:text-teal-900">
      {/* Modern High-Precision Floating Navigation Bar */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/85 border-b border-slate-200/70 transition-shadow">
        <div className="mx-auto flex max-w-7xl h-15 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* Brand Logo & Live System Status */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to={`/${user?.role?.toLowerCase() ?? ''}`}
              className="flex items-center gap-2.5 group transition-transform active:scale-95"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white shadow-xs group-hover:bg-teal-800 transition-colors">
                <HeartPulse className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-slate-900 text-base leading-tight tracking-tight">
                  CarePulse
                </span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wide flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Clinical Portal
                </span>
              </div>
            </Link>

            <span className="hidden sm:inline-block text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200/60 px-2.5 py-0.5 rounded-full ml-1">
              {ROLE_LABELS[user?.role] ?? user?.role?.toLowerCase()}
            </span>
          </div>

          {/* Center: Modern Pill Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 rounded-full bg-slate-100/80 p-1 border border-slate-200/60 shadow-2xs">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          {/* Right User Profile Dropdown & Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileDropdown(!profileDropdown)}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-2xs transition-all cursor-pointer"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-50 text-teal-800 text-xs font-semibold border border-teal-200">
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
                  <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="font-semibold text-xs text-slate-900 truncate">{user?.fullName}</p>
                      <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                      <span className="inline-block mt-1 text-[10px] font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                        {ROLE_LABELS[user?.role] ?? user?.role}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer mt-1"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              aria-label="Toggle navigation"
              className="p-1.5 md:hidden text-slate-600 rounded-lg hover:bg-slate-100"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 bg-white px-4 py-3 md:hidden shadow-lg animate-in slide-in-from-top-2 duration-150">
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

      {/* Main Content with Smooth Route Entry Animation */}
      <main key={location.pathname} className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 page-transition">
        <Outlet />
      </main>

      {/* Modern Medical Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-600">
            <Activity className="w-3.5 h-3.5 text-teal-600" />
            <span>CarePulse — Clinical Scheduling &amp; AI Care Management</span>
          </div>
          <span className="text-slate-400">PostgreSQL Concurrency Protection · Clinical AI Summaries</span>
        </div>
      </footer>
    </div>
  );
}

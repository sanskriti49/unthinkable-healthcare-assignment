import React, { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import {
  Activity,
  HeartPulse,
  Calendar,
  Search,
  Pill,
  Clock,
  CalendarDays,
  User,
  ShieldAlert,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Sparkles,
  ChevronDown,
  Mail,
  Zap,
} from 'lucide-react';

const NAV_CONFIG = {
  PATIENT: [
    { to: '/patient', label: 'Overview', icon: Activity, end: true },
    { to: '/patient/find', label: 'Find a Doctor', icon: Search },
    { to: '/patient/appointments', label: 'My Appointments', icon: Calendar },
    { to: '/patient/medications', label: 'Medications', icon: Pill },
  ],
  DOCTOR: [
    { to: '/doctor', label: "Today's Clinic", icon: HeartPulse, end: true },
    { to: '/doctor/schedule', label: 'Schedule', icon: CalendarDays },
    { to: '/doctor/leave', label: 'Leave Planner', icon: Clock },
    { to: '/doctor/profile', label: 'My Profile', icon: User },
  ],
  ADMIN: [
    { to: '/admin', label: 'Overview', icon: Activity, end: true },
    { to: '/admin/doctors', label: 'Doctor Directory', icon: Users },
    { to: '/admin/appointments', label: 'All Appointments', icon: Calendar },
    { to: '/admin/operations', label: 'Operations & Queue', icon: Zap },
  ],
};

const ROLE_BADGE = {
  PATIENT: { label: 'Patient Portal', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-300/40' },
  DOCTOR: { label: 'Doctor Portal', color: 'bg-teal-500/10 text-teal-700 border-teal-300/40' },
  ADMIN: { label: 'Admin Console', color: 'bg-indigo-500/10 text-indigo-700 border-indigo-300/40' },
};

const DEMO_USERS = [
  { label: 'Patient (Priya)', email: 'priya@example.com', role: 'PATIENT' },
  { label: 'Dr. Mehta (Gen. Med)', email: 'dr.mehta@clinic.local', role: 'DOCTOR' },
  { label: 'Dr. Iyer (Cardiology)', email: 'dr.iyer@clinic.local', role: 'DOCTOR' },
  { label: 'Admin (Operations)', email: 'admin@clinic.local', role: 'ADMIN' },
];

export default function Layout() {
  const { user, login, logout, integrations } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const links = NAV_CONFIG[user?.role] ?? [];
  const currentRoleBadge = ROLE_BADGE[user?.role] || { label: user?.role, color: 'bg-slate-100 text-slate-700' };

  const switchAccount = async (email) => {
    setSwitching(true);
    try {
      await login(email, 'Password123!');
      setSwitcherOpen(false);
      setMenuOpen(false);
    } catch (err) {
      console.error('Failed to switch user:', err);
    } finally {
      setSwitching(false);
    }
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
      isActive
        ? 'bg-teal-50 text-teal-900 font-semibold shadow-xs'
        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/60 selection:bg-teal-100 selection:text-teal-900">
      <header className="sticky top-0 z-30 glass-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* Logo & Portal Badge */}
          <div className="flex items-center gap-3">
            <Link to={`/${user?.role?.toLowerCase() ?? ''}`} className="flex items-center gap-2.5 group">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-700 to-teal-500 text-white shadow-md shadow-teal-500/20 group-hover:scale-105 transition-transform">
                <HeartPulse className="w-5 h-5 animate-pulse-subtle" />
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-900 tracking-tight text-base sm:text-lg">CarePulse</span>
                <span className="hidden sm:inline text-xs text-slate-400 font-normal ml-1">Clinic</span>
              </div>
            </Link>

            <span className={`hidden md:inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${currentRoleBadge.color}`}>
              {currentRoleBadge.label}
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                  {Icon && <Icon className="w-4 h-4 text-slate-400 group-hover:text-teal-600" />}
                  {l.label}
                </NavLink>
              );
            })}
          </nav>

          {/* Right Header Controls: Demo Switcher + User Info + Sign Out */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Demo Switcher Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200/80 bg-teal-50/70 px-2.5 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition-colors shadow-2xs"
                title="Switch demo profile"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span className="hidden sm:inline">Switch Role</span>
                <ChevronDown className="w-3 h-3 text-teal-600" />
              </button>

              {switcherOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50 animate-in fade-in zoom-in-95">
                    <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-slate-400">
                      1-Click Demo Profile Switch
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {DEMO_USERS.map((d) => (
                        <button
                          key={d.email}
                          type="button"
                          disabled={switching}
                          onClick={() => switchAccount(d.email)}
                          className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                            user?.email === d.email
                              ? 'bg-teal-50 text-teal-900 font-semibold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div>
                            <p className="font-medium">{d.label}</p>
                            <p className="text-2xs text-slate-400 font-mono">{d.email}</p>
                          </div>
                          {user?.email === d.email && (
                            <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User Avatar Info */}
            <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200/80">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 border border-slate-200">
                {user?.fullName?.charAt(0) ?? 'U'}
              </div>
              <div className="text-left leading-tight">
                <p className="text-xs font-semibold text-slate-800 truncate max-w-[120px]">{user?.fullName}</p>
                <p className="text-2xs text-slate-400">{user?.role?.toLowerCase()}</p>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="btn-secondary px-2.5 py-1.5 text-xs text-slate-600 hover:text-red-700 hover:border-red-200 hover:bg-red-50/50"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>

            {/* Mobile Hamburger */}
            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              className="btn-ghost p-1.5 md:hidden text-slate-600"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 md:hidden shadow-lg animate-in slide-in-from-top-2">
            <div className="px-2 py-1 mb-1 flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-medium text-slate-500">{user?.fullName}</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-semibold ${currentRoleBadge.color}`}>
                {currentRoleBadge.label}
              </span>
            </div>
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={linkClass}
                  onClick={() => setMenuOpen(false)}
                >
                  {Icon && <Icon className="w-4 h-4 text-slate-400" />}
                  {l.label}
                </NavLink>
              );
            })}
          </nav>
        )}
      </header>

      {/* Integration Notice Banner */}
      {integrations && !integrations.email?.configured && (
        <div className="border-b border-amber-200/80 bg-amber-50/90 px-4 py-2 text-center text-xs text-amber-900 flex items-center justify-center gap-2">
          <Mail className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span>
            <strong>Local Demo Outbox:</strong> Notifications are written to <code className="font-mono bg-amber-100/80 px-1 py-0.5 rounded text-amber-950 font-semibold">server/.mailbox</code> as <code className="font-mono">.eml</code> files.
          </span>
        </div>
      )}

      {/* Main Page Content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      {/* Modern Medical Footer */}
      <footer className="mt-auto border-t border-slate-200/80 bg-white/60 py-6 text-center text-xs text-slate-400">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>Healthcare Appointment &amp; AI Follow-up Manager</span>
          </div>
          <p className="text-slate-400">
            Concurrency Guarded · Postgres Advisory Locks · Claude AI Summaries
          </p>
        </div>
      </footer>
    </div>
  );
}

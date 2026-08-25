import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBanner, Badge } from './ui.jsx';
import { Calendar, CheckCircle2, AlertCircle, ExternalLink, Link2, Unlink } from 'lucide-react';

export default function CalendarConnect() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/calendar/status').then(setStatus).catch(setError);

  useEffect(() => {
    load();
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.get('/calendar/google/connect');
      window.location.href = url;
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.del('/calendar/google');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section className="card p-6 border-slate-200/80 bg-white">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal-600" />
          Google Calendar Sync
        </h2>
        {status.configured && (
          <Badge tone={status.connected ? 'green' : 'slate'}>
            {status.connected ? 'Sync Connected' : 'Disconnected'}
          </Badge>
        )}
      </div>

      <ErrorBanner error={error} className="mt-3" />

      {!status.configured ? (
        <p className="mt-2 text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
          Calendar sync is optional on this deployment. An administrator can enable it by setting{' '}
          <code className="rounded bg-slate-200/60 px-1 py-0.5 font-mono text-2xs">GOOGLE_CLIENT_ID</code> and{' '}
          <code className="rounded bg-slate-200/60 px-1 py-0.5 font-mono text-2xs">GOOGLE_CLIENT_SECRET</code> in{' '}
          <code className="font-mono text-2xs">server/.env</code>.
        </p>
      ) : status.connected ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-emerald-800 bg-emerald-50 p-3 rounded-lg border border-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Calendar sync active. All confirmed appointments sync automatically to your personal Google Calendar.</span>
          </p>
          <button type="button" className="btn-secondary text-xs" onClick={disconnect} disabled={busy}>
            <Unlink className="w-3.5 h-3.5 text-slate-500" />
            Disconnect Google Calendar
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-600">
            Connect your personal Google Calendar to synchronize appointment bookings, reschedules, and cancellations in real time.
          </p>
          <button type="button" className="btn-primary text-xs" onClick={connect} disabled={busy}>
            <Link2 className="w-3.5 h-3.5" />
            {busy ? 'Connecting…' : 'Connect with Google Calendar'}
          </button>
        </div>
      )}
    </section>
  );
}

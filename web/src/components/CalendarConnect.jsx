import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ErrorBanner } from './ui.jsx';

/**
 * Google Calendar connection panel.
 *
 * Shown to both doctors and patients. When the server has no Google
 * credentials this renders as an explanatory note rather than a dead button —
 * calendar sync is optional and the rest of the product works without it.
 */
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
    <section className="card p-5">
      <h2 className="font-semibold text-slate-900">Google Calendar</h2>
      <ErrorBanner error={error} className="mt-3" />

      {!status.configured ? (
        <p className="mt-2 text-sm text-slate-500">
          Calendar sync is not configured on this server. An administrator can enable it by setting{' '}
          <code className="rounded bg-slate-100 px-1 font-mono text-xs">GOOGLE_CLIENT_ID</code> and{' '}
          <code className="rounded bg-slate-100 px-1 font-mono text-xs">GOOGLE_CLIENT_SECRET</code>.
          Appointments work normally without it.
        </p>
      ) : status.connected ? (
        <>
          <p className="mt-2 text-sm text-emerald-700">
            Connected. Appointments are added to your calendar automatically, and updated or removed when they
            change.
          </p>
          <button type="button" className="btn-secondary mt-3" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Connect your calendar and every appointment will appear there automatically.
          </p>
          <button type="button" className="btn-primary mt-3" onClick={connect} disabled={busy}>
            {busy ? 'Redirecting…' : 'Connect Google Calendar'}
          </button>
        </>
      )}
    </section>
  );
}

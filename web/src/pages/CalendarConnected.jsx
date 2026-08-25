import { Link, useSearchParams } from 'react-router-dom';
import { useAuth, homeFor } from '../lib/auth.jsx';

/** Landing page after the Google OAuth redirect. */
export default function CalendarConnected() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const status = params.get('status');
  const detail = params.get('detail');

  const copy = {
    ok: {
      tone: 'emerald',
      title: 'Calendar connected',
      body: 'Your appointments will now appear in Google Calendar automatically, and will be updated or removed when they change.',
    },
    denied: {
      tone: 'amber',
      title: 'Access not granted',
      body: 'You declined the permission request. Everything else works as normal — you can connect later from your profile.',
    },
    error: {
      tone: 'red',
      title: 'Could not connect',
      body: detail ?? 'Something went wrong while connecting your calendar. Please try again.',
    },
  }[status] ?? {
    tone: 'slate',
    title: 'Calendar',
    body: 'Nothing to do here.',
  };

  const toneClass = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    slate: 'border-slate-200 bg-white text-slate-900',
  }[copy.tone];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className={`rounded-xl border p-6 ${toneClass}`}>
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="mt-2 text-sm">{copy.body}</p>
        <Link to={user ? homeFor(user.role) : '/login'} className="btn-primary mt-5">
          Back to the portal
        </Link>
      </div>
    </div>
  );
}

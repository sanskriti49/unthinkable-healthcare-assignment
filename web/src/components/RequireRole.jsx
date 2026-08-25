import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Spinner } from './ui.jsx';
import { homeFor } from '../lib/auth.jsx';

/**
 * Route guard.
 *
 * This is a *usability* control, not a security one — the API enforces roles
 * independently on every request. Its job is to keep people out of screens
 * that would only show them errors.
 */
export default function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;

  return children;
}

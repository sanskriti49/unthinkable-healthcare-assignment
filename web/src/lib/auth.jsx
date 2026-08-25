import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import { setClinicTimezone } from './format.js';

const AuthContext = createContext(null);

/**
 * Session state.
 *
 * On mount we re-validate the stored token against /api/auth/me rather than
 * trusting a cached user object — the role drives every route guard, so it has
 * to come from the server.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [integrations, setIntegrations] = useState(null);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Health also tells us the clinic timezone and which integrations are on.
      try {
        const health = await api.get('/health');
        if (!cancelled) {
          setClinicTimezone(health.clinicTimezone);
          setIntegrations(health.integrations);
        }
      } catch {
        /* the app still works; formatting falls back to the browser zone */
      }

      if (!getToken()) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const { user: me } = await api.get('/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: me } = await api.post('/auth/login', { email, password });
    setToken(token);
    setUser(me);
    return me;
  }, []);

  const register = useCallback(async (payload) => {
    const { token, user: me } = await api.post('/auth/register', payload);
    setToken(token);
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({ user, loading, integrations, login, register, logout, setUser }),
    [user, loading, integrations, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where each role lands after signing in. */
export const homeFor = (role) =>
  ({ ADMIN: '/admin', DOCTOR: '/doctor', PATIENT: '/patient' })[role] ?? '/';

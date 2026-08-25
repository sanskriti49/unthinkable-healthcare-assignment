/**
 * Thin API client.
 *
 * Everything goes through `request`, which normalises the backend's error
 * envelope into an `ApiError` carrying the machine-readable `code`. Screens
 * switch on that code (SLOT_TAKEN, HOLD_EXPIRED, LEAVE_HAS_CONFLICTS…) rather
 * than matching on message text.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api';
const TOKEN_KEY = 'clinic.token';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — the session simply won't persist across reloads */
  }
};

/** Callback the auth provider registers so a 401 anywhere logs the user out. */
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, path, { body, query, signal } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const token = getToken();
  let response;
  try {
    response = await fetch(url.toString().replace(window.location.origin, ''), {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.');
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(response.status, 'BAD_RESPONSE', 'The server returned an unexpected response');
  }

  if (!response.ok) {
    const error = payload.error ?? {};
    if (response.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(
      response.status,
      error.code ?? 'UNKNOWN',
      error.message ?? 'Something went wrong',
      error.details
    );
  }

  return payload;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),
};

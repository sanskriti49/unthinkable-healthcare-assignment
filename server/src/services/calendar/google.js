import { google } from 'googleapis';
import { prisma } from '../../db.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

const log = logger('calendar');

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

/** Raised when Google is not configured. Callers skip sync rather than fail. */
export class CalendarNotConfiguredError extends Error {
  constructor(message = 'Google Calendar is not configured') {
    super(message);
    this.name = 'CalendarNotConfiguredError';
    this.notConfigured = true;
  }
}

export function oauthClient() {
  if (!env.google.enabled) throw new CalendarNotConfiguredError();
  return new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
}

/**
 * URL the user is sent to in order to grant calendar access.
 * `state` carries our own user id so the callback can attribute the grant.
 */
export function buildConsentUrl(state) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline', // required to receive a refresh token
    prompt: 'consent', // force a refresh token even on re-authorisation
    scope: CALENDAR_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/** Exchange the callback code for tokens and persist the grant. */
export async function completeOAuth({ code, userId }) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let googleEmail = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    googleEmail = data.email ?? null;
  } catch (err) {
    // Not fatal — we only use this for display.
    log.warn('could not read Google account email', { error: err.message });
  }

  const data = {
    provider: 'google',
    googleEmail,
    accessToken: tokens.access_token ?? '',
    // Google only returns a refresh token on first consent; keep the existing
    // one if this is a re-authorisation that omitted it.
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    scope: tokens.scope ?? CALENDAR_SCOPES.join(' '),
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    isActive: true,
  };

  return prisma.calendarAccount.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/**
 * Authorised Calendar client for a user, or null when they have not connected
 * an account. Refreshed tokens are written back so the next call reuses them.
 */
async function calendarFor(userId) {
  if (!env.google.enabled) return null;

  const account = await prisma.calendarAccount.findUnique({ where: { userId } });
  if (!account || !account.isActive) return null;

  const client = oauthClient();
  client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken ?? undefined,
    expiry_date: account.expiresAt ? account.expiresAt.getTime() : undefined,
  });

  client.on('tokens', (tokens) => {
    prisma.calendarAccount
      .update({
        where: { userId },
        data: {
          ...(tokens.access_token ? { accessToken: tokens.access_token } : {}),
          ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          ...(tokens.expiry_date ? { expiresAt: new Date(tokens.expiry_date) } : {}),
        },
      })
      .catch((err) => log.warn('failed to persist refreshed token', { userId, error: err.message }));
  });

  return {
    api: google.calendar({ version: 'v3', auth: client }),
    calendarId: account.calendarId,
  };
}

/**
 * A revoked or expired grant is permanent until the user reconnects — retrying
 * it is pointless, so it is distinguished from transient API errors.
 */
function isAuthFailure(err) {
  const status = err?.response?.status ?? err?.code;
  return status === 401 || status === 403 || err?.message?.includes('invalid_grant');
}

async function deactivateGrant(userId, reason) {
  log.warn('deactivating calendar grant', { userId, reason });
  await prisma.calendarAccount
    .update({ where: { userId }, data: { isActive: false } })
    .catch(() => {});
}

/**
 * Create an event in one user's calendar.
 * @returns {Promise<string|null>} event id, or null when the user has no grant
 */
export async function createEvent(userId, event) {
  const ctx = await calendarFor(userId);
  if (!ctx) return null;

  try {
    const { data } = await ctx.api.events.insert({
      calendarId: ctx.calendarId,
      requestBody: event,
      sendUpdates: 'none', // our own emails are the notification channel
    });
    log.info('calendar event created', { userId, eventId: data.id });
    return data.id ?? null;
  } catch (err) {
    if (isAuthFailure(err)) {
      await deactivateGrant(userId, err.message);
      return null;
    }
    throw err;
  }
}

export async function updateEvent(userId, eventId, patch) {
  if (!eventId) return null;
  const ctx = await calendarFor(userId);
  if (!ctx) return null;

  try {
    const { data } = await ctx.api.events.patch({
      calendarId: ctx.calendarId,
      eventId,
      requestBody: patch,
      sendUpdates: 'none',
    });
    return data.id ?? null;
  } catch (err) {
    // Someone deleted the event in Google directly — nothing to reconcile.
    if (err?.response?.status === 404 || err?.response?.status === 410) return null;
    if (isAuthFailure(err)) {
      await deactivateGrant(userId, err.message);
      return null;
    }
    throw err;
  }
}

export async function deleteEvent(userId, eventId) {
  if (!eventId) return false;
  const ctx = await calendarFor(userId);
  if (!ctx) return false;

  try {
    await ctx.api.events.delete({ calendarId: ctx.calendarId, eventId, sendUpdates: 'none' });
    log.info('calendar event deleted', { userId, eventId });
    return true;
  } catch (err) {
    // Already gone counts as success — deletion is idempotent.
    if (err?.response?.status === 404 || err?.response?.status === 410) return true;
    if (isAuthFailure(err)) {
      await deactivateGrant(userId, err.message);
      return false;
    }
    throw err;
  }
}

export async function isConnected(userId) {
  if (!env.google.enabled) return false;
  const account = await prisma.calendarAccount.findUnique({ where: { userId } });
  return Boolean(account?.isActive);
}

export async function disconnect(userId) {
  await prisma.calendarAccount.deleteMany({ where: { userId } });
}

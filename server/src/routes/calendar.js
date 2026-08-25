import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../lib/async-handler.js';
import { authenticate } from '../middleware/auth.js';
import { badRequest } from '../lib/errors.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { buildConsentUrl, completeOAuth, isConnected, disconnect } from '../services/calendar/index.js';

const router = Router();
const log = logger('calendar:oauth');

/** Whether this deployment has Google configured, and whether *I* am connected. */
router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({
      configured: env.google.enabled,
      connected: env.google.enabled ? await isConnected(req.user.id) : false,
    });
  })
);

/**
 * Begin the OAuth flow.
 *
 * `state` is a short-lived signed JWT rather than a raw user id: the callback
 * arrives without our session cookie or Authorization header, so the state is
 * the only thing tying the grant to a user — it must not be forgeable.
 */
router.get(
  '/google/connect',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!env.google.enabled) {
      throw badRequest(
        'CALENDAR_NOT_CONFIGURED',
        'Google Calendar is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
      );
    }

    const state = jwt.sign({ sub: req.user.id, purpose: 'calendar-oauth' }, env.jwt.secret, {
      expiresIn: '10m',
    });

    res.json({ url: buildConsentUrl(state) });
  })
);

/** Google redirects the browser here after consent. */
router.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;
    const redirect = (status, detail) =>
      res.redirect(`${env.appUrl}/calendar/connected?status=${status}${detail ? `&detail=${encodeURIComponent(detail)}` : ''}`);

    if (error) return redirect('denied', String(error));
    if (!code || !state) return redirect('error', 'Missing code or state');

    let payload;
    try {
      payload = jwt.verify(String(state), env.jwt.secret);
      if (payload.purpose !== 'calendar-oauth') throw new Error('wrong purpose');
    } catch {
      log.warn('rejected calendar callback with bad state');
      return redirect('error', 'This authorisation link is invalid or has expired');
    }

    try {
      await completeOAuth({ code: String(code), userId: payload.sub });
      log.info('calendar connected', { userId: payload.sub });
      return redirect('ok');
    } catch (err) {
      log.error('calendar OAuth exchange failed', { error: err.message });
      return redirect('error', err.message);
    }
  })
);

router.delete(
  '/google',
  authenticate,
  asyncHandler(async (req, res) => {
    await disconnect(req.user.id);
    res.json({ disconnected: true });
  })
);

export default router;

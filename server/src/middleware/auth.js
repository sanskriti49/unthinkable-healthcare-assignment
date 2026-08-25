import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { asyncHandler } from '../lib/async-handler.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}

/**
 * Verifies the bearer token and loads the user. The DB round-trip is
 * deliberate: it means deactivating a user takes effect immediately rather
 * than when their token happens to expire.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch {
    throw unauthorized('Session expired or invalid — please sign in again');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { doctorProfile: { select: { id: true, specialisation: true } } },
  });
  if (!user || !user.isActive) throw unauthorized('Account not found or deactivated');

  req.user = user;
  req.doctorProfileId = user.doctorProfile?.id ?? null;
  next();
});

/** Route guard: `requireRole('ADMIN')`, `requireRole('DOCTOR', 'ADMIN')`. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This action requires the ${roles.join(' or ')} role`));
    }
    next();
  };

/** Attaches `req.user` when a valid token is present, but never rejects. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  if (!req.headers.authorization) return next();
  try {
    await new Promise((resolve, reject) =>
      authenticate(req, null, (err) => (err ? reject(err) : resolve()))
    );
  } catch {
    // ignore — anonymous access
  }
  next();
});

import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

const log = logger('http');

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `No route matches ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.status >= 500) log.error(err.message, { code: err.code, stack: err.stack });
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  // Prisma surfaces a few conditions we can translate into something useful.
  if (err?.code === 'P2002') {
    return res.status(409).json({
      error: { code: 'DUPLICATE', message: 'That record already exists', details: err.meta?.target },
    });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }

  log.error('Unhandled error', { message: err?.message, stack: err?.stack });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our end. Please try again.',
      ...(env.isProduction ? {} : { debug: err?.message }),
    },
  });
}

import { ZodError } from 'zod';
import { badRequest } from '../lib/errors.js';

/**
 * Validates and *replaces* the given request part with the parsed result, so
 * handlers work with coerced, trusted values rather than raw strings.
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  try {
    req[source] = schema.parse(req[source]);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      }));
      return next(badRequest('VALIDATION_FAILED', 'Some fields need attention', details));
    }
    next(err);
  }
};

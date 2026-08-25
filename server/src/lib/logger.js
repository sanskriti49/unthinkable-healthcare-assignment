const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? LEVELS.info;

function emit(level, scope, message, meta) {
  if (LEVELS[level] < threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta ? { meta } : {}),
  };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify(line));
}

/** Returns a logger bound to a scope, e.g. `logger('booking')`. */
export const logger = (scope) => ({
  debug: (message, meta) => emit('debug', scope, message, meta),
  info: (message, meta) => emit('info', scope, message, meta),
  warn: (message, meta) => emit('warn', scope, message, meta),
  error: (message, meta) => emit('error', scope, message, meta),
});

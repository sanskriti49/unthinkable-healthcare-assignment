import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma, disconnect } from './db.js';
import { Worker, startMaintenance } from './jobs/runner.js';

const log = logger('server');

const app = createApp();
const server = app.listen(env.port, () => {
  log.info('API listening', {
    port: env.port,
    env: env.nodeEnv,
    timezone: env.clinicTimezone,
    llm: env.llm.enabled ? env.llm.model : 'disabled (heuristic fallbacks)',
    email: env.email.driver,
    googleCalendar: env.google.enabled ? 'configured' : 'not configured',
  });
});

/**
 * Running the worker in-process keeps a small deployment to one service. Set
 * RUN_WORKER_INLINE=false and run `npm run worker` to scale them separately.
 */
let worker = null;
if (env.worker.runInline) {
  worker = new Worker();
  startMaintenance();
  await worker.start();
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutting down', { signal });

  server.close();
  if (worker) await worker.stop();
  await disconnect();

  // Give in-flight requests a moment, then exit regardless.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', { reason: String(reason) });
});

import { Worker, startMaintenance } from './jobs/runner.js';
import { logger } from './lib/logger.js';
import { disconnect } from './db.js';

const log = logger('worker:main');

const worker = new Worker();
startMaintenance();
await worker.start();

async function shutdown(signal) {
  log.info('shutting down', { signal });
  await worker.stop();
  await disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

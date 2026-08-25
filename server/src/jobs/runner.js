import { logger } from '../lib/logger.js';
import {
  claimJobs,
  markFailed,
  markSucceeded,
  newWorkerId,
  reclaimStalledJobs,
  enqueue,
  JobType,
} from '../services/queue.js';
import { getHandler } from './handlers.js';
import { env } from '../config/env.js';

const log = logger('worker');

/**
 * The worker loop.
 *
 * Runs either inside the API process (RUN_WORKER_INLINE=true, convenient for a
 * single-process deploy) or standalone via `npm run worker`. Because claiming
 * uses `FOR UPDATE SKIP LOCKED`, any number of instances can run at once
 * without extra coordination.
 */
export class Worker {
  constructor({ pollIntervalMs = env.worker.pollIntervalMs, batchSize = env.worker.batchSize } = {}) {
    this.id = newWorkerId();
    this.pollIntervalMs = pollIntervalMs;
    this.batchSize = batchSize;
    this.running = false;
    this.timer = null;
    this.processed = 0;
    this.failed = 0;
  }

  async runOnce() {
    const jobs = await claimJobs(this.id, this.batchSize);
    if (jobs.length === 0) return 0;

    for (const job of jobs) {
      const startedAt = Date.now();
      try {
        const handler = getHandler(job.type);
        const result = await handler(job.payload ?? {});
        await markSucceeded(job.id);
        this.processed += 1;
        log.info('job done', {
          id: job.id,
          type: job.type,
          attempt: job.attempts,
          ms: Date.now() - startedAt,
          ...(result && typeof result === 'object' ? { result } : {}),
        });
      } catch (err) {
        this.failed += 1;
        await markFailed(job, err);
      }
    }

    return jobs.length;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    log.info('worker started', { id: this.id, pollIntervalMs: this.pollIntervalMs });

    await reclaimStalledJobs().catch((err) =>
      log.warn('stalled-job reclaim failed', { error: err.message })
    );
    // A periodic sweep catches holds whose individual expiry job was lost.
    await enqueue({ type: JobType.EXPIRE_HOLDS, payload: {}, maxAttempts: 2 }).catch(() => {});

    const tick = async () => {
      if (!this.running) return;
      try {
        // Drain: if a full batch came back there is probably more waiting, so
        // loop again immediately rather than sleeping through the backlog.
        let processed = 0;
        do {
          processed = await this.runOnce();
        } while (this.running && processed >= this.batchSize);
      } catch (err) {
        log.error('worker tick failed', { error: err.message, stack: err.stack });
      }
      if (this.running) this.timer = setTimeout(tick, this.pollIntervalMs);
    };

    this.timer = setTimeout(tick, 0);
  }

  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    log.info('worker stopped', { id: this.id, processed: this.processed, failed: this.failed });
  }
}

/** Periodic maintenance: reclaim stalled jobs and sweep expired holds. */
export function startMaintenance(intervalMs = 5 * 60_000) {
  const timer = setInterval(async () => {
    try {
      await reclaimStalledJobs();
      await enqueue({ type: JobType.EXPIRE_HOLDS, payload: {}, maxAttempts: 2 });
    } catch (err) {
      log.warn('maintenance pass failed', { error: err.message });
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

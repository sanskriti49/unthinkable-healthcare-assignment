import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const log = logger('queue');

/**
 * A durable job queue on top of Postgres.
 *
 * Why not Redis/BullMQ: this system's jobs (emails, LLM calls, medication
 * reminders) are low-volume and *must not be lost*, and they all mutate the
 * same database anyway. Keeping the queue in Postgres means one fewer service
 * to run, and — the part that actually matters — a job can be enqueued in the
 * *same transaction* as the state change that caused it. There is no window
 * where an appointment is booked but its confirmation email was never queued.
 *
 * Concurrency safety comes from `FOR UPDATE SKIP LOCKED`: each worker claims a
 * disjoint batch of rows, so N workers scale out without coordination.
 */

export const JobType = {
  SEND_EMAIL: 'send_email',
  PRE_VISIT_SUMMARY: 'pre_visit_summary',
  POST_VISIT_SUMMARY: 'post_visit_summary',
  MEDICATION_REMINDER: 'medication_reminder',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  EXPIRE_HOLDS: 'expire_holds',
  CALENDAR_SYNC: 'calendar_sync',
};

/**
 * Enqueue a job.
 *
 * @param {object}  job
 * @param {string}  job.type        one of JobType
 * @param {object}  job.payload     JSON-serialisable handler input
 * @param {Date}    [job.runAt]     earliest execution time (default: now)
 * @param {number}  [job.maxAttempts]
 * @param {number}  [job.priority]  higher runs first among due jobs
 * @param {object}  [job.tx]        Prisma transaction client — pass this to
 *                                  make enqueueing atomic with your write
 */
export async function enqueue({ type, payload = {}, runAt, maxAttempts = 5, priority = 0, tx }) {
  const client = tx ?? prisma;
  const job = await client.job.create({
    data: {
      type,
      payload,
      runAt: runAt ?? new Date(),
      maxAttempts,
      priority,
      status: 'PENDING',
    },
  });
  log.debug('enqueued', { id: job.id, type, runAt: job.runAt });
  return job;
}

/**
 * Atomically claim up to `limit` due jobs for this worker.
 *
 * SKIP LOCKED is what makes this safe under concurrency: a row already locked
 * by another worker's transaction is passed over rather than waited on, so two
 * workers never hand the same job to their handlers.
 */
export async function claimJobs(workerId, limit = env.worker.batchSize) {
  const rows = await prisma.$queryRaw`
    WITH claimed AS (
      SELECT "id"
      FROM "Job"
      WHERE "status" = 'PENDING' AND "runAt" <= NOW()
      ORDER BY "priority" DESC, "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "Job" j
    SET "status"    = 'RUNNING',
        "lockedAt"  = NOW(),
        "lockedBy"  = ${workerId},
        "startedAt" = COALESCE(j."startedAt", NOW()),
        "attempts"  = j."attempts" + 1,
        "updatedAt" = NOW()
    FROM claimed
    WHERE j."id" = claimed."id"
    RETURNING j.*;
  `;
  return rows;
}

/** Exponential backoff with full jitter, capped. */
export function backoffSeconds(attempt) {
  const base = env.worker.backoffBaseSeconds * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(base, env.worker.backoffMaxSeconds);
  // Full jitter spreads retries so a provider outage does not produce a
  // synchronised thundering herd the moment it recovers.
  return Math.round(capped / 2 + Math.random() * (capped / 2));
}

export async function markSucceeded(jobId, result) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'SUCCEEDED',
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      ...(result !== undefined ? { payload: undefined } : {}),
    },
  });
}

/**
 * Record a failed attempt. Reschedules with backoff while attempts remain;
 * otherwise dead-letters the job (status FAILED) so it stays visible in the
 * admin dashboard instead of vanishing.
 */
export async function markFailed(job, error) {
  const message = String(error?.message ?? error).slice(0, 2000);
  const history = Array.isArray(job.errorLog) ? job.errorLog : [];
  const entry = { attempt: job.attempts, at: new Date().toISOString(), error: message };
  const exhausted = job.attempts >= job.maxAttempts;

  if (exhausted) {
    log.error('job dead-lettered', { id: job.id, type: job.type, attempts: job.attempts, error: message });
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        lastError: message,
        errorLog: [...history, entry],
        lockedAt: null,
        lockedBy: null,
        completedAt: new Date(),
      },
    });
    return { deadLettered: true };
  }

  const delay = backoffSeconds(job.attempts);
  const runAt = new Date(Date.now() + delay * 1000);
  log.warn('job failed, retrying', { id: job.id, type: job.type, attempt: job.attempts, retryInSeconds: delay });
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: 'PENDING',
      runAt,
      lastError: message,
      errorLog: [...history, entry],
      lockedAt: null,
      lockedBy: null,
    },
  });
  return { deadLettered: false, retryInSeconds: delay };
}

/**
 * Re-queue a dead-lettered job as a fresh row, preserving the failed original
 * as an audit record. Used by the admin "retry" action.
 */
export async function retryDeadLetter(jobId) {
  const original = await prisma.job.findUnique({ where: { id: jobId } });
  if (!original) return null;
  if (original.status !== 'FAILED') return original;

  return prisma.job.create({
    data: {
      type: original.type,
      payload: original.payload,
      maxAttempts: original.maxAttempts,
      priority: original.priority + 1,
      runAt: new Date(),
      retryOfId: original.id,
    },
  });
}

/**
 * Reclaim jobs whose worker died mid-run (RUNNING with a stale lock). Without
 * this, a crashed worker would strand its in-flight jobs forever.
 */
export async function reclaimStalledJobs(staleAfterMinutes = 15) {
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60_000);
  const { count } = await prisma.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: cutoff } },
    data: { status: 'PENDING', lockedAt: null, lockedBy: null, runAt: new Date() },
  });
  if (count > 0) log.warn('reclaimed stalled jobs', { count });
  return count;
}

export function newWorkerId() {
  return `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
}

export async function queueStats() {
  const grouped = await prisma.job.groupBy({ by: ['status'], _count: { _all: true } });
  const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  return {
    pending: byStatus.PENDING ?? 0,
    running: byStatus.RUNNING ?? 0,
    succeeded: byStatus.SUCCEEDED ?? 0,
    failed: byStatus.FAILED ?? 0,
    cancelled: byStatus.CANCELLED ?? 0,
  };
}

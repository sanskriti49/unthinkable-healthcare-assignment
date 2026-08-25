import { prisma } from '../../db.js';
import { enqueue, JobType } from '../queue.js';
import { render } from './templates.js';
import { sendMail } from './transport.js';
import { logger } from '../../lib/logger.js';

const log = logger('email');

/**
 * Queue an email for delivery.
 *
 * Notifications are *never* sent inline on the request path. Instead we write
 * an EmailLog row plus a Job row — ideally inside the caller's transaction —
 * so that "the appointment was booked" and "its confirmation is queued" commit
 * or roll back together. A provider outage then delays notifications; it can
 * never lose one, and can never fail a booking.
 *
 * @param {object} opts
 * @param {string} opts.to        recipient address
 * @param {string} opts.template  key in services/email/templates.js
 * @param {object} opts.data      template variables
 * @param {Date}   [opts.sendAt]  schedule for later (reminders)
 * @param {object} [opts.tx]      Prisma transaction client
 */
export async function queueEmail({ to, template, data, sendAt, appointmentId, tx, priority = 0 }) {
  const client = tx ?? prisma;
  const { subject, html } = render(template, data);

  const emailLog = await client.emailLog.create({
    data: { to, subject, template, body: html, status: 'PENDING', appointmentId: appointmentId ?? null },
  });

  const job = await enqueue({
    type: JobType.SEND_EMAIL,
    payload: { emailLogId: emailLog.id },
    runAt: sendAt,
    maxAttempts: 5,
    priority,
    tx: client,
  });

  await client.emailLog.update({ where: { id: emailLog.id }, data: { jobId: job.id } });
  log.debug('email queued', { to, template, sendAt: sendAt ?? 'now' });
  return { emailLogId: emailLog.id, jobId: job.id };
}

/**
 * Deliver a queued email. Called by the send_email job handler.
 * Throws on failure so the queue applies backoff and, ultimately, dead-letters.
 */
export async function deliverQueuedEmail(emailLogId) {
  const record = await prisma.emailLog.findUnique({ where: { id: emailLogId } });
  if (!record) throw new Error(`EmailLog ${emailLogId} not found`);
  if (record.status === 'SUCCEEDED') {
    log.debug('email already delivered, skipping', { emailLogId });
    return { alreadySent: true };
  }
  if (record.status === 'CANCELLED') {
    log.debug('email cancelled before delivery', { emailLogId });
    return { cancelled: true };
  }

  try {
    const { messageId, driver } = await sendMail({
      to: record.to,
      subject: record.subject,
      html: record.body,
    });
    await prisma.emailLog.update({
      where: { id: emailLogId },
      data: {
        status: 'SUCCEEDED',
        sentAt: new Date(),
        attempts: { increment: 1 },
        providerMessageId: messageId,
        lastError: null,
      },
    });
    return { messageId, driver };
  } catch (err) {
    await prisma.emailLog.update({
      where: { id: emailLogId },
      data: { attempts: { increment: 1 }, lastError: String(err?.message ?? err).slice(0, 2000) },
    });
    throw err;
  }
}

/**
 * Mark an email as no-longer-wanted (e.g. a reminder for an appointment that
 * was since cancelled). The job still runs but exits immediately.
 */
export async function cancelPendingEmails({ appointmentId, templates: only, tx }) {
  const client = tx ?? prisma;
  const { count } = await client.emailLog.updateMany({
    where: {
      appointmentId,
      status: 'PENDING',
      ...(only ? { template: { in: only } } : {}),
    },
    data: { status: 'CANCELLED' },
  });
  return count;
}

export { render } from './templates.js';

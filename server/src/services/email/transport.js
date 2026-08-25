import path from 'node:path';
import fs from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

const log = logger('email');

let cached = null;

/**
 * Builds the nodemailer transport.
 *
 * With no SMTP credentials we fall back to nodemailer's stream transport and
 * persist each message as an .eml file. That is not a stub that swallows mail:
 * every notification is really rendered, really "delivered", and inspectable on
 * disk — so the reminder/retry/cancellation flows can be demonstrated end to
 * end before anyone has a mail provider. Swapping in SMTP_HOST is the only
 * change needed for real delivery.
 */
export function getTransport() {
  if (cached) return cached;

  if (env.email.driver === 'smtp' && env.email.smtpConfigured) {
    cached = {
      kind: 'smtp',
      transporter: nodemailer.createTransport({
        host: env.email.smtp.host,
        port: env.email.smtp.port,
        secure: env.email.smtp.secure,
        auth: env.email.smtp.user
          ? { user: env.email.smtp.user, pass: env.email.smtp.pass }
          : undefined,
      }),
    };
    log.info('SMTP transport ready', { host: env.email.smtp.host, port: env.email.smtp.port });
    return cached;
  }

  cached = {
    kind: 'file',
    transporter: nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true }),
  };
  log.warn('No SMTP credentials — emails will be written to disk', { dir: env.email.outboxDir });
  return cached;
}

/**
 * Sends one message. Throws on failure so the calling job records the error and
 * retries with backoff; it never swallows a delivery error.
 *
 * @returns {Promise<{messageId: string, driver: string}>}
 */
export async function sendMail({ to, subject, html, text }) {
  const { kind, transporter } = getTransport();
  const message = {
    from: env.email.from,
    to,
    subject,
    html,
    text: text ?? stripHtml(html),
  };

  const info = await transporter.sendMail(message);

  if (kind === 'file') {
    const dir = path.resolve(process.cwd(), env.email.outboxDir);
    await fs.mkdir(dir, { recursive: true });
    const safe = `${Date.now()}-${to.replace(/[^a-z0-9]+/gi, '_')}.eml`;
    const file = path.join(dir, safe);
    await fs.writeFile(file, info.message);
    log.info('email written to outbox', { to, subject, file });
    return { messageId: file, driver: 'file' };
  }

  log.info('email sent', { to, subject, messageId: info.messageId });
  return { messageId: info.messageId, driver: 'smtp' };
}

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h1|h2)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Test seam — forces the transport to be rebuilt on next use. */
export function resetTransport() {
  cached = null;
}

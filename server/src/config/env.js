import 'dotenv/config';

/**
 * Central environment access.
 *
 * Every external integration (LLM, email, Google Calendar) is *optional*. The
 * app boots and every core flow works with none of them configured — the
 * relevant feature degrades to a documented fallback instead of throwing. That
 * is deliberate: see docs/DESIGN.md, "Notification and LLM failure handling".
 */

const bool = (v, fallback = false) => {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy server/.env.example to server/.env and fill it in.`
    );
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 4000),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  databaseUrl: required('DATABASE_URL'),

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  /**
   * IANA timezone the clinic operates in. Working hours are expressed in this
   * zone and expanded into UTC instants; everything is *stored* in UTC.
   */
  clinicTimezone: process.env.CLINIC_TIMEZONE ?? 'Asia/Kolkata',

  booking: {
    /** How long a slot hold survives without confirmation. */
    holdTtlMinutes: int(process.env.SLOT_HOLD_TTL_MINUTES, 10),
    /** Minimum notice before an appointment start for booking/cancelling. */
    minLeadMinutes: int(process.env.BOOKING_MIN_LEAD_MINUTES, 30),
    /** How long before the visit the reminder email goes out. */
    reminderLeadHours: int(process.env.APPOINTMENT_REMINDER_LEAD_HOURS, 24),
  },

  llm: {
    /**
     * Anthropic API key. Intentionally left blank in .env.example — drop your
     * key in later and the LLM features light up with no code change.
     */
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
    model: process.env.LLM_MODEL ?? 'claude-opus-5',
    maxTokens: int(process.env.LLM_MAX_TOKENS, 1400),
    timeoutMs: int(process.env.LLM_TIMEOUT_MS, 25_000),
    maxAttempts: int(process.env.LLM_MAX_ATTEMPTS, 3),
    get enabled() {
      return Boolean(process.env.ANTHROPIC_API_KEY);
    },
  },

  email: {
    /**
     * 'smtp'  — real delivery through SMTP (SendGrid, Mailgun, Gmail, …)
     * 'file'  — write .eml files to EMAIL_OUTBOX_DIR (default in development,
     *           so the whole notification flow is demoable with no credentials)
     */
    driver: process.env.EMAIL_DRIVER ?? (process.env.SMTP_HOST ? 'smtp' : 'file'),
    from: process.env.EMAIL_FROM ?? 'Clinic Reception <no-reply@clinic.local>',
    outboxDir: process.env.EMAIL_OUTBOX_DIR ?? '.mailbox',
    smtp: {
      host: process.env.SMTP_HOST ?? '',
      port: int(process.env.SMTP_PORT, 587),
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
    get smtpConfigured() {
      return Boolean(process.env.SMTP_HOST);
    },
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/api/calendar/google/callback',
    get enabled() {
      return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    },
  },

  worker: {
    /** Poll interval when the queue is empty. */
    pollIntervalMs: int(process.env.WORKER_POLL_INTERVAL_MS, 3_000),
    batchSize: int(process.env.WORKER_BATCH_SIZE, 5),
    /** Base for exponential backoff: delay = base * 2^(attempt-1) + jitter. */
    backoffBaseSeconds: int(process.env.JOB_BACKOFF_BASE_SECONDS, 30),
    backoffMaxSeconds: int(process.env.JOB_BACKOFF_MAX_SECONDS, 3_600),
    /**
     * Run the worker loop inside the API process. Convenient for a single-dyno
     * deploy or local dev; set false and run `npm run worker` separately to
     * scale them independently.
     */
    runInline: bool(process.env.RUN_WORKER_INLINE, true),
  },

  seed: {
    /** Password given to every demo account created by prisma/seed.js. */
    demoPassword: process.env.SEED_PASSWORD ?? 'Password123!',
  },
};

/**
 * Human-readable integration status, surfaced at GET /api/health so it is
 * obvious which optional pieces are wired up in a given deployment.
 */
export function integrationStatus() {
  return {
    llm: env.llm.enabled
      ? { configured: true, model: env.llm.model }
      : { configured: false, note: 'ANTHROPIC_API_KEY not set — heuristic fallbacks in use' },
    email:
      env.email.driver === 'smtp'
        ? { configured: true, driver: 'smtp', host: env.email.smtp.host }
        : { configured: false, driver: 'file', note: `writing .eml files to ${env.email.outboxDir}` },
    googleCalendar: env.google.enabled
      ? { configured: true, redirectUri: env.google.redirectUri }
      : { configured: false, note: 'GOOGLE_CLIENT_ID/SECRET not set — calendar sync skipped' },
  };
}

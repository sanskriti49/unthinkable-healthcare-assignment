# Healthcare Appointment & Follow-up Manager

A clinic appointment system with three portals — **patient**, **doctor** and
**admin** — built around two things that are easy to get subtly wrong: booking
under concurrency, and AI features that must never break the product when they
fail.

- **Booking is safe under genuine concurrency.** A partial unique index plus
  advisory locks means twelve simultaneous requests for one slot produce exactly
  one booking — verified by a test that actually races them.
- **Every integration is optional.** With no API key, no SMTP host and no Google
  credentials, the whole system still runs end to end. Each feature degrades to
  a documented fallback instead of failing.

**Stack:** React 19 · Vite 6 · Tailwind 4 · Node 20 · Express · PostgreSQL 16 · Prisma

## Documentation

| | |
|---|---|
| [**Design write-up**](docs/DESIGN.md) | Double-booking, slot holds, leave conflicts, notification failures |
| [API reference](docs/API.md) | Every endpoint, request/response shapes, error codes |
| [Database schema](docs/SCHEMA.md) | Tables, relationships, and the constraints that carry the guarantees |
| [LLM prompts](docs/LLM_PROMPTS.md) | Both prompts verbatim, output schemas, and the fallbacks |
| [Google Calendar setup](docs/GOOGLE_CALENDAR.md) | OAuth 2.0 walkthrough |

---

## Quick start

**Prerequisites:** Node ≥ 20, and Postgres 16 (or Docker).

```bash
git clone <repository-url>
cd healthcare-app

# 1. Install. This also runs `prisma generate` automatically.
npm install

# 2. Start Postgres (skip if you already have one running)
docker compose up -d db

# 3. Configure the server
cp server/.env.example server/.env
#    Only DATABASE_URL and JWT_SECRET are required.
#    The API key goes in server/.env as ANTHROPIC_API_KEY — see "Adding your API key".

# 4. Create the schema and demo data
npm run db:migrate
npm run db:seed

# 5. Run it (starts the API and the frontend together)
npm run dev
```

Run every command from the **repository root** — this is an npm workspace, so a
single `npm install` at the root covers both `server/` and `web/`. Once `.env`
exists, steps 1, 4 and 5 can be shortened to `npm run setup && npm run dev`.

- Frontend → <http://localhost:5173>
- API → <http://localhost:4000/api/health>

### Demo accounts

All use the password `Password123!`

| Role | Email |
|---|---|
| Admin | `admin@clinic.local` |
| Doctor | `dr.mehta@clinic.local` (General Medicine, 30-min slots, Mon–Fri) |
| Doctor | `dr.iyer@clinic.local` (Cardiology, 20-min slots, Tue–Sat) |
| Doctor | `dr.dsouza@clinic.local` (Dermatology, 15-min slots, Mon/Wed/Fri) |
| Patient | `priya@example.com` |

### A five-minute tour

1. Sign in as **priya@example.com** → *Find a doctor* → pick a specialisation →
   choose a slot. The slot is **held for 10 minutes** with a live countdown
   while you describe your symptoms. Try opening the same slot in a second
   browser — it is already gone.
2. Sign in as **dr.mehta@clinic.local**. Her clinic list shows each patient with
   an urgency label, red flags, and three suggested questions. Highest urgency
   sorts to the top.
3. *Record consultation* — add notes and a prescription like
   `Amoxicillin 500mg 1-0-1 x 5 days after food`.
4. Back as the patient: a plain-language summary and a **dose-by-dose medication
   schedule**, with reminders queued for each dose.
5. As the doctor, go to *Leave* and mark a day that already has patients. It
   refuses, showing exactly who would be affected, until you confirm — then it
   cancels them and emails each patient alternative slots.
6. As **admin@clinic.local** → *Operations*: every background job and email,
   with the dead-letter queue and per-attempt error history.

Without SMTP configured, emails are written to `server/.mailbox/` as `.eml`
files — open them to see exactly what each party received.

---

## Troubleshooting

**`@prisma/client did not initialize yet. Please run "prisma generate"`**

Prisma generates a client into `node_modules` from `schema.prisma`; until that
runs there is nothing to import. `npm install` does it via a `postinstall` hook,
but if you installed before that hook existed — or your installer skipped
lifecycle scripts (`--ignore-scripts`, some CI caches, some pnpm/yarn setups) —
generate it by hand:

```bash
npm run db:generate --workspace=server
# or:  cd server && npx prisma generate
```

**Only the API starts when I run `npm run dev` (Windows)**

Fixed. The script previously joined the two processes with `&`, which backgrounds
on Unix but runs *sequentially* in `cmd.exe` and is a call operator in
PowerShell, so the frontend never started. It now uses `concurrently`. If you
are on an older copy, run `npm run dev:server` and `npm run dev:web` in two
terminals.

**`Can't reach database server` / `P1001`**

Postgres is not running, or `DATABASE_URL` is wrong. Check `docker compose ps`,
and confirm the credentials in `server/.env` match `docker-compose.yml`
(`healthcare` / `healthcare` / `healthcare` by default). A hosted database
usually needs `?sslmode=require` appended.

**`npm test` fails but the app works**

The tests need a migrated, seeded database — they race real transactions rather
than mocking. Run `npm run db:migrate && npm run db:seed` first.

**Emails aren't arriving**

Expected with no `SMTP_HOST`. They are written as `.eml` files to
`server/.mailbox/` instead. `GET /api/health` reports which integrations are
live.

---

## Adding your API key

**The AI features work with no key at all**, using deterministic fallbacks. To
turn on real AI summaries, put your key in `server/.env`:

```bash
ANTHROPIC_API_KEY="sk-ant-..."     # from console.anthropic.com/settings/keys
LLM_MODEL="claude-opus-5"          # optional; this is the default
```

Restart the server. That is the only change — no code edits, no migration.
`GET /api/health` will report `llm.configured: true`, and new summaries will be
labelled *AI-generated* instead of *AI unavailable — automated fallback*.

The same applies to the other two integrations: set `SMTP_HOST` (and friends)
for real email, or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` for calendar sync.
Every placeholder is documented in [`server/.env.example`](server/.env.example).

---

## What it does

### Admin
Create and manage doctor profiles — specialisation, qualifications, room, fee,
**slot duration**, booking horizon, and weekly working hours. Mark leave for any
doctor. Browse patients and all appointments. Monitor the background job queue,
the email delivery log, and the dead-letter queue, with one-click retry.

### Patient
Register and sign in. Search doctors by specialisation. See real availability,
hold a slot while filling in symptoms, then confirm. Reschedule or cancel. After
a visit: a plain-language summary, care instructions, warning signs, and a full
medication schedule with reminders.

### Doctor
A daily clinic list ordered by triage urgency, each patient with an AI pre-visit
summary. Weekly schedule grid. Mark leave, with a confirmation step showing who
gets disrupted. Record consultations and prescriptions. Edit working hours and
profile. Connect Google Calendar.

### AI features
1. **Pre-visit triage** — symptoms → urgency (Low/Medium/High), chief complaint,
   red flags, and three questions specific to that patient.
2. **Post-visit follow-up** — clinical notes and prescription → a patient-friendly
   summary and a structured medication schedule that drives the reminders.

Both use Claude with **structured outputs**, so responses are schema-valid by
construction. Both degrade to deterministic fallbacks. See
[docs/LLM_PROMPTS.md](docs/LLM_PROMPTS.md).

### Background jobs
A Postgres-backed queue (no Redis) handles emails, AI generation, medication
reminders, hold expiry and calendar sync. Jobs are enqueued *in the same
transaction* as the change that caused them, retry with exponential backoff and
jitter, and dead-letter visibly rather than disappearing.

---

## Project layout

```
healthcare-app/
├── docs/                     Design write-up, API, schema, prompts, calendar setup
├── server/
│   ├── prisma/
│   │   ├── schema.prisma     Data model
│   │   ├── migrations/       init + booking_guards (the partial unique indexes)
│   │   └── seed.js           Demo data
│   ├── src/
│   │   ├── config/env.js     All configuration, with integration status
│   │   ├── lib/time.js       Timezone-aware slot maths (no date library)
│   │   ├── middleware/       auth (JWT + roles), zod validation, error envelope
│   │   ├── routes/           auth, doctors, appointments, doctor, patient, admin, calendar
│   │   ├── services/
│   │   │   ├── booking.js    ★ advisory locks, holds, reschedule, cancel
│   │   │   ├── slots.js      Availability derivation
│   │   │   ├── leave.js      ★ leave conflicts and patient notification
│   │   │   ├── queue.js      ★ Postgres job queue (FOR UPDATE SKIP LOCKED)
│   │   │   ├── medication.js Reminder scheduling
│   │   │   ├── llm/          ★ client, prompts, fallbacks, both features
│   │   │   ├── email/        Templates, transport, delivery
│   │   │   └── calendar/     Google OAuth and event sync
│   │   ├── jobs/             Handlers and the worker loop
│   │   ├── index.js          API entry point
│   │   └── worker.js         Standalone worker entry point
│   └── test/                 Concurrency and resilience tests
└── web/
    └── src/
        ├── lib/              API client, auth context, formatting
        ├── components/       Layout, route guard, UI primitives
        └── pages/            patient/ · doctor/ · admin/
```

---

## Commands

All from the repository root:

```bash
npm run setup          # install + migrate + seed (needs server/.env first)
npm run dev            # API (:4000) + frontend (:5173) together
npm run dev:server     # API only
npm run dev:web        # Frontend only
npm run dev:worker     # Standalone job worker
npm run build          # Production frontend build

npm run db:migrate     # Apply migrations
npm run db:seed        # Demo data (idempotent)
npm run db:generate --workspace=server   # Regenerate the Prisma client
npm test               # Concurrency + resilience tests
```

## Testing

```bash
npm test
```

Requires a running, migrated, seeded database — the concurrency tests race real
transactions rather than mocking them, which is the only way to have any
confidence in the guarantee.

- `test/concurrency.test.js` — simultaneous holds and bookings on one slot;
  direct-insert bypass rejected by the database; a cancelled appointment frees
  its slot; expired holds reclaimed; a patient cannot be double-booked.
- `test/resilience.test.js` — triage rubric and negation handling; prescription
  parsing; an unreachable LLM degrading instead of failing; backoff growth and
  capping; a failing job retrying then dead-lettering with its error history.

## Deployment

The app is two processes (API, frontend) plus Postgres. `RUN_WORKER_INLINE=true`
runs the job worker inside the API, so a minimal deploy is one web service, one
static site and one database. Set it to `false` and run `npm run worker`
separately to scale them independently.

Checklist:

1. Provision Postgres and set `DATABASE_URL` (usually with `?sslmode=require`).
2. Set a strong `JWT_SECRET` (`openssl rand -base64 48`).
3. Set `APP_URL`, `API_URL` and `CORS_ORIGINS` to real domains.
4. Set `CLINIC_TIMEZONE`.
5. Run `npm run db:migrate` on release.
6. Optional: `ANTHROPIC_API_KEY`, SMTP credentials, Google OAuth credentials —
   and add the production redirect URI in the Google console.

Build the frontend with `npm run build --workspace=web`; serve `web/dist` as a
static site with SPA rewrites to `index.html`.

# Google Calendar setup

Calendar sync is **optional**. With `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
unset, appointments are marked `NOT_CONFIGURED` and everything else works
normally — the UI explains this rather than showing a dead button.

## What it does

- On confirmation, an event is created in **both** parties' calendars.
- On reschedule, both events are **patched** (not duplicated).
- On cancellation, both events are **deleted**.
- Doctor and patient connect independently — a doctor may be connected while a
  patient is not, and the appointment works either way.
- Sync always runs as a background job, so a Google outage delays events but
  never fails a booking. Failures retry with backoff and dead-letter.

## Setup

### 1. Create a project

<https://console.cloud.google.com> → new project (e.g. "Clinic Appointments").

### 2. Enable the Calendar API

APIs & Services → Library → **Google Calendar API** → Enable.

### 3. Configure the OAuth consent screen

APIs & Services → OAuth consent screen.

- **User type**: *External* (unless you have a Workspace org).
- Fill in app name, support email, developer contact.
- **Scopes** — add exactly:
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/userinfo.email` (used only to show which
    account is connected)
- **Test users** — while the app is in *Testing*, only listed accounts can
  connect. Add every email you intend to demo with.

### 4. Create the OAuth client

APIs & Services → Credentials → Create Credentials → **OAuth client ID** →
Application type **Web application**.

Add the redirect URI. It must match `GOOGLE_REDIRECT_URI` **exactly** —
scheme, host, port and path — or Google returns `redirect_uri_mismatch`:

| Environment | Authorised redirect URI |
|---|---|
| Local | `http://localhost:4000/api/calendar/google/callback` |
| Production | `https://your-api-domain.com/api/calendar/google/callback` |

Note this is the **API** origin, not the frontend's.

### 5. Add the credentials

In `server/.env`:

```bash
GOOGLE_CLIENT_ID="1234567890-abcdefg.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-your-secret"
GOOGLE_REDIRECT_URI="http://localhost:4000/api/calendar/google/callback"
```

Restart the API. `GET /api/health` should now report
`googleCalendar.configured: true`.

### 6. Connect an account

Sign in → **Profile** → *Connect Google Calendar*. After consent you land back
on `/calendar/connected`. Book an appointment and it should appear in the
calendar within seconds.

## How the flow works

1. `GET /api/calendar/google/connect` returns a consent URL built with
   `access_type: 'offline'` and `prompt: 'consent'` — both are needed to
   reliably receive a **refresh token**.
2. `state` is a short-lived signed JWT, not a raw user id. The callback arrives
   without our `Authorization` header, so `state` is the only thing tying the
   grant to a user and therefore must not be forgeable.
3. The callback exchanges the code for tokens and stores them in
   `CalendarAccount`.
4. Access tokens are refreshed automatically and written back on the SDK's
   `tokens` event.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | The URI in the console differs from `GOOGLE_REDIRECT_URI`. They must be byte-identical. |
| "This app isn't verified" | Normal while in *Testing*. Continue via Advanced, or add the account as a test user. |
| `access_denied` | The account is not on the test-user list. |
| Connects, then stops working after an hour | No refresh token was issued. Disconnect and reconnect — the code forces `prompt: 'consent'` for exactly this reason. |
| `calendarSyncStatus: FAILED` | Check `GET /api/admin/jobs?status=FAILED` for the underlying error; retry from the Operations screen. |
| Grant silently deactivates | A revoked or expired grant (401/403) is permanent until the user reconnects, so `isActive` is set false rather than retrying forever. |

## Production notes

- Publish the consent screen to remove the test-user restriction. Google only
  requires a verification review for *sensitive* scopes;
  `calendar.events` is one, so allow time for it.
- Store the client secret in your host's secret manager, never in the repo.
- `sendUpdates: 'none'` is set on every call — this system sends its own emails,
  and letting Google email as well would double-notify everyone.

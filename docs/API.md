# API reference

Base URL: `http://localhost:4000/api`

## Conventions

**Auth.** All protected endpoints take `Authorization: Bearer <token>`. Tokens
come from `/auth/login` or `/auth/register` and carry the user's role.

**Errors.** Every failure returns the same envelope. Clients should switch on
`code`, never on `message`.

```json
{ "error": { "code": "SLOT_TAKEN", "message": "Someone just took that slot — please pick another" } }
```

Validation failures add a `details` array:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Some fields need attention",
  "details": [{ "field": "password", "message": "Password must contain a number" }] } }
```

| Status | Meaning |
|---|---|
| 400 | Invalid input, or a rule violation (`NOT_A_VALID_SLOT`, `DOCTOR_ON_LEAVE`, `TOO_LATE_TO_BOOK`, `BEYOND_BOOKING_HORIZON`) |
| 401 | Missing, expired or invalid token |
| 403 | Authenticated but not permitted (`FORBIDDEN`) |
| 404 | `NOT_FOUND` |
| 409 | Conflict (`SLOT_TAKEN`, `HOLD_EXPIRED`, `PATIENT_DOUBLE_BOOKED`, `LEAVE_HAS_CONFLICTS`, `EMAIL_TAKEN`) |
| 500 | `INTERNAL_ERROR` |

**Times.** All timestamps are ISO-8601 UTC. Date-only parameters are
`YYYY-MM-DD` in the clinic timezone (`GET /health` reports which).

---

## Health

### `GET /health`
Public. Reports database connectivity and which optional integrations are
configured — useful for diagnosing "why aren't emails sending?" in any
environment.

```json
{ "status": "ok", "clinicTimezone": "Asia/Kolkata",
  "integrations": {
    "llm": { "configured": false, "note": "ANTHROPIC_API_KEY not set — heuristic fallbacks in use" },
    "email": { "configured": false, "driver": "file" },
    "googleCalendar": { "configured": false } } }
```

---

## Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register a patient. Doctor/admin accounts are provisioned by an admin. |
| POST | `/auth/login` | — | Exchange credentials for a token |
| GET | `/auth/me` | any | Current user |
| PATCH | `/auth/me` | any | Update own name, phone, date of birth, gender |
| POST | `/auth/change-password` | any | Requires the current password |

**`POST /auth/register`**
```json
{ "email": "priya@example.com", "password": "Password123!", "fullName": "Priya Sharma",
  "phone": "+91 98200 11111", "dateOfBirth": "1991-04-12", "gender": "Female" }
```
→ `201 { "token": "...", "user": { "id": "...", "role": "PATIENT", ... } }`

Passwords need ≥8 characters with a letter and a number. Login returns the same
error whether the email is unknown or the password wrong, so the endpoint cannot
be used to enumerate registered addresses.

---

## Doctors and availability (public)

| Method | Path | Description |
|---|---|---|
| GET | `/doctors/specialisations` | Specialisations that have doctors, with counts |
| GET | `/doctors` | Search. Query: `specialisation`, `q`, `acceptingOnly`, `page`, `pageSize` |
| GET | `/doctors/:doctorId` | One doctor, including working hours |
| GET | `/doctors/:doctorId/availability` | Bookable slots. **Required**: `from`, `to` (`YYYY-MM-DD`, ≤62 days) |

**`GET /doctors/:doctorId/availability?from=2026-08-24&to=2026-08-30`**
```json
{ "days": [
  { "date": "2026-08-24", "onLeave": false, "leaveReason": null, "slotDurationMinutes": 30,
    "slots": [ { "startsAt": "2026-08-24T03:30:00.000Z", "endsAt": "2026-08-24T04:00:00.000Z", "available": true } ] },
  { "date": "2026-08-25", "onLeave": true, "leaveReason": "Conference", "slots": [] } ] }
```

Availability is **advisory**. A slot listed here can be taken by someone else a
moment later; the booking call is the only authority.

---

## Appointments (authenticated)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/appointments` | any | Own appointments. Query: `scope` (`upcoming`/`past`/`all`), `status`, `from`, `to` |
| GET | `/appointments/:id` | owner | One appointment |
| POST | `/appointments/hold` | patient | **Step 1** — reserve a slot |
| POST | `/appointments/:id/confirm` | patient | **Step 2** — confirm with symptoms |
| POST | `/appointments` | patient | Hold + confirm in one call |
| DELETE | `/appointments/:id/hold` | patient | Abandon a hold early |
| POST | `/appointments/:id/cancel` | owner | Cancel |
| POST | `/appointments/:id/reschedule` | owner | Move to another slot |

### The two-step booking flow

**1. `POST /appointments/hold`**
```json
{ "doctorId": "uuid", "startsAt": "2026-08-24T03:30:00.000Z" }
```
→ `201`
```json
{ "hold": { "id": "uuid", "holdToken": "opaque", "holdExpiresAt": "2026-08-24T03:10:00.000Z",
            "startsAt": "...", "endsAt": "..." } }
```
Errors: `409 SLOT_TAKEN`, `409 PATIENT_DOUBLE_BOOKED`, `400 NOT_A_VALID_SLOT`,
`400 DOCTOR_ON_LEAVE`, `400 TOO_LATE_TO_BOOK`, `400 BEYOND_BOOKING_HORIZON`.

**2. `POST /appointments/:id/confirm`**
```json
{ "holdToken": "opaque", "symptoms": "Sore throat and fever for three days, getting worse." }
```
→ `200 { "appointment": { "status": "BOOKED", ... } }`

Idempotent: re-confirming an already-booked appointment returns it unchanged.
Errors: `409 HOLD_EXPIRED`, `409 HOLD_NOT_ACTIVE`, `403` on a token mismatch.

Confirming also queues, in the same transaction: confirmation emails to both
parties, reminder emails, the pre-visit AI summary, and calendar sync.

**`POST /appointments/:id/reschedule`** `{ "newStartsAt": "..." }` claims the new
slot before releasing the old one, and returns a **new** appointment whose
`rescheduledFromId` points at the original.

---

## Patient portal

| Method | Path | Description |
|---|---|---|
| GET | `/patient/dashboard` | Next appointment, doses due in 24h, completed visit count |
| GET | `/patient/medications` | Dose schedule grouped by day. Query: `days` (1–60, default 7) |
| GET | `/patient/appointments/:id/summary` | Post-visit summary and medication schedule |

The patient summary deliberately excludes the doctor's raw clinical notes, and
the pre-visit triage summary is never exposed to patients.

---

## Doctor portal (role `DOCTOR`)

| Method | Path | Description |
|---|---|---|
| GET | `/doctor/me` | Own profile |
| PATCH | `/doctor/me` | Update bio, qualifications, room, accepting-patients |
| GET | `/doctor/today` | Appointments around today, with triage summaries |
| GET | `/doctor/schedule` | Slot grid incl. occupied. Required: `from`, `to` |
| PUT | `/doctor/working-hours` | Replace the weekly schedule |
| GET | `/doctor/leave` | Scheduled leave |
| GET | `/doctor/leave/preview` | **Who would be affected** by leave on `date` |
| POST | `/doctor/leave` | Mark leave |
| DELETE | `/doctor/leave/:leaveId` | Remove a leave day |
| POST | `/doctor/appointments/:id/complete` | Record the consultation |
| POST | `/doctor/appointments/:id/no-show` | Mark a no-show |
| POST | `/doctor/appointments/:id/pre-visit-summary/regenerate` | Retry the AI summary |

**`POST /doctor/leave`** — two-phase by design.
```json
{ "date": "2026-08-25", "reason": "Conference" }
```
If appointments exist, → `409`:
```json
{ "error": { "code": "LEAVE_HAS_CONFLICTS", "message": "2 appointment(s) are booked on that date...",
  "details": { "date": "2026-08-25", "appointments": [ { "id": "...", "startsAt": "...", "patientName": "Priya Sharma" } ] } } }
```
Resend with `"force": true` to proceed → `201 { "leave": {...}, "cancelled": 2, "notified": 2, "alternatives": ["..."] }`

**`POST /doctor/appointments/:id/complete`**
```json
{ "doctorNotes": "Viral URTI. Chest clear.", "diagnosis": "Viral URTI",
  "prescriptionText": "Amoxicillin 500mg 1-0-1 x 5 days after food", "followUpInDays": 7 }
```
Returns `201` immediately; the patient summary and medication reminders are
generated in the background so the doctor never waits on a model call.

---

## Admin (role `ADMIN`)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/stats` | Counts, queue state, integration status |
| GET | `/admin/doctors` | All doctors |
| POST | `/admin/doctors` | Create login + profile + working hours atomically |
| GET/PATCH | `/admin/doctors/:id` | Read / update |
| DELETE | `/admin/doctors/:id` | **Deactivate** (never hard-delete — history is clinical record) |
| POST | `/admin/doctors/:id/leave` | Mark leave for any doctor |
| GET | `/admin/patients` | Patient list. Query: `q`, `page`, `pageSize` |
| GET | `/admin/appointments` | All appointments. Query: `status`, `doctorId`, `from`, `to` |
| GET | `/admin/jobs` | Job queue. Query: `status` (`FAILED` = dead letter), `type` |
| POST | `/admin/jobs/:jobId/retry` | Re-queue a dead-lettered job |
| GET | `/admin/emails` | Email delivery log with per-attempt errors |

Changing `slotDurationMinutes` while upcoming appointments exist is refused with
`409 HAS_UPCOMING_APPOINTMENTS` — it would orphan bookings from the slot grid.

---

## Google Calendar

| Method | Path | Description |
|---|---|---|
| GET | `/calendar/status` | Whether the server is configured, and whether you are connected |
| GET | `/calendar/google/connect` | Returns the consent URL to redirect to |
| GET | `/calendar/google/callback` | OAuth redirect target (browser, not XHR) |
| DELETE | `/calendar/google` | Disconnect |

Setup: [docs/GOOGLE_CALENDAR.md](./GOOGLE_CALENDAR.md).

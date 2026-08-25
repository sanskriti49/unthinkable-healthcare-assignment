# Design write-up

How the system prevents double-booking, handles leave conflicts, implements slot
holds, and handles notification failures.

## Preventing double-booking

Availability is **derived, never stored**: free slots are (working hours) −
(leave) − (occupied appointments) − (too soon to book). A materialised slot table
would need regenerating on every schedule edit, and become a second source of
truth. The guarantee is three layers deep, because each alone is insufficient.

**1. A Postgres advisory transaction lock on `(doctorId, startsAt)`.** People
racing for one slot are serialised; different slots never contend, so the common
case costs nothing. The lock releases when the transaction ends — including on
crash — so a dead request cannot wedge a slot.

**2. An authoritative re-check inside that transaction.** Availability shown in
the UI is a possibly-stale snapshot — a hint, never a permission. The real check
runs under the lock against committed state.

**3. A partial unique index — the layer that actually makes the promise.**

```sql
CREATE UNIQUE INDEX appointment_active_slot_uniq
  ON "Appointment" ("doctorId", "startsAt")
  WHERE "status" IN ('HELD', 'BOOKED', 'COMPLETED');
```

Layers 1–2 are application logic: a code path could forget the lock, a second
instance could deploy, someone could insert directly. The index binds every
writer, turning a lost race into a `23505` that becomes `409 SLOT_TAKEN`.

The `WHERE` clause is the crux. A plain `UNIQUE (doctorId, startsAt)` would
permanently burn a slot once an appointment there was cancelled. Filtering on
status lets cancelled rows stop occupying the slot while staying in the record.
A second partial index applies the same rule per patient, so nobody is in two
clinics at once.

Tested by racing twelve concurrent requests at one slot and asserting exactly
one winner, plus a test bypassing the service to confirm the database refuses.

## Slot holds

Booking is two steps: reserve, then confirm with symptoms — otherwise a patient
could spend two minutes describing symptoms only to lose the slot.

A hold is a row with `status = HELD` and a `holdExpiresAt` TTL (10 minutes),
which the index treats as occupying. Confirming flips it to `BOOKED`; a
`holdToken` issued only to the creating client stops anyone else confirming.

Expiry is the interesting part. **Stale holds are reaped inside the booking
transaction, under the slot lock**, before availability is judged. A sweeper
alone would mean patients are told "slot taken" for up to a sweep interval after
a hold actually lapsed. In-transaction reaping makes expiry exact: the instant a
TTL passes, the next booker takes the slot. A sweeper still runs as a backstop
for abandoned holds, and a `CHECK` constraint keeps `status = HELD` and
`holdExpiresAt IS NOT NULL` in lockstep, so "expired" is never ambiguous.

## Leave conflicts

Marking leave on a day with patients is destructive, so the API refuses by
default: the request returns `409 LEAVE_HAS_CONFLICTS` listing every affected
appointment and patient, and only an explicit `force: true` proceeds.

Order matters. The leave row is written **first**, closing the date — otherwise
a patient could book in while we were cancelling the existing ones. Each
appointment is then cancelled with an explicit `DOCTOR_LEAVE` reason, so the
patient's history records *why*, and each patient is emailed the doctor's next
three available slots, making rebooking one click. Those alternatives are a
convenience, not a reservation — whoever clicks first goes through the normal
booking path. One patient's failure is logged, not allowed to strand the rest.

## Notification and LLM failure handling

Notifications never run on the request path. Confirming a booking writes the
appointment, an `EmailLog` row, and a `Job` row **in one transaction**, so there
is no window where an appointment exists but its confirmation was never queued.
A mail outage delays notifications; it cannot lose one or fail a booking.

The queue lives in Postgres rather than Redis precisely to make that atomicity
possible; workers claim jobs with `FOR UPDATE SKIP LOCKED`, so several run
without coordination. Failures retry with exponential backoff plus full jitter —
jitter matters, or an outage produces a synchronised stampede on recovery. After
`maxAttempts` a job is **dead-lettered, not dropped**: it stays in the admin
Operations screen with its per-attempt error history and can be re-queued,
preserving the failed original as an audit record.

LLM failures degrade rather than propagate. Both AI features run as background
jobs, each with a deterministic fallback: a keyword triage screen that errs
*upward*, and a prescription parser handling standard notation (`1-0-1`, `BD`,
`TDS`, `OD`). A failure never throws into a request — the doctor still gets an
urgency label, the patient still gets reminders. Because a plausible-but-wrong
clinical summary is worse than none, the fallback never paraphrases; it shows
the doctor's own words. Every AI-assisted block records its provenance, so the
UI says plainly whether someone is reading a model's summary or a keyword
match.

-- Booking correctness guards.
--
-- Prisma's schema language cannot express partial (WHERE-filtered) unique
-- indexes, so the core anti-double-booking constraint is declared here.
--
-- A slot is "occupied" while an appointment for it is HELD, BOOKED or
-- COMPLETED. CANCELLED / EXPIRED / NO_SHOW rows must NOT occupy the slot,
-- otherwise a cancelled appointment would permanently burn that time.
-- A plain UNIQUE (doctorId, startsAt) would do exactly that, hence the filter.
--
-- This index is the last line of defence: even if application logic is wrong,
-- races through it, or a second API instance runs concurrently, Postgres
-- refuses the second insert with 23505 (unique_violation), which the booking
-- service translates into a 409 SLOT_TAKEN.
CREATE UNIQUE INDEX "appointment_active_slot_uniq"
  ON "Appointment" ("doctorId", "startsAt")
  WHERE "status" IN ('HELD', 'BOOKED', 'COMPLETED');

-- A patient should not hold two appointments starting at the same instant
-- either (they cannot be in two clinics at once).
CREATE UNIQUE INDEX "appointment_patient_slot_uniq"
  ON "Appointment" ("patientId", "startsAt")
  WHERE "status" IN ('HELD', 'BOOKED', 'COMPLETED');

-- An appointment must occupy a positive-length interval.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_interval_positive" CHECK ("endsAt" > "startsAt");

-- A HELD appointment must carry an expiry, and only a HELD one may have one.
-- This makes "expired hold" a total function of (status, holdExpiresAt) rather
-- than something the application has to remember to maintain.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_hold_expiry_consistent"
  CHECK (("status" = 'HELD') = ("holdExpiresAt" IS NOT NULL));

-- Working-hours windows must be well-formed "HH:MM" strings with start < end.
ALTER TABLE "WorkingHours"
  ADD CONSTRAINT "working_hours_format" CHECK (
    "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "endTime"   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "startTime" < "endTime"
  );

ALTER TABLE "WorkingHours"
  ADD CONSTRAINT "working_hours_dow_range" CHECK ("dayOfWeek" BETWEEN 0 AND 6);

ALTER TABLE "DoctorProfile"
  ADD CONSTRAINT "doctor_slot_duration_sane" CHECK ("slotDurationMinutes" BETWEEN 5 AND 240);

-- Partial index that makes the hold sweeper's scan cheap regardless of table size.
CREATE INDEX "appointment_active_holds_idx"
  ON "Appointment" ("holdExpiresAt")
  WHERE "status" = 'HELD';

-- Queue claim path: workers select PENDING rows due to run, oldest first.
CREATE INDEX "job_claimable_idx"
  ON "Job" ("runAt", "priority" DESC)
  WHERE "status" = 'PENDING';

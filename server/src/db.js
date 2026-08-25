import { PrismaClient } from '@prisma/client';
import { env } from './config/env.js';

export const prisma = new PrismaClient({
  log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
});

/** Postgres error code for a unique-constraint violation. */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * True when `err` is the slot-uniqueness violation raised by the partial index
 * `appointment_active_slot_uniq` — i.e. someone else won the race for this slot.
 */
export function isSlotConflict(err) {
  if (err?.code !== 'P2002') return false;
  const target = err.meta?.target;
  const name = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return name.includes('appointment_active_slot_uniq') || name.includes('doctorId');
}

/** True when the patient already has something else at that instant. */
export function isPatientDoubleBooking(err) {
  if (err?.code !== 'P2002') return false;
  const target = err.meta?.target;
  const name = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return name.includes('appointment_patient_slot_uniq') || name.includes('patientId');
}

export async function disconnect() {
  await prisma.$disconnect();
}

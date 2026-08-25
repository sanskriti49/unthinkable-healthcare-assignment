import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/async-handler.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { forbidden, notFound, badRequest } from '../lib/errors.js';
import {
  holdSlot,
  confirmHold,
  bookDirect,
  cancelAppointment,
  rescheduleAppointment,
  releaseHold,
} from '../services/booking.js';

const router = Router();
router.use(authenticate);

const appointmentInclude = {
  patient: { select: { id: true, fullName: true, email: true, phone: true, dateOfBirth: true, gender: true } },
  doctor: {
    select: {
      id: true,
      specialisation: true,
      roomNumber: true,
      slotDurationMinutes: true,
      user: { select: { id: true, fullName: true, email: true } },
    },
  },
  preVisitSummary: true,
  visitNote: { include: { medications: true } },
};

/**
 * Shape an appointment for the API.
 * `viewerRole` controls what is included: a patient never sees the doctor's
 * raw clinical notes, only the patient-facing summary derived from them.
 */
function serialise(appointment, viewerRole) {
  const isClinician = viewerRole === 'DOCTOR' || viewerRole === 'ADMIN';

  return {
    id: appointment.id,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    holdExpiresAt: appointment.holdExpiresAt,
    symptoms: appointment.symptoms,
    patientNotes: appointment.patientNotes,
    cancelledAt: appointment.cancelledAt,
    cancelledBy: appointment.cancelledBy,
    cancelReason: appointment.cancelReason,
    cancelNote: appointment.cancelNote,
    calendarSyncStatus: appointment.calendarSyncStatus,
    rescheduledFromId: appointment.rescheduledFromId,
    doctor: appointment.doctor
      ? {
          id: appointment.doctor.id,
          fullName: appointment.doctor.user.fullName,
          specialisation: appointment.doctor.specialisation,
          roomNumber: appointment.doctor.roomNumber,
        }
      : undefined,
    patient: appointment.patient
      ? {
          id: appointment.patient.id,
          fullName: appointment.patient.fullName,
          email: isClinician ? appointment.patient.email : undefined,
          phone: isClinician ? appointment.patient.phone : undefined,
          dateOfBirth: isClinician ? appointment.patient.dateOfBirth : undefined,
          gender: isClinician ? appointment.patient.gender : undefined,
        }
      : undefined,
    // The pre-visit summary is a clinician-facing triage aid. Showing a patient
    // an urgency label they cannot act on invites both panic and false comfort.
    preVisitSummary:
      isClinician && appointment.preVisitSummary
        ? {
            chiefComplaint: appointment.preVisitSummary.chiefComplaint,
            summary: appointment.preVisitSummary.summary,
            urgency: appointment.preVisitSummary.urgency,
            urgencyRationale: appointment.preVisitSummary.urgencyRationale,
            suggestedQuestions: appointment.preVisitSummary.suggestedQuestions,
            redFlags: appointment.preVisitSummary.redFlags,
            source: appointment.preVisitSummary.source,
            generatedAt: appointment.preVisitSummary.generatedAt,
          }
        : undefined,
    visitNote: appointment.visitNote
      ? {
          id: appointment.visitNote.id,
          diagnosis: isClinician ? appointment.visitNote.diagnosis : undefined,
          doctorNotes: isClinician ? appointment.visitNote.doctorNotes : undefined,
          prescriptionText: appointment.visitNote.prescriptionText,
          followUpInDays: appointment.visitNote.followUpInDays,
          patientSummary: appointment.visitNote.patientSummary,
          careInstructions: appointment.visitNote.careInstructions,
          warningSigns: appointment.visitNote.warningSigns,
          source: appointment.visitNote.source,
          generatedAt: appointment.visitNote.generatedAt,
          medications: appointment.visitNote.medications.map((m) => ({
            id: m.id,
            name: m.name,
            dosage: m.dosage,
            frequency: m.frequency,
            timesOfDay: m.timesOfDay,
            durationDays: m.durationDays,
            instructions: m.instructions,
            parsedByFallback: m.parsedByFallback,
          })),
        }
      : undefined,
  };
}

/** Load an appointment and check the caller is entitled to see it. */
async function loadAuthorised(appointmentId, user, doctorProfileId) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });
  if (!appointment) throw notFound('Appointment');

  const allowed =
    user.role === 'ADMIN' ||
    (user.role === 'PATIENT' && appointment.patientId === user.id) ||
    (user.role === 'DOCTOR' && appointment.doctorId === doctorProfileId);

  if (!allowed) throw forbidden('This appointment is not yours');
  return appointment;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

router.get(
  '/',
  validate(
    z.object({
      status: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      scope: z.enum(['upcoming', 'past', 'all']).default('all'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { status, from, to, scope, page, pageSize } = req.query;
    const now = new Date();

    const scopeFilter =
      scope === 'upcoming'
        ? { startsAt: { gte: now } }
        : scope === 'past'
          ? { startsAt: { lt: now } }
          : {};

    const where = {
      ...(req.user.role === 'PATIENT' ? { patientId: req.user.id } : {}),
      ...(req.user.role === 'DOCTOR' ? { doctorId: req.doctorProfileId } : {}),
      ...(status ? { status: { in: status.split(',') } } : {}),
      ...scopeFilter,
      ...(from || to
        ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        orderBy: { startsAt: scope === 'past' ? 'desc' : 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({
      appointments: appointments.map((a) => serialise(a, req.user.role)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  })
);

router.get(
  '/:appointmentId',
  asyncHandler(async (req, res) => {
    const appointment = await loadAuthorised(req.params.appointmentId, req.user, req.doctorProfileId);
    res.json({ appointment: serialise(appointment, req.user.role) });
  })
);

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

/**
 * Step 1 — reserve the slot while the patient fills in their symptoms.
 * Returns a hold token that step 2 must present.
 */
router.post(
  '/hold',
  requireRole('PATIENT'),
  validate(z.object({ doctorId: z.string().uuid(), startsAt: z.coerce.date() })),
  asyncHandler(async (req, res) => {
    const hold = await holdSlot({
      doctorId: req.body.doctorId,
      patientId: req.user.id,
      startsAt: req.body.startsAt,
    });
    res.status(201).json({ hold });
  })
);

/** Step 2 — confirm the hold with the symptom description. */
router.post(
  '/:appointmentId/confirm',
  requireRole('PATIENT'),
  validate(
    z.object({
      holdToken: z.string().optional(),
      symptoms: z.string().max(5000).trim().optional(),
      patientNotes: z.string().max(2000).trim().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const appointment = await confirmHold({
      appointmentId: req.params.appointmentId,
      holdToken: req.body.holdToken,
      patientId: req.user.id,
      symptoms: req.body.symptoms,
      patientNotes: req.body.patientNotes,
    });
    const full = await prisma.appointment.findUnique({
      where: { id: appointment.id },
      include: appointmentInclude,
    });
    res.json({ appointment: serialise(full, req.user.role) });
  })
);

/** Hold + confirm in one call, for clients that already have the symptoms. */
router.post(
  '/',
  requireRole('PATIENT'),
  validate(
    z.object({
      doctorId: z.string().uuid(),
      startsAt: z.coerce.date(),
      symptoms: z.string().max(5000).trim().optional(),
      patientNotes: z.string().max(2000).trim().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const appointment = await bookDirect({
      doctorId: req.body.doctorId,
      patientId: req.user.id,
      startsAt: req.body.startsAt,
      symptoms: req.body.symptoms,
      patientNotes: req.body.patientNotes,
    });
    const full = await prisma.appointment.findUnique({
      where: { id: appointment.id },
      include: appointmentInclude,
    });
    res.status(201).json({ appointment: serialise(full, req.user.role) });
  })
);

/** Abandon a hold without waiting for its TTL. */
router.delete(
  '/:appointmentId/hold',
  requireRole('PATIENT'),
  asyncHandler(async (req, res) => {
    const released = await releaseHold({
      appointmentId: req.params.appointmentId,
      patientId: req.user.id,
    });
    res.json({ released });
  })
);

router.post(
  '/:appointmentId/cancel',
  validate(z.object({ note: z.string().max(500).trim().optional() })),
  asyncHandler(async (req, res) => {
    await loadAuthorised(req.params.appointmentId, req.user, req.doctorProfileId);
    const appointment = await cancelAppointment({
      appointmentId: req.params.appointmentId,
      actorUserId: req.user.id,
      cancelledBy: req.user.role,
      reason: 'PATIENT_REQUEST',
      note: req.body.note,
    });
    res.json({ appointment: serialise({ ...appointment, doctor: null, patient: null }, req.user.role) });
  })
);

router.post(
  '/:appointmentId/reschedule',
  validate(z.object({ newStartsAt: z.coerce.date() })),
  asyncHandler(async (req, res) => {
    const existing = await loadAuthorised(req.params.appointmentId, req.user, req.doctorProfileId);
    const appointment = await rescheduleAppointment({
      appointmentId: req.params.appointmentId,
      patientId: req.user.role === 'PATIENT' ? req.user.id : null,
      newStartsAt: req.body.newStartsAt,
      actorRole: req.user.role,
    });
    const full = await prisma.appointment.findUnique({
      where: { id: appointment.id },
      include: appointmentInclude,
    });
    res.json({ appointment: serialise(full, req.user.role), replaced: existing.id });
  })
);

export default router;
export { serialise, appointmentInclude, loadAuthorised };

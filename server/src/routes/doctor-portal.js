import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/async-handler.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { getAvailability } from '../services/slots.js';
import { markLeave, cancelLeave, listLeave, findAffectedAppointments } from '../services/leave.js';
import { enqueue, JobType } from '../services/queue.js';
import { generatePreVisitSummary } from '../services/llm/pre-visit.js';
import { appointmentInclude, serialise } from './appointments.js';
import { localDateKey } from '../lib/time.js';

const router = Router();
router.use(authenticate, requireRole('DOCTOR'));

/** Every route here acts on the caller's own doctor profile. */
function myDoctorId(req) {
  if (!req.doctorProfileId) throw forbidden('No doctor profile is linked to this account');
  return req.doctorProfileId;
}

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: myDoctorId(req) },
      include: { user: { select: { fullName: true, email: true } }, workingHours: true },
    });
    res.json({ doctor });
  })
);

/** Doctors may edit their own presentation and booking parameters. */
router.patch(
  '/me',
  validate(
    z.object({
      bio: z.string().max(2000).trim().optional(),
      qualifications: z.string().max(500).trim().optional(),
      roomNumber: z.string().max(30).trim().optional(),
      isAcceptingPatients: z.boolean().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctorProfile.update({
      where: { id: myDoctorId(req) },
      data: req.body,
      include: { user: { select: { fullName: true } }, workingHours: true },
    });
    res.json({ doctor });
  })
);

/** The doctor's own schedule, including occupied slots. */
router.get(
  '/schedule',
  validate(
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const doctorId = myDoctorId(req);
    const [days, appointments] = await Promise.all([
      getAvailability({ doctorId, from: req.query.from, to: req.query.to, includeOccupied: true }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          startsAt: {
            gte: new Date(`${req.query.from}T00:00:00Z`),
            lt: new Date(new Date(`${req.query.to}T00:00:00Z`).getTime() + 86_400_000),
          },
          status: { in: ['HELD', 'BOOKED', 'COMPLETED'] },
        },
        include: appointmentInclude,
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    res.json({
      days,
      appointments: appointments.map((a) => serialise(a, 'DOCTOR')),
    });
  })
);

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

router.get(
  '/leave',
  asyncHandler(async (req, res) => {
    res.json({ leave: await listLeave({ doctorId: myDoctorId(req), from: req.query.from, to: req.query.to }) });
  })
);

/**
 * Preview what marking leave would disrupt, so the UI can show the doctor
 * exactly whose appointments are about to be cancelled before they commit.
 */
router.get(
  '/leave/preview',
  validate(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), 'query'),
  asyncHandler(async (req, res) => {
    const affected = await findAffectedAppointments({
      doctorId: myDoctorId(req),
      dateKey: req.query.date,
    });
    res.json({
      date: req.query.date,
      affectedCount: affected.length,
      appointments: affected.map((a) => ({
        id: a.id,
        startsAt: a.startsAt,
        status: a.status,
        patientName: a.patient.fullName,
      })),
    });
  })
);

router.post(
  '/leave',
  validate(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().max(300).trim().optional(),
      // Required acknowledgement when the date already has bookings.
      force: z.boolean().default(false),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await markLeave({
      doctorId: myDoctorId(req),
      dateKey: req.body.date,
      reason: req.body.reason,
      actorUserId: req.user.id,
      force: req.body.force,
    });
    res.status(201).json(result);
  })
);

router.delete(
  '/leave/:leaveId',
  asyncHandler(async (req, res) => {
    await cancelLeave({ doctorId: myDoctorId(req), leaveId: req.params.leaveId });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------------

const workingHoursSchema = z.object({
  hours: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      })
    )
    .max(30),
});

/** Replace the whole weekly schedule — simpler to reason about than patching. */
router.put(
  '/working-hours',
  validate(workingHoursSchema),
  asyncHandler(async (req, res) => {
    const doctorId = myDoctorId(req);
    for (const h of req.body.hours) {
      if (h.startTime >= h.endTime) {
        throw badRequest('INVALID_WINDOW', `${h.startTime}–${h.endTime} ends before it starts`);
      }
    }

    const hours = await prisma.$transaction(async (tx) => {
      await tx.workingHours.deleteMany({ where: { doctorId } });
      if (req.body.hours.length > 0) {
        await tx.workingHours.createMany({
          data: req.body.hours.map((h) => ({ ...h, doctorId })),
          skipDuplicates: true,
        });
      }
      return tx.workingHours.findMany({ where: { doctorId }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
    });

    res.json({ workingHours: hours });
  })
);

// ---------------------------------------------------------------------------
// Consultations
// ---------------------------------------------------------------------------

/** Regenerate a pre-visit summary on demand (e.g. after an LLM outage). */
router.post(
  '/appointments/:appointmentId/pre-visit-summary/regenerate',
  asyncHandler(async (req, res) => {
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.appointmentId, doctorId: myDoctorId(req) },
      select: { id: true },
    });
    if (!appointment) throw notFound('Appointment');
    const result = await generatePreVisitSummary(appointment.id);
    res.json(result);
  })
);

/**
 * Complete a consultation: record notes and prescription, mark the appointment
 * COMPLETED, and queue the patient-facing summary + medication reminders.
 *
 * The LLM work is deliberately *not* awaited — the doctor should not sit
 * waiting on a model call, and the summary is useful whenever it lands.
 */
router.post(
  '/appointments/:appointmentId/complete',
  validate(
    z.object({
      doctorNotes: z.string().min(5).max(10_000).trim(),
      diagnosis: z.string().max(500).trim().optional(),
      prescriptionText: z.string().max(5000).trim().optional(),
      followUpInDays: z.number().int().min(0).max(365).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const doctorId = myDoctorId(req);
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.appointmentId, doctorId },
      include: { visitNote: true },
    });
    if (!appointment) throw notFound('Appointment');
    if (appointment.status === 'CANCELLED' || appointment.status === 'EXPIRED') {
      throw conflict('APPOINTMENT_CANCELLED', 'This appointment was cancelled');
    }

    const { doctorNotes, diagnosis, prescriptionText, followUpInDays } = req.body;

    const visitNote = await prisma.$transaction(async (tx) => {
      const note = await tx.visitNote.upsert({
        where: { appointmentId: appointment.id },
        create: {
          appointmentId: appointment.id,
          doctorNotes,
          diagnosis: diagnosis ?? null,
          prescriptionText: prescriptionText ?? null,
          followUpInDays: followUpInDays ?? null,
          source: 'PENDING',
        },
        update: {
          doctorNotes,
          diagnosis: diagnosis ?? null,
          prescriptionText: prescriptionText ?? null,
          followUpInDays: followUpInDays ?? null,
          source: 'PENDING',
        },
      });

      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: 'COMPLETED' },
      });

      await enqueue({
        type: JobType.POST_VISIT_SUMMARY,
        payload: { visitNoteId: note.id },
        maxAttempts: 3,
        priority: 2,
        tx,
      });

      return note;
    });

    res.status(201).json({
      visitNote: { id: visitNote.id, status: 'PENDING' },
      message: 'Consultation recorded. The patient summary and reminders are being prepared.',
    });
  })
);

/** Mark a patient as not having attended. */
router.post(
  '/appointments/:appointmentId/no-show',
  asyncHandler(async (req, res) => {
    const updated = await prisma.appointment.updateMany({
      where: { id: req.params.appointmentId, doctorId: myDoctorId(req), status: 'BOOKED' },
      data: { status: 'NO_SHOW' },
    });
    if (updated.count === 0) throw conflict('NOT_MARKABLE', 'Only a booked appointment can be marked as a no-show');
    res.json({ ok: true });
  })
);

/** Today's list — the doctor's landing view. */
router.get(
  '/today',
  asyncHandler(async (req, res) => {
    const doctorId = myDoctorId(req);
    const today = localDateKey(new Date());
    const start = new Date(`${today}T00:00:00Z`);

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        startsAt: { gte: new Date(start.getTime() - 86_400_000), lt: new Date(start.getTime() + 2 * 86_400_000) },
        status: { in: ['BOOKED', 'COMPLETED', 'NO_SHOW'] },
      },
      include: appointmentInclude,
      orderBy: { startsAt: 'asc' },
    });

    res.json({ date: today, appointments: appointments.map((a) => serialise(a, 'DOCTOR')) });
  })
);

export default router;

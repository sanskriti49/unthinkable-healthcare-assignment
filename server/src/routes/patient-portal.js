import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/async-handler.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { upcomingReminders } from '../services/medication.js';
import { localDateKey } from '../lib/time.js';

const router = Router();
router.use(authenticate, requireRole('PATIENT'));

/**
 * The patient's medication schedule, grouped by clinic-local day so the UI can
 * render "today / tomorrow / …" without doing timezone maths in the browser.
 */
router.get(
  '/medications',
  validate(z.object({ days: z.coerce.number().int().min(1).max(60).default(7) }), 'query'),
  asyncHandler(async (req, res) => {
    const reminders = await upcomingReminders(req.user.id, { days: req.query.days });

    const byDay = new Map();
    for (const reminder of reminders) {
      const key = localDateKey(reminder.scheduledFor);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push({
        id: reminder.id,
        scheduledFor: reminder.scheduledFor,
        sentAt: reminder.sentAt,
        medication: reminder.medication,
      });
    }

    // Active courses, so the patient sees the prescription even once the last
    // reminder for today has passed.
    const activeCourses = await prisma.medication.findMany({
      where: {
        visitNote: { appointment: { patientId: req.user.id } },
        reminders: { some: { patientId: req.user.id, cancelledAt: null, scheduledFor: { gte: new Date() } } },
      },
      select: {
        id: true,
        name: true,
        dosage: true,
        frequency: true,
        timesOfDay: true,
        durationDays: true,
        instructions: true,
        parsedByFallback: true,
        visitNote: { select: { appointment: { select: { startsAt: true } } } },
      },
    });

    res.json({
      schedule: [...byDay.entries()].map(([date, doses]) => ({ date, doses })),
      activeCourses,
    });
  })
);

/** Patient-facing follow-up content for one completed appointment. */
router.get(
  '/appointments/:appointmentId/summary',
  asyncHandler(async (req, res) => {
    const note = await prisma.visitNote.findFirst({
      where: { appointment: { id: req.params.appointmentId, patientId: req.user.id } },
      include: {
        medications: true,
        appointment: {
          select: {
            startsAt: true,
            doctor: { select: { specialisation: true, user: { select: { fullName: true } } } },
          },
        },
      },
    });

    if (!note) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'No visit summary is available for this appointment yet' },
      });
    }

    res.json({
      summary: {
        visitDate: note.appointment.startsAt,
        doctorName: note.appointment.doctor.user.fullName,
        specialisation: note.appointment.doctor.specialisation,
        // The doctor's raw clinical notes are deliberately not exposed here.
        patientSummary: note.patientSummary,
        careInstructions: note.careInstructions,
        warningSigns: note.warningSigns,
        followUpInDays: note.followUpInDays,
        prescriptionText: note.prescriptionText,
        medications: note.medications,
        // Surfaced so the UI can say "generated automatically" vs "shown as
        // your doctor wrote it" rather than implying the AI wrote everything.
        source: note.source,
        generatedAt: note.generatedAt,
      },
    });
  })
);

/** Landing view: next appointment plus today's doses. */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const endOfDay = new Date(now.getTime() + 86_400_000);

    const [nextAppointment, dosesToday, pastCount] = await Promise.all([
      prisma.appointment.findFirst({
        where: { patientId: req.user.id, status: 'BOOKED', startsAt: { gte: now } },
        orderBy: { startsAt: 'asc' },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          doctor: {
            select: { specialisation: true, roomNumber: true, user: { select: { fullName: true } } },
          },
        },
      }),
      prisma.medicationReminder.findMany({
        where: {
          patientId: req.user.id,
          cancelledAt: null,
          scheduledFor: { gte: now, lte: endOfDay },
        },
        include: { medication: { select: { name: true, dosage: true, instructions: true } } },
        orderBy: { scheduledFor: 'asc' },
        take: 12,
      }),
      prisma.appointment.count({
        where: { patientId: req.user.id, status: 'COMPLETED' },
      }),
    ]);

    res.json({ nextAppointment, dosesToday, completedVisits: pastCount });
  })
);

export default router;

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/async-handler.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { conflict, notFound, badRequest } from '../lib/errors.js';
import { queueEmail } from '../services/email/index.js';
import { queueStats, retryDeadLetter } from '../services/queue.js';
import { markLeave, cancelLeave } from '../services/leave.js';
import { appointmentInclude, serialise } from './appointments.js';
import { env } from '../config/env.js';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

const workingHoursInput = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
);

const createDoctorSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8).max(200),
  fullName: z.string().min(2).max(120).trim(),
  phone: z.string().max(30).trim().optional(),
  specialisation: z.string().min(2).max(100).trim(),
  qualifications: z.string().max(500).trim().optional(),
  bio: z.string().max(2000).trim().optional(),
  roomNumber: z.string().max(30).trim().optional(),
  consultationFee: z.number().int().min(0).default(0),
  slotDurationMinutes: z.number().int().min(5).max(240).default(30),
  bookingHorizonDays: z.number().int().min(1).max(365).default(30),
  workingHours: workingHoursInput.default([]),
});

// ---------------------------------------------------------------------------
// Doctor management
// ---------------------------------------------------------------------------

router.get(
  '/doctors',
  asyncHandler(async (_req, res) => {
    const doctors = await prisma.doctorProfile.findMany({
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, isActive: true } },
        workingHours: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        _count: { select: { appointments: true, leaves: true } },
      },
      orderBy: { specialisation: 'asc' },
    });
    res.json({ doctors });
  })
);

/**
 * Provision a doctor: creates the login and the profile together, so there is
 * never a doctor account without a profile (or vice versa).
 */
router.post(
  '/doctors',
  validate(createDoctorSchema),
  asyncHandler(async (req, res) => {
    const { email, password, fullName, phone, workingHours, ...profile } = req.body;

    if (await prisma.user.findUnique({ where: { email } })) {
      throw conflict('EMAIL_TAKEN', 'An account with that email already exists');
    }
    for (const h of workingHours) {
      if (h.startTime >= h.endTime) {
        throw badRequest('INVALID_WINDOW', `${h.startTime}–${h.endTime} ends before it starts`);
      }
    }

    const doctor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(password, 10),
          fullName,
          phone: phone ?? null,
          role: 'DOCTOR',
        },
      });

      return tx.doctorProfile.create({
        data: {
          userId: user.id,
          ...profile,
          workingHours: { create: workingHours },
        },
        include: { user: { select: { id: true, fullName: true, email: true } }, workingHours: true },
      });
    });

    await queueEmail({ to: email, template: 'welcome', data: { fullName, role: 'DOCTOR' } });

    res.status(201).json({ doctor });
  })
);

router.get(
  '/doctors/:doctorId',
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: req.params.doctorId },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true, isActive: true } },
        workingHours: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        leaves: { orderBy: { date: 'asc' } },
      },
    });
    if (!doctor) throw notFound('Doctor');
    res.json({ doctor });
  })
);

router.patch(
  '/doctors/:doctorId',
  validate(
    z.object({
      fullName: z.string().min(2).max(120).trim().optional(),
      phone: z.string().max(30).trim().optional(),
      specialisation: z.string().min(2).max(100).trim().optional(),
      qualifications: z.string().max(500).trim().optional(),
      bio: z.string().max(2000).trim().optional(),
      roomNumber: z.string().max(30).trim().optional(),
      consultationFee: z.number().int().min(0).optional(),
      slotDurationMinutes: z.number().int().min(5).max(240).optional(),
      bookingHorizonDays: z.number().int().min(1).max(365).optional(),
      isAcceptingPatients: z.boolean().optional(),
      isActive: z.boolean().optional(),
      workingHours: workingHoursInput.optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { fullName, phone, isActive, workingHours, ...profileFields } = req.body;
    const doctorId = req.params.doctorId;

    const existing = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!existing) throw notFound('Doctor');

    // Changing slot duration invalidates the grid that existing appointments
    // sit on, so refuse while future bookings exist rather than silently
    // orphaning them.
    if (
      profileFields.slotDurationMinutes &&
      profileFields.slotDurationMinutes !== existing.slotDurationMinutes
    ) {
      const upcoming = await prisma.appointment.count({
        where: { doctorId, startsAt: { gte: new Date() }, status: { in: ['HELD', 'BOOKED'] } },
      });
      if (upcoming > 0) {
        throw conflict(
          'HAS_UPCOMING_APPOINTMENTS',
          `Cannot change slot length while ${upcoming} upcoming appointment(s) exist. Cancel or complete them first.`
        );
      }
    }

    const doctor = await prisma.$transaction(async (tx) => {
      if (fullName || phone !== undefined || isActive !== undefined) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(fullName ? { fullName } : {}),
            ...(phone !== undefined ? { phone } : {}),
            ...(isActive !== undefined ? { isActive } : {}),
          },
        });
      }

      if (workingHours) {
        await tx.workingHours.deleteMany({ where: { doctorId } });
        if (workingHours.length > 0) {
          await tx.workingHours.createMany({
            data: workingHours.map((h) => ({ ...h, doctorId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.doctorProfile.update({
        where: { id: doctorId },
        data: profileFields,
        include: {
          user: { select: { id: true, fullName: true, email: true, isActive: true } },
          workingHours: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        },
      });
    });

    res.json({ doctor });
  })
);

/**
 * Deactivate rather than delete. Appointment history is a clinical record;
 * hard-deleting a doctor would cascade it away.
 */
router.delete(
  '/doctors/:doctorId',
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctorProfile.findUnique({ where: { id: req.params.doctorId } });
    if (!doctor) throw notFound('Doctor');

    await prisma.$transaction([
      prisma.user.update({ where: { id: doctor.userId }, data: { isActive: false } }),
      prisma.doctorProfile.update({
        where: { id: doctor.id },
        data: { isAcceptingPatients: false },
      }),
    ]);

    const upcoming = await prisma.appointment.count({
      where: { doctorId: doctor.id, startsAt: { gte: new Date() }, status: { in: ['HELD', 'BOOKED'] } },
    });

    res.json({
      deactivated: true,
      upcomingAppointments: upcoming,
      ...(upcoming > 0
        ? { warning: `${upcoming} upcoming appointment(s) remain and should be rescheduled or cancelled.` }
        : {}),
    });
  })
);

/** Admins can record leave for any doctor. */
router.post(
  '/doctors/:doctorId/leave',
  validate(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().max(300).trim().optional(),
      force: z.boolean().default(false),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await markLeave({
      doctorId: req.params.doctorId,
      dateKey: req.body.date,
      reason: req.body.reason,
      actorUserId: req.user.id,
      force: req.body.force,
    });
    res.status(201).json(result);
  })
);

router.delete(
  '/doctors/:doctorId/leave/:leaveId',
  asyncHandler(async (req, res) => {
    await cancelLeave({ doctorId: req.params.doctorId, leaveId: req.params.leaveId });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Patients and appointments
// ---------------------------------------------------------------------------

router.get(
  '/patients',
  validate(
    z.object({
      q: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { q, page, pageSize } = req.query;
    const where = {
      role: 'PATIENT',
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, patients] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
          _count: { select: { patientAppointments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ patients, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  })
);

router.get(
  '/appointments',
  validate(
    z.object({
      status: z.string().optional(),
      doctorId: z.string().uuid().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { status, doctorId, from, to, page, pageSize } = req.query;
    const where = {
      ...(status ? { status: { in: status.split(',') } } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(from || to ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        orderBy: { startsAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({
      appointments: appointments.map((a) => serialise(a, 'ADMIN')),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  })
);

// ---------------------------------------------------------------------------
// Operations dashboard
// ---------------------------------------------------------------------------

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86_400_000);

    const [doctors, patients, upcoming, todayBooked, jobs, failedEmails, llmFallbacks] =
      await Promise.all([
        prisma.doctorProfile.count(),
        prisma.user.count({ where: { role: 'PATIENT' } }),
        prisma.appointment.count({ where: { status: 'BOOKED', startsAt: { gte: now } } }),
        prisma.appointment.count({ where: { createdAt: { gte: dayAgo } } }),
        queueStats(),
        prisma.emailLog.count({ where: { status: 'FAILED' } }),
        prisma.preVisitSummary.count({ where: { source: 'HEURISTIC' } }),
      ]);

    res.json({
      doctors,
      patients,
      upcomingAppointments: upcoming,
      bookedLast24h: todayBooked,
      jobs,
      failedEmails,
      llmFallbackSummaries: llmFallbacks,
      integrations: {
        llm: env.llm.enabled,
        email: env.email.driver,
        googleCalendar: env.google.enabled,
      },
    });
  })
);

/** The dead-letter view — jobs that exhausted their retries. */
router.get(
  '/jobs',
  validate(
    z.object({
      status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']).optional(),
      type: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { status, type, page, pageSize } = req.query;
    const where = { ...(status ? { status } : {}), ...(type ? { type } : {}) };

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ jobs, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  })
);

/** Re-queue a dead-lettered job, keeping the failed original as an audit row. */
router.post(
  '/jobs/:jobId/retry',
  asyncHandler(async (req, res) => {
    const job = await retryDeadLetter(req.params.jobId);
    if (!job) throw notFound('Job');
    res.json({ job });
  })
);

router.get(
  '/emails',
  validate(
    z.object({
      status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { status, page, pageSize } = req.query;
    const where = status ? { status } : {};

    const [total, emails] = await Promise.all([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findMany({
        where,
        select: {
          id: true,
          to: true,
          subject: true,
          template: true,
          status: true,
          attempts: true,
          lastError: true,
          sentAt: true,
          createdAt: true,
          appointmentId: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ emails, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  })
);

export default router;

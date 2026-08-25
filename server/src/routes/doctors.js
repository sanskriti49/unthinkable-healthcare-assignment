import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/async-handler.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';
import { getAvailability } from '../services/slots.js';
import { listLeave } from '../services/leave.js';

const router = Router();

const doctorCard = (d) => ({
  id: d.id,
  fullName: d.user.fullName,
  specialisation: d.specialisation,
  qualifications: d.qualifications,
  bio: d.bio,
  roomNumber: d.roomNumber,
  consultationFee: d.consultationFee,
  slotDurationMinutes: d.slotDurationMinutes,
  bookingHorizonDays: d.bookingHorizonDays,
  isAcceptingPatients: d.isAcceptingPatients,
  workingHours: (d.workingHours ?? [])
    .filter((w) => w.isActive)
    .map((w) => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)),
});

/** The specialisations that actually have doctors, for the search filter. */
router.get(
  '/specialisations',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.doctorProfile.groupBy({
      by: ['specialisation'],
      _count: { _all: true },
      orderBy: { specialisation: 'asc' },
    });
    res.json({
      specialisations: rows.map((r) => ({ name: r.specialisation, doctorCount: r._count._all })),
    });
  })
);

/**
 * Search doctors. Public — patients browse before signing in, and the data
 * returned here is the same as a clinic's public directory.
 */
router.get(
  '/',
  validate(
    z.object({
      specialisation: z.string().trim().optional(),
      q: z.string().trim().optional(),
      acceptingOnly: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { specialisation, q, acceptingOnly, page, pageSize } = req.query;

    const where = {
      user: { isActive: true },
      ...(specialisation ? { specialisation: { equals: specialisation, mode: 'insensitive' } } : {}),
      ...(acceptingOnly ? { isAcceptingPatients: true } : {}),
      ...(q
        ? {
            OR: [
              { user: { fullName: { contains: q, mode: 'insensitive' } } },
              { specialisation: { contains: q, mode: 'insensitive' } },
              { qualifications: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, doctors] = await Promise.all([
      prisma.doctorProfile.count({ where }),
      prisma.doctorProfile.findMany({
        where,
        include: { user: { select: { fullName: true } }, workingHours: true },
        orderBy: { specialisation: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({
      doctors: doctors.map(doctorCard),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  })
);

router.get(
  '/:doctorId',
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: req.params.doctorId },
      include: { user: { select: { fullName: true, isActive: true } }, workingHours: true },
    });
    if (!doctor || !doctor.user.isActive) throw notFound('Doctor');
    res.json({ doctor: doctorCard(doctor) });
  })
);

/**
 * Available slots for a doctor over a date range.
 * The response is advisory — the slot is only really yours once a hold or
 * booking succeeds.
 */
router.get(
  '/:doctorId/availability',
  validate(
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const days = await getAvailability({
      doctorId: req.params.doctorId,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ days });
  })
);

router.get(
  '/:doctorId/leave',
  authenticate,
  asyncHandler(async (req, res) => {
    const leave = await listLeave({
      doctorId: req.params.doctorId,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ leave });
  })
);

export default router;
export { doctorCard };

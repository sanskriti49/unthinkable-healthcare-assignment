import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/async-handler.js';
import { validate } from '../middleware/validate.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { queueEmail } from '../services/email/index.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200)
    .regex(/[a-zA-Z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
  fullName: z.string().min(2).max(120).trim(),
  role: z.enum(['PATIENT', 'DOCTOR']).default('PATIENT'),
  phone: z.string().max(30).trim().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.string().max(30).trim().optional(),
  // Doctor-specific fields
  specialisation: z.string().max(100).trim().optional(),
  qualifications: z.string().max(100).trim().optional(),
  roomNumber: z.string().max(30).trim().optional(),
  consultationFee: z.coerce.number().int().min(0).default(50000),
  slotDurationMinutes: z.coerce.number().int().min(5).max(120).default(30),
  bio: z.string().max(1000).trim().optional(),
});

const loginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1),
});

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  fullName: user.fullName,
  phone: user.phone,
  dateOfBirth: user.dateOfBirth,
  gender: user.gender,
  doctorProfileId: user.doctorProfile?.id ?? null,
  specialisation: user.doctorProfile?.specialisation ?? null,
});

/**
 * Self-service registration creates PATIENT or DOCTOR accounts.
 */
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const {
      email,
      password,
      fullName,
      role,
      phone,
      dateOfBirth,
      gender,
      specialisation,
      qualifications,
      roomNumber,
      consultationFee,
      slotDurationMinutes,
      bio,
    } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict('EMAIL_TAKEN', 'An account with that email already exists');

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          phone: phone ?? null,
          dateOfBirth: dateOfBirth ?? null,
          gender: gender ?? null,
          role: role ?? 'PATIENT',
        },
      });

      if (role === 'DOCTOR') {
        const doctorProfile = await tx.doctorProfile.create({
          data: {
            userId: u.id,
            specialisation: specialisation || 'General Medicine',
            qualifications: qualifications || 'MBBS',
            roomNumber: roomNumber || null,
            consultationFee: consultationFee ?? 50000,
            slotDurationMinutes: slotDurationMinutes ?? 30,
            bookingHorizonDays: 30,
            bio: bio || null,
            isAcceptingPatients: true,
          },
        });

        // Default clinic hours: Monday to Friday 09:00 - 17:00
        const defaultHours = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
          { dayOfWeek, startTime: '09:00', endTime: '13:00', doctorId: doctorProfile.id },
          { dayOfWeek, startTime: '14:00', endTime: '17:00', doctorId: doctorProfile.id },
        ]);

        await tx.workingHours.createMany({
          data: defaultHours,
        });

        return { ...u, doctorProfile };
      }

      return u;
    });

    await queueEmail({ to: email, template: 'welcome', data: { fullName, role: user.role } }).catch(() => {});

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { doctorProfile: { select: { id: true, specialisation: true } } },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized('Incorrect email or password');
    }
    if (!user.isActive) throw unauthorized('This account has been deactivated');

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

router.patch(
  '/me',
  authenticate,
  validate(
    z.object({
      fullName: z.string().min(2).max(120).trim().optional(),
      phone: z.string().max(30).trim().optional(),
      dateOfBirth: z.coerce.date().optional(),
      gender: z.string().max(30).trim().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: req.body,
      include: { doctorProfile: { select: { id: true, specialisation: true } } },
    });
    res.json({ user: publicUser(user) });
  })
);

router.post(
  '/change-password',
  authenticate,
  validate(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(200).regex(/[a-zA-Z]/).regex(/\d/),
    })
  ),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!ok) throw badRequest('WRONG_PASSWORD', 'Your current password is incorrect');

    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    res.json({ ok: true });
  })
);

export default router;
export { publicUser };

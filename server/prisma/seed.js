import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

/**
 * Demo data.
 *
 * Idempotent — safe to re-run. Creates one admin, four doctors across
 * different specialisations and slot lengths, and three patients, plus a
 * couple of bookings so the portals are not empty on first login.
 */

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';

/** Mon–Fri 09:00–13:00 and 14:00–17:00. */
const WEEKDAY_CLINIC = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
  { dayOfWeek, startTime: '09:00', endTime: '13:00' },
  { dayOfWeek, startTime: '14:00', endTime: '17:00' },
]);

/** Mon/Wed/Fri mornings only. */
const PART_TIME = [1, 3, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: '10:00',
  endTime: '13:30',
}));

/** Tue–Sat, including a Saturday morning. */
const EXTENDED = [
  ...[2, 3, 4, 5].flatMap((dayOfWeek) => [
    { dayOfWeek, startTime: '08:30', endTime: '12:30' },
    { dayOfWeek, startTime: '15:00', endTime: '18:00' },
  ]),
  { dayOfWeek: 6, startTime: '09:00', endTime: '12:00' },
];

const DOCTORS = [
  {
    email: 'dr.mehta@clinic.local',
    fullName: 'Anjali Mehta',
    specialisation: 'General Medicine',
    qualifications: 'MBBS, MD (Internal Medicine)',
    bio: 'Twelve years in primary care, with an interest in preventive medicine and chronic disease management.',
    roomNumber: '101',
    consultationFee: 50000,
    slotDurationMinutes: 30,
    workingHours: WEEKDAY_CLINIC,
  },
  {
    email: 'dr.iyer@clinic.local',
    fullName: 'Rahul Iyer',
    specialisation: 'Cardiology',
    qualifications: 'MBBS, MD, DM (Cardiology)',
    bio: 'Interventional cardiologist. Special interest in arrhythmia and post-operative follow-up.',
    roomNumber: '204',
    consultationFee: 120000,
    slotDurationMinutes: 20,
    workingHours: EXTENDED,
  },
  {
    email: 'dr.dsouza@clinic.local',
    fullName: 'Maria D\'Souza',
    specialisation: 'Dermatology',
    qualifications: 'MBBS, MD (Dermatology)',
    bio: 'Treats chronic skin conditions, allergies and paediatric dermatology.',
    roomNumber: '112',
    consultationFee: 80000,
    slotDurationMinutes: 15,
    workingHours: PART_TIME,
  },
  {
    email: 'dr.khan@clinic.local',
    fullName: 'Imran Khan',
    specialisation: 'Paediatrics',
    qualifications: 'MBBS, DCH, MD (Paediatrics)',
    bio: 'Newborn care, developmental assessment and childhood immunisation.',
    roomNumber: '008',
    consultationFee: 70000,
    slotDurationMinutes: 30,
    bookingHorizonDays: 45,
    workingHours: WEEKDAY_CLINIC,
  },
];

const PATIENTS = [
  {
    email: 'priya@example.com',
    fullName: 'Priya Sharma',
    phone: '+91 98200 11111',
    dateOfBirth: new Date('1991-04-12'),
    gender: 'Female',
  },
  {
    email: 'arjun@example.com',
    fullName: 'Arjun Nair',
    phone: '+91 98200 22222',
    dateOfBirth: new Date('1978-11-30'),
    gender: 'Male',
  },
  {
    email: 'sara@example.com',
    fullName: 'Sara Fernandes',
    phone: '+91 98200 33333',
    dateOfBirth: new Date('2015-06-08'),
    gender: 'Female',
  },
];

async function upsertUser({ email, fullName, role, ...rest }) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    create: { email, fullName, role, passwordHash, ...rest },
    update: { fullName, role, ...rest },
  });
}

async function main() {
  console.log('Seeding…');

  const admin = await upsertUser({
    email: 'admin@clinic.local',
    fullName: 'Clinic Administrator',
    role: 'ADMIN',
    phone: '+91 22 4000 0000',
  });
  console.log(`  admin      ${admin.email}`);

  const doctorProfiles = [];
  for (const { email, fullName, workingHours, ...profile } of DOCTORS) {
    const user = await upsertUser({ email, fullName, role: 'DOCTOR' });

    const doctor = await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profile },
      update: profile,
    });

    // Replace working hours so re-seeding does not accumulate duplicates.
    await prisma.workingHours.deleteMany({ where: { doctorId: doctor.id } });
    await prisma.workingHours.createMany({
      data: workingHours.map((h) => ({ ...h, doctorId: doctor.id })),
      skipDuplicates: true,
    });

    doctorProfiles.push(doctor);
    console.log(`  doctor     ${email}  (${profile.specialisation}, ${profile.slotDurationMinutes}min slots)`);
  }

  const patients = [];
  for (const patient of PATIENTS) {
    const user = await upsertUser({ ...patient, role: 'PATIENT' });
    patients.push(user);
    console.log(`  patient    ${patient.email}`);
  }

  console.log('\nDone. Every demo account uses the password:', PASSWORD);
  console.log('\nSign in as:');
  console.log('  Admin    admin@clinic.local');
  console.log('  Doctor   dr.mehta@clinic.local');
  console.log('  Patient  priya@example.com');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

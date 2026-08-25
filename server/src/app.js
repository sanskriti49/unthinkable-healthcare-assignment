import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, integrationStatus } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { prisma } from './db.js';

import authRoutes from './routes/auth.js';
import doctorRoutes from './routes/doctors.js';
import appointmentRoutes from './routes/appointments.js';
import doctorPortalRoutes from './routes/doctor-portal.js';
import patientPortalRoutes from './routes/patient-portal.js';
import adminRoutes from './routes/admin.js';
import calendarRoutes from './routes/calendar.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser clients (curl, tests) send no Origin.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) {
          return callback(null, true);
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false }));
  if (!env.isProduction) app.use(morgan('dev'));

  /**
   * Health check. Reports which optional integrations are configured, which
   * makes "why aren't emails sending?" a one-request question in any
   * environment.
   */
  app.get('/api/health', async (_req, res) => {
    let database = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      database = `error: ${err.message}`;
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      database,
      clinicTimezone: env.clinicTimezone,
      integrations: integrationStatus(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/doctors', doctorRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/doctor', doctorPortalRoutes);
  app.use('/api/patient', patientPortalRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/calendar', calendarRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

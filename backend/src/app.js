import cors from 'cors';
import express from 'express';

import adminRoutes from './routes/adminRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import barberRoutes from './routes/barberRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware.js';

const app = express();
const defaultOrigins = ['http://localhost:5173', 'http://localhost:8080', 'https://chincoacortes.selfmachine.com.br/'];
const appointmentDebugLogs = String(process.env.APPOINTMENT_DEBUG_LOGS || '').trim() === 'true';

function getAllowedOrigins() {
  const fromCorsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const fromFrontendOrigin = process.env.FRONTEND_ORIGIN ? [process.env.FRONTEND_ORIGIN.trim()] : [];

  return [...new Set([...defaultOrigins, ...fromCorsOrigins, ...fromFrontendOrigin])];
}

const allowedOrigins = getAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }),
);

const requestBodyLimit = String(process.env.REQUEST_BODY_LIMIT || '10mb').trim() || '10mb';
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));

if (appointmentDebugLogs) {
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/appointments')) {
      return next();
    }

    const startedAt = Date.now();
    const payload = req.method === 'POST' ? req.body : req.query;
    const authHeader = req.headers.authorization;

    console.log(
      '[appointments:req]',
      JSON.stringify({
        method: req.method,
        path: req.path,
        payload,
        hasAuth: Boolean(authHeader),
      }),
    );

    res.on('finish', () => {
      console.log(
        '[appointments:res]',
        JSON.stringify({
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    return next();
  });
}

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { allowedOrigins };
export default app;

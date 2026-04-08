import cors from 'cors';
import express from 'express';

import adminRoutes from './routes/adminRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware.js';

const app = express();
const defaultOrigins = ['http://localhost:5173', 'http://localhost:8080'];

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

app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { allowedOrigins };
export default app;

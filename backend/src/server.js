import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
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

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'the-barber-hub-backend',
    timestamp: new Date().toISOString(),
  });
});

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
});

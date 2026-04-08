import { Pool } from 'pg';

import { AppError } from '../utils/appError.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL nao configurado. Endpoints de banco falharao ate configurar a variavel.');
}

const isProduction = process.env.NODE_ENV === 'production';

export const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: isProduction ? { rejectUnauthorized: false } : false,
      }
    : undefined,
);

export async function query(text, params = []) {
  if (!connectionString) {
    throw new AppError('DATABASE_URL nao configurado', 500, 'DATABASE_URL_MISSING');
  }

  return pool.query(text, params);
}

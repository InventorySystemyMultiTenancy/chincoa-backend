import bcrypt from 'bcrypt';

import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

const SALT_ROUNDS = 10;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function registerUser({ fullName, email, phone, password }) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const normalizedEmail = normalizeEmail(email);

  try {
    const result = await query(
      `
        INSERT INTO users (full_name, email, phone, password_hash, role)
        VALUES ($1, $2, $3, $4, 'client')
        RETURNING id, full_name, email, phone, role, created_at
      `,
      [fullName.trim(), normalizedEmail, String(phone || '').trim(), passwordHash],
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Email ja cadastrado', 409, 'EMAIL_ALREADY_EXISTS');
    }

    throw error;
  }
}

export async function loginUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);

  const result = await query(
    `
      SELECT id, full_name, email, phone, role, password_hash, created_at
      FROM users
      WHERE email = $1
    `,
    [normalizedEmail],
  );

  if (result.rowCount === 0) {
    throw new AppError('Credenciais invalidas', 401, 'INVALID_CREDENTIALS');
  }

  const user = result.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    throw new AppError('Credenciais invalidas', 401, 'INVALID_CREDENTIALS');
  }

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    created_at: user.created_at,
  };
}

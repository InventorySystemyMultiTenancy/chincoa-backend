import bcrypt from 'bcrypt';

import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

const SALT_ROUNDS = 10;

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value || null;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export async function registerUser({ fullName, email, phone, password, birthDate }) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  try {
    const result = await query(
      `
        INSERT INTO users (full_name, email, phone, birth_date, password_hash, role)
        VALUES ($1, $2, $3, $4, $5, 'client')
        RETURNING id, full_name, email, phone, birth_date, role, created_at
      `,
      [fullName.trim(), normalizedEmail, normalizedPhone, birthDate, passwordHash],
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      const constraint = String(error.constraint || '');
      const detail = String(error.detail || '').toLowerCase();

      if (constraint.includes('users_phone_key') || detail.includes('(phone)')) {
        throw new AppError('Telefone ja cadastrado', 409, 'PHONE_ALREADY_EXISTS');
      }

      if (
        constraint.includes('users_email_key')
        || constraint.includes('uq_users_email_not_null')
        || detail.includes('(email)')
      ) {
        throw new AppError('Email ja cadastrado', 409, 'EMAIL_ALREADY_EXISTS');
      }

      throw new AppError('Registro duplicado', 409, 'ALREADY_EXISTS');
    }

    throw error;
  }
}

export async function loginUser({ phone, password }) {
  const normalizedPhone = normalizePhone(phone);

  const result = await query(
    `
      SELECT id, full_name, email, phone, birth_date, role, password_hash, created_at
      FROM users
      WHERE phone = $1
    `,
    [normalizedPhone],
  );

  if (result.rowCount === 0) {
    throw new AppError('Credenciais invalidas', 401, 'AUTH_INVALID_CREDENTIALS');
  }

  const user = result.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    throw new AppError('Credenciais invalidas', 401, 'AUTH_INVALID_CREDENTIALS');
  }

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    birth_date: user.birth_date,
    role: user.role,
    created_at: user.created_at,
  };
}

import bcrypt from 'bcrypt';

import { query } from './pool.js';

const SALT_ROUNDS = 10;

export async function seedInitialAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '').trim();

  if (!email || !password) {
    return;
  }

  const fullName = String(process.env.ADMIN_FULL_NAME || 'Admin Inicial').trim();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await query(
    `
      INSERT INTO users (full_name, email, phone, password_hash, role)
      VALUES ($1, $2, $3, $4, 'admin')
      ON CONFLICT (email)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        password_hash = EXCLUDED.password_hash,
        role = 'admin'
    `,
    [fullName, email, '', passwordHash],
  );

  console.log(`Admin inicial garantido para: ${email}`);
}

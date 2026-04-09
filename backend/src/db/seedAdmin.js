import bcrypt from 'bcrypt';

import { query } from './pool.js';

const SALT_ROUNDS = 10;

export async function seedInitialAdmin() {
  const email = 'admin@chincoa.com';
  const phone = '11999990000';
  const birthDate = '1990-01-01';
  const password = '123456chincoa';
  const shouldOverwritePassword = String(process.env.ADMIN_FORCE_PASSWORD_RESET || '').trim() === 'true';
  const fullName = 'Administrador Chincoa';
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  if (shouldOverwritePassword) {
    await query(
      `
        INSERT INTO users (full_name, email, phone, birth_date, password_hash, role)
        VALUES ($1, $2, $3, $4, $5, 'admin')
        ON CONFLICT (email)
        DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          birth_date = EXCLUDED.birth_date,
          password_hash = EXCLUDED.password_hash,
          role = 'admin'
      `,
      [fullName, email, phone, birthDate, passwordHash],
    );

    console.log(`Admin garantido para: ${email} (senha atualizada por flag)`);
    return;
  }

  await query(
    `
      INSERT INTO users (full_name, email, phone, birth_date, password_hash, role)
      VALUES ($1, $2, $3, $4, $5, 'admin')
      ON CONFLICT (email)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        birth_date = EXCLUDED.birth_date,
        role = 'admin'
    `,
    [fullName, email, phone, birthDate, passwordHash],
  );

  console.log(`Admin inicial garantido para: ${email}`);
}

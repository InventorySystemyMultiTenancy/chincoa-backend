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

  const existing = await query(
    `
      SELECT id
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email],
  );

  if (existing.rowCount > 0) {
    if (shouldOverwritePassword) {
      await query(
        `
          UPDATE users
          SET
            full_name = $2,
            email = $3,
            phone = $4,
            birth_date = $5,
            password_hash = $6,
            role = 'admin'
          WHERE id = $1
        `,
        [existing.rows[0].id, fullName, email, phone, birthDate, passwordHash],
      );

      console.log(`Admin garantido para: ${email} (senha atualizada por flag)`);
      return;
    }

    await query(
      `
        UPDATE users
        SET
          full_name = $2,
          email = $3,
          phone = $4,
          birth_date = $5,
          role = 'admin'
        WHERE id = $1
      `,
      [existing.rows[0].id, fullName, email, phone, birthDate],
    );

    console.log(`Admin inicial garantido para: ${email}`);
    return;
  }

  await query(
    `
      INSERT INTO users (full_name, email, phone, birth_date, password_hash, role)
      VALUES ($1, $2, $3, $4, $5, 'admin')
    `,
    [fullName, email, phone, birthDate, passwordHash],
  );

  console.log(`Admin inicial garantido para: ${email}`);
}

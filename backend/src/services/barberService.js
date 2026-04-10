import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

function normalizeNullable(value) {
  const text = String(value || '').trim();
  return text ? text : null;
}

function serializeBarber(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    image_url: row.image_url || null,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listActiveBarbers() {
  const result = await query(
    `
      SELECT id, full_name, image_url, is_active, created_at, updated_at
      FROM barbers
      WHERE is_active = true
      ORDER BY full_name ASC
    `,
  );

  return result.rows.map(serializeBarber);
}

export async function listAllBarbers() {
  const result = await query(
    `
      SELECT id, full_name, image_url, is_active, created_at, updated_at
      FROM barbers
      ORDER BY is_active DESC, full_name ASC
    `,
  );

  return result.rows.map(serializeBarber);
}

export async function createBarber({ fullName, imageUrl, isActive = true }) {
  const normalizedName = String(fullName || '').trim();

  if (!normalizedName) {
    throw new AppError('Nome do barbeiro e obrigatorio', 400, 'VALIDATION_ERROR');
  }

  try {
    const result = await query(
      `
        INSERT INTO barbers (full_name, image_url, is_active)
        VALUES ($1, $2, $3)
        RETURNING id, full_name, image_url, is_active, created_at, updated_at
      `,
      [normalizedName, normalizeNullable(imageUrl), Boolean(isActive)],
    );

    try {
      await query(
        `
          INSERT INTO business_hours (weekday, slot_time, is_booked_week, barber_id)
          SELECT base.weekday, base.slot_time, false, $1
          FROM (
            SELECT DISTINCT weekday, slot_time
            FROM business_hours
          ) base
          ON CONFLICT (weekday, slot_time, barber_id) DO NOTHING
        `,
        [result.rows[0].id],
      );
    } catch (error) {
      if (error.code !== '42703') {
        throw error;
      }
    }

    return serializeBarber(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Ja existe barbeiro com esse nome', 409, 'BARBER_DUPLICATED_NAME');
    }

    throw error;
  }
}

export async function updateBarber({ barberId, fullName, imageUrl, isActive }) {
  const current = await query(
    `
      SELECT id, full_name, image_url, is_active, created_at, updated_at
      FROM barbers
      WHERE id = $1
      LIMIT 1
    `,
    [barberId],
  );

  if (current.rowCount === 0) {
    throw new AppError('Barbeiro nao encontrado', 404, 'BARBER_NOT_FOUND');
  }

  const payload = current.rows[0];
  const nextName = fullName !== undefined ? String(fullName || '').trim() : payload.full_name;

  if (!nextName) {
    throw new AppError('Nome do barbeiro e obrigatorio', 400, 'VALIDATION_ERROR');
  }

  const nextImageUrl = imageUrl !== undefined ? normalizeNullable(imageUrl) : payload.image_url;
  const nextIsActive = isActive !== undefined ? Boolean(isActive) : payload.is_active;

  try {
    const result = await query(
      `
        UPDATE barbers
        SET
          full_name = $2,
          image_url = $3,
          is_active = $4,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, full_name, image_url, is_active, created_at, updated_at
      `,
      [barberId, nextName, nextImageUrl, nextIsActive],
    );

    return serializeBarber(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Ja existe barbeiro com esse nome', 409, 'BARBER_DUPLICATED_NAME');
    }

    throw error;
  }
}

export async function disableBarber(barberId) {
  const result = await query(
    `
      UPDATE barbers
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id, full_name, image_url, is_active, created_at, updated_at
    `,
    [barberId],
  );

  if (result.rowCount === 0) {
    throw new AppError('Barbeiro nao encontrado', 404, 'BARBER_NOT_FOUND');
  }

  return serializeBarber(result.rows[0]);
}

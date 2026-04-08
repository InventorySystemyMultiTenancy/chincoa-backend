import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

export async function listBusinessHours(weekday = null) {
  const params = [];
  let where = '';

  if (weekday !== null) {
    params.push(weekday);
    where = 'WHERE weekday = $1';
  }

  const result = await query(
    `
      SELECT id, weekday, slot_time, is_enabled, created_at
      FROM business_hours
      ${where}
      ORDER BY weekday ASC, slot_time ASC
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    time: String(row.slot_time).slice(0, 5),
  }));
}

export async function createBusinessHour({ weekday, time, isEnabled = true }) {
  try {
    const result = await query(
      `
        INSERT INTO business_hours (weekday, slot_time, is_enabled)
        VALUES ($1, $2, $3)
        RETURNING id, weekday, slot_time, is_enabled, created_at
      `,
      [weekday, time, isEnabled],
    );

    return {
      ...result.rows[0],
      time: String(result.rows[0].slot_time).slice(0, 5),
    };
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Horario ja cadastrado para este dia da semana', 409, 'VALIDATION_ERROR');
    }

    throw error;
  }
}

export async function updateBusinessHour({ id, weekday, time, isEnabled }) {
  const current = await query(
    `
      SELECT id, weekday, slot_time, is_enabled, created_at
      FROM business_hours
      WHERE id = $1
    `,
    [id],
  );

  if (current.rowCount === 0) {
    throw new AppError('Horario nao encontrado', 404, 'NOT_FOUND');
  }

  const existing = current.rows[0];
  const nextWeekday = weekday ?? existing.weekday;
  const nextTime = time ?? String(existing.slot_time).slice(0, 5);
  const nextIsEnabled = isEnabled ?? existing.is_enabled;

  try {
    const result = await query(
      `
        UPDATE business_hours
        SET weekday = $2, slot_time = $3, is_enabled = $4
        WHERE id = $1
        RETURNING id, weekday, slot_time, is_enabled, created_at
      `,
      [id, nextWeekday, nextTime, nextIsEnabled],
    );

    return {
      ...result.rows[0],
      time: String(result.rows[0].slot_time).slice(0, 5),
    };
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Ja existe esse horario para o dia da semana informado', 409, 'VALIDATION_ERROR');
    }

    throw error;
  }
}

export async function deleteBusinessHour(id) {
  const result = await query(
    `
      DELETE FROM business_hours
      WHERE id = $1
      RETURNING id
    `,
    [id],
  );

  if (result.rowCount === 0) {
    throw new AppError('Horario nao encontrado', 404, 'NOT_FOUND');
  }
}

export async function listBusinessDays({ from = null, to = null }) {
  const params = [];
  let where = '';

  if (from && to) {
    params.push(from, to);
    where = 'WHERE date BETWEEN $1 AND $2';
  } else if (from) {
    params.push(from);
    where = 'WHERE date >= $1';
  } else if (to) {
    params.push(to);
    where = 'WHERE date <= $1';
  }

  const result = await query(
    `
      SELECT id, date, is_enabled, reason, created_at
      FROM business_days
      ${where}
      ORDER BY date ASC
    `,
    params,
  );

  return result.rows;
}

export async function createBusinessDay({ date, isEnabled = true, reason = null }) {
  const result = await query(
    `
      INSERT INTO business_days (date, is_enabled, reason)
      VALUES ($1, $2, $3)
      ON CONFLICT (date)
      DO UPDATE SET is_enabled = EXCLUDED.is_enabled, reason = EXCLUDED.reason
      RETURNING id, date, is_enabled, reason, created_at
    `,
    [date, isEnabled, reason],
  );

  return result.rows[0];
}

export async function updateBusinessDay({ id, date, isEnabled, reason }) {
  const current = await query(
    `
      SELECT id, date, is_enabled, reason, created_at
      FROM business_days
      WHERE id = $1
    `,
    [id],
  );

  if (current.rowCount === 0) {
    throw new AppError('Dia nao encontrado', 404, 'NOT_FOUND');
  }

  const existing = current.rows[0];
  const nextDate = date ?? existing.date;
  const nextIsEnabled = isEnabled ?? existing.is_enabled;
  const nextReason = reason !== undefined ? reason : existing.reason;

  const result = await query(
    `
      UPDATE business_days
      SET date = $2, is_enabled = $3, reason = $4
      WHERE id = $1
      RETURNING id, date, is_enabled, reason, created_at
    `,
    [id, nextDate, nextIsEnabled, nextReason],
  );

  return result.rows[0];
}

export async function deleteBusinessDay(id) {
  const result = await query(
    `
      DELETE FROM business_days
      WHERE id = $1
      RETURNING id
    `,
    [id],
  );

  if (result.rowCount === 0) {
    throw new AppError('Dia nao encontrado', 404, 'NOT_FOUND');
  }
}

import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

export async function listBusinessHours(weekday = null) {
  const params = [];
  let where = '';

  if (weekday !== null) {
    params.push(weekday);
    where = 'WHERE bh.weekday = $1';
  }

  const result = await query(
    `
      SELECT
        MIN(bh.id) AS id,
        bh.weekday,
        bh.slot_time,
        BOOL_OR(bh.is_booked_week) AS is_booked_week,
        MIN(bh.created_at) AS created_at
      FROM business_hours bh
      ${where}
      GROUP BY bh.weekday, bh.slot_time
      ORDER BY bh.weekday ASC, bh.slot_time ASC
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    time: String(row.slot_time).slice(0, 5),
  }));
}

export async function createBusinessHour({ weekday, time }) {
  const barbers = await query(
    `
      SELECT id
      FROM barbers
      WHERE is_active = true
    `,
  );

  if (barbers.rowCount === 0) {
    throw new AppError('Cadastre ao menos um barbeiro ativo antes de criar horarios', 400, 'NO_ACTIVE_BARBERS');
  }

  await query(
    `
      INSERT INTO business_hours (weekday, slot_time, barber_id)
      SELECT $1, $2, b.id
      FROM barbers b
      WHERE b.is_active = true
      ON CONFLICT (weekday, slot_time, barber_id) DO NOTHING
    `,
    [weekday, time],
  );

  const result = await query(
    `
      SELECT
        MIN(id) AS id,
        weekday,
        slot_time,
        BOOL_OR(is_booked_week) AS is_booked_week,
        MIN(created_at) AS created_at
      FROM business_hours
      WHERE weekday = $1 AND slot_time = $2
      GROUP BY weekday, slot_time
      LIMIT 1
    `,
    [weekday, time],
  );

  return {
    ...result.rows[0],
    time: String(result.rows[0].slot_time).slice(0, 5),
  };
}

export async function updateBusinessHour({ id, weekday, time }) {
  const current = await query(
    `
      SELECT id, weekday, slot_time, is_booked_week, created_at
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

  await query(
    `
      UPDATE business_hours
      SET weekday = $3, slot_time = $4
      WHERE weekday = $1 AND slot_time = $2
    `,
    [existing.weekday, String(existing.slot_time).slice(0, 5), nextWeekday, nextTime],
  );

  const result = await query(
    `
      SELECT
        MIN(id) AS id,
        weekday,
        slot_time,
        BOOL_OR(is_booked_week) AS is_booked_week,
        MIN(created_at) AS created_at
      FROM business_hours
      WHERE weekday = $1 AND slot_time = $2
      GROUP BY weekday, slot_time
      LIMIT 1
    `,
    [nextWeekday, nextTime],
  );

  return {
    ...result.rows[0],
    time: String(result.rows[0].slot_time).slice(0, 5),
  };
}

export async function deleteBusinessHour(id) {
  const current = await query(
    `
      SELECT id, weekday, slot_time
      FROM business_hours
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  if (current.rowCount === 0) {
    throw new AppError('Horario nao encontrado', 404, 'NOT_FOUND');
  }

  const existing = current.rows[0];

  const result = await query(
    `
      DELETE FROM business_hours
      WHERE weekday = $1 AND slot_time = $2
      RETURNING id
    `,
    [existing.weekday, String(existing.slot_time).slice(0, 5)],
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

export async function listBusinessDayHours({ date = null, from = null, to = null }) {
  const params = [];
  let where = '';

  if (date) {
    params.push(date);
    where = 'WHERE date = $1';
  } else if (from && to) {
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
      SELECT id, date, slot_time, is_enabled, reason, created_at, updated_at
      FROM business_day_hour_overrides
      ${where}
      ORDER BY date ASC, slot_time ASC
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    time: String(row.slot_time).slice(0, 5),
  }));
}

export async function createBusinessDayHour({ date, time, isEnabled = true, reason = null }) {
  const result = await query(
    `
      INSERT INTO business_day_hour_overrides (date, slot_time, is_enabled, reason)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (date, slot_time)
      DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        reason = EXCLUDED.reason,
        updated_at = NOW()
      RETURNING id, date, slot_time, is_enabled, reason, created_at, updated_at
    `,
    [date, time, isEnabled, reason],
  );

  return {
    ...result.rows[0],
    time: String(result.rows[0].slot_time).slice(0, 5),
  };
}

export async function updateBusinessDayHour({ id, date, time, isEnabled, reason }) {
  const current = await query(
    `
      SELECT id, date, slot_time, is_enabled, reason, created_at, updated_at
      FROM business_day_hour_overrides
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  if (current.rowCount === 0) {
    throw new AppError('Horario do dia nao encontrado', 404, 'NOT_FOUND');
  }

  const existing = current.rows[0];
  const nextDate = date ?? existing.date;
  const nextTime = time ?? String(existing.slot_time).slice(0, 5);
  const nextIsEnabled = isEnabled ?? existing.is_enabled;
  const nextReason = reason !== undefined ? reason : existing.reason;

  const result = await query(
    `
      UPDATE business_day_hour_overrides
      SET date = $2, slot_time = $3, is_enabled = $4, reason = $5, updated_at = NOW()
      WHERE id = $1
      RETURNING id, date, slot_time, is_enabled, reason, created_at, updated_at
    `,
    [id, nextDate, nextTime, nextIsEnabled, nextReason],
  );

  return {
    ...result.rows[0],
    time: String(result.rows[0].slot_time).slice(0, 5),
  };
}

export async function deleteBusinessDayHour(id) {
  const result = await query(
    `
      DELETE FROM business_day_hour_overrides
      WHERE id = $1
      RETURNING id
    `,
    [id],
  );

  if (result.rowCount === 0) {
    throw new AppError('Horario do dia nao encontrado', 404, 'NOT_FOUND');
  }
}

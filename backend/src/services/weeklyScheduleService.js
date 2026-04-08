import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

const SCHEDULE_STATE_KEY = 'current_week_start';
const SCHEDULE_LOCK_KEY = 20260408;
const MAINTENANCE_INTERVAL_MS = 60 * 1000;

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

export function getCurrentWeekStartDate(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + diffToMonday);
  return toDateOnly(date);
}

export function getCurrentWeekRange(referenceDate = new Date()) {
  const start = new Date(getCurrentWeekStartDate(referenceDate));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return {
    weekStart: toDateOnly(start),
    weekEnd: toDateOnly(end),
  };
}

function assertDateWithinCurrentWeek(dateString) {
  const { weekStart, weekEnd } = getCurrentWeekRange();

  if (dateString < weekStart || dateString > weekEnd) {
    throw new AppError(
      `Apenas horarios da semana atual podem ser reservados (${weekStart} ate ${weekEnd})`,
      400,
      'OUT_OF_WEEK_RANGE',
    );
  }
}

export async function ensureCurrentWeekSchedule() {
  const currentWeekStart = getCurrentWeekStartDate();

  await query('BEGIN');

  try {
    await query('SELECT pg_advisory_xact_lock($1)', [SCHEDULE_LOCK_KEY]);

    const state = await query(
      `
        SELECT setting_value
        FROM system_settings
        WHERE setting_key = $1
        FOR UPDATE
      `,
      [SCHEDULE_STATE_KEY],
    );

    const storedWeekStart = state.rowCount > 0 ? state.rows[0].setting_value : null;

    if (storedWeekStart !== currentWeekStart) {
      await query('DELETE FROM appointments');

      await query(
        `
          INSERT INTO appointments (user_id, appointment_date, appointment_time, status, price, week_start_date)
          SELECT
            NULL,
            ($1::date + (bh.weekday * INTERVAL '1 day'))::date,
            bh.slot_time,
            'disponivel',
            45.00,
            $1::date
          FROM business_hours bh
          WHERE bh.enabled = true
          ORDER BY bh.weekday, bh.slot_time
        `,
        [currentWeekStart],
      );

      await query(
        `
          INSERT INTO system_settings (setting_key, setting_value)
          VALUES ($1, $2)
          ON CONFLICT (setting_key)
          DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
        `,
        [SCHEDULE_STATE_KEY, currentWeekStart],
      );
    }

    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

export async function reserveWeeklySlot({ userId, appointmentDate, appointmentTime }) {
  assertDateWithinCurrentWeek(appointmentDate);

  await ensureCurrentWeekSchedule();

  const reserved = await query(
    `
      UPDATE appointments
      SET
        user_id = $1,
        status = 'agendado',
        updated_at = NOW()
      WHERE
        appointment_date = $2
        AND appointment_time = $3
        AND status = 'disponivel'
      RETURNING id, user_id, appointment_date, appointment_time, status, price, created_at, updated_at
    `,
    [userId, appointmentDate, appointmentTime],
  );

  if (reserved.rowCount > 0) {
    return reserved.rows[0];
  }

  const slot = await query(
    `
      SELECT id, status
      FROM appointments
      WHERE appointment_date = $1 AND appointment_time = $2
    `,
    [appointmentDate, appointmentTime],
  );

  if (slot.rowCount === 0) {
    throw new AppError('Horario fora da grade semanal da barbearia', 404, 'SLOT_NOT_FOUND');
  }

  throw new AppError('Horario indisponivel para a data selecionada', 409, 'SLOT_CONFLICT');
}

export async function startWeeklyScheduleMaintenance() {
  await ensureCurrentWeekSchedule();

  setInterval(async () => {
    try {
      await ensureCurrentWeekSchedule();
    } catch (error) {
      console.error('Falha na manutencao semanal de horarios:', error.message);
    }
  }, MAINTENANCE_INTERVAL_MS);
}

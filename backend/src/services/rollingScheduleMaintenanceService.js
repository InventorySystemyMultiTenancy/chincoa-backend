import { pool } from '../db/pool.js';
import { getNowByBusinessTimezone } from '../utils/validators.js';

const ROLLING_WINDOW_LOCK_KEY = 20260410;
const ROLLING_WINDOW_STATE_KEY = 'rolling_booking_window_last_run_date';
const ROLLING_WINDOW_INTERVAL_MS = 60 * 60 * 1000;
const RETENTION_DAYS = Number(process.env.BOOKING_HISTORY_RETENTION_DAYS || 60);
const FUTURE_DAYS = Number(process.env.BOOKING_FUTURE_DAYS || 15);

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

function getRollingWindowByBusinessTimezone() {
  const now = getNowByBusinessTimezone();

  return {
    nowDate: now.currentDate,
    retentionStartDate: addDays(now.currentDate, -RETENTION_DAYS),
    bookingStartDate: now.currentDate,
    bookingEndDate: addDays(now.currentDate, FUTURE_DAYS),
    retentionDays: RETENTION_DAYS,
    futureDays: FUTURE_DAYS,
    timezone: now.timezone,
  };
}

export async function runRollingScheduleMaintenance() {
  const window = getRollingWindowByBusinessTimezone();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [ROLLING_WINDOW_LOCK_KEY]);

    await client.query(
      `
        DELETE FROM appointments
        WHERE appointment_date < $1
      `,
      [window.retentionStartDate],
    );

    await client.query(
      `
        DELETE FROM business_days
        WHERE date < $1 OR date > $2
      `,
      [window.retentionStartDate, window.bookingEndDate],
    );

    await client.query(
      `
        DELETE FROM business_day_hour_overrides
        WHERE date < $1 OR date > $2
      `,
      [window.retentionStartDate, window.bookingEndDate],
    );

    await client.query(
      `
        INSERT INTO business_days (date, is_enabled, reason)
        SELECT d::date, true, NULL
        FROM generate_series($1::date, $2::date, '1 day'::interval) AS d
        WHERE NOT EXISTS (
          SELECT 1
          FROM business_days bd
          WHERE bd.date = d::date
        )
      `,
      [window.nowDate, window.bookingEndDate],
    );

    const updatedSetting = await client.query(
      `
        UPDATE system_settings
        SET setting_value = $2, updated_at = NOW()
        WHERE setting_key = $1
      `,
      [ROLLING_WINDOW_STATE_KEY, window.nowDate],
    );

    if (updatedSetting.rowCount === 0) {
      await client.query(
        `
          INSERT INTO system_settings (setting_key, setting_value)
          SELECT $1, $2
          WHERE NOT EXISTS (
            SELECT 1 FROM system_settings WHERE setting_key = $1
          )
        `,
        [ROLLING_WINDOW_STATE_KEY, window.nowDate],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function startRollingScheduleMaintenance() {
  await runRollingScheduleMaintenance();

  setInterval(async () => {
    try {
      await runRollingScheduleMaintenance();
    } catch (error) {
      console.error('Falha na manutencao da janela movel de agendamentos:', error.message);
    }
  }, ROLLING_WINDOW_INTERVAL_MS);
}

export { getRollingWindowByBusinessTimezone };

import { pool, query } from '../db/pool.js';
import { getCurrentWeekRangeByBusinessTimezone, getNowByBusinessTimezone } from '../utils/validators.js';

const RESET_KEY = 'weekly_business_hours_reset_week';
const RESET_LOCK_KEY = 20260409;
const RESET_INTERVAL_MS = 60 * 1000;
const MONDAY_WEEKDAY = 1;

function minutesFromTime(value) {
  const [h, m] = String(value).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

async function getFirstMondaySlotMinutes() {
  const result = await query(
    `
      SELECT slot_time
      FROM business_hours
      WHERE weekday = $1
      ORDER BY slot_time ASC
      LIMIT 1
    `,
    [MONDAY_WEEKDAY],
  );

  if (result.rowCount === 0) {
    return 0;
  }

  return minutesFromTime(result.rows[0].slot_time);
}

export async function resetWeeklyBookingFlagsIfNeeded() {
  const now = getNowByBusinessTimezone();
  const { weekStart } = getCurrentWeekRangeByBusinessTimezone();
  const firstMondaySlotMinutes = await getFirstMondaySlotMinutes();
  const shouldAllowReset = now.currentDate > weekStart || now.currentMinutes >= firstMondaySlotMinutes;

  if (!shouldAllowReset) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [RESET_LOCK_KEY]);

    const state = await client.query(
      `
        SELECT setting_value
        FROM system_settings
        WHERE setting_key = $1
        FOR UPDATE
      `,
      [RESET_KEY],
    );

    const lastResetWeek = state.rowCount > 0 ? state.rows[0].setting_value : null;

    if (lastResetWeek !== weekStart) {
      await client.query('UPDATE business_hours SET is_booked_week = false');

      const updatedSetting = await client.query(
        `
          UPDATE system_settings
          SET setting_value = $2, updated_at = NOW()
          WHERE setting_key = $1
        `,
        [RESET_KEY, weekStart],
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
          [RESET_KEY, weekStart],
        );
      }

      console.log(`Reset semanal aplicado para semana iniciada em ${weekStart}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function startWeeklyResetMaintenance() {
  await resetWeeklyBookingFlagsIfNeeded();

  setInterval(async () => {
    try {
      await resetWeeklyBookingFlagsIfNeeded();
    } catch (error) {
      console.error('Falha no reset semanal de horarios:', error.message);
    }
  }, RESET_INTERVAL_MS);
}

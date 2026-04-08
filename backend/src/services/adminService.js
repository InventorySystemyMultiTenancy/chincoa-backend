import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';
import { ensureCurrentWeekSchedule } from './weeklyScheduleService.js';

export async function listAppointmentsByDate(date) {
  await ensureCurrentWeekSchedule();

  const params = [];
  let whereClause = '';

  if (date) {
    params.push(date);
    whereClause = 'WHERE a.appointment_date = $1';
  }

  const result = await query(
    `
      SELECT
        a.id,
        a.user_id,
        u.full_name,
        u.email,
        u.phone,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.price,
        a.created_at,
        a.updated_at
      FROM appointments a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereClause}
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
    `,
    params,
  );

  return result.rows;
}

export async function updateAppointmentStatus({ appointmentId, status }) {
  await ensureCurrentWeekSchedule();

  const current = await query(
    `
      SELECT id, user_id, appointment_date, appointment_time, status, price, created_at, updated_at
      FROM appointments
      WHERE id = $1
    `,
    [appointmentId],
  );

  if (current.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }

  const slot = current.rows[0];

  if (status !== 'disponivel' && !slot.user_id) {
    throw new AppError('Nao e possivel marcar status sem cliente reservado', 400, 'SLOT_WITHOUT_USER');
  }

  const result = await query(
    `
      UPDATE appointments
      SET
        status = $2,
        user_id = CASE WHEN $2 = 'disponivel' THEN NULL ELSE user_id END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, user_id, appointment_date, appointment_time, status, price, created_at, updated_at
    `,
    [appointmentId, status],
  );

  if (result.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }

  return result.rows[0];
}

export async function deleteAppointmentAsAdmin(appointmentId) {
  await ensureCurrentWeekSchedule();

  const result = await query(
    `
      UPDATE appointments
      SET
        user_id = NULL,
        status = 'disponivel',
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    [appointmentId],
  );

  if (result.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }
}

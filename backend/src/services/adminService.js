import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

export async function listAppointmentsByDate(date) {
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
        a.created_at
      FROM appointments a
      JOIN users u ON u.id = a.user_id
      ${whereClause}
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
    `,
    params,
  );

  return result.rows;
}

export async function updateAppointmentStatus({ appointmentId, status }) {
  const result = await query(
    `
      UPDATE appointments
      SET status = $2
      WHERE id = $1
      RETURNING id, user_id, appointment_date, appointment_time, status, price, created_at
    `,
    [appointmentId, status],
  );

  if (result.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }

  return result.rows[0];
}

export async function deleteAppointmentAsAdmin(appointmentId) {
  const result = await query(
    `
      DELETE FROM appointments
      WHERE id = $1
      RETURNING id
    `,
    [appointmentId],
  );

  if (result.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }
}

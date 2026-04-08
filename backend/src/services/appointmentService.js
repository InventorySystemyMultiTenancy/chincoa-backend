import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

const DEFAULT_PRICE = 45;

export async function listMyAppointments(userId) {
  const result = await query(
    `
      SELECT id, user_id, appointment_date, appointment_time, status, price, created_at
      FROM appointments
      WHERE user_id = $1
      ORDER BY appointment_date DESC, appointment_time DESC
    `,
    [userId],
  );

  return result.rows;
}

export async function createAppointment({ userId, appointmentDate, appointmentTime }) {
  try {
    const result = await query(
      `
        INSERT INTO appointments (user_id, appointment_date, appointment_time, status, price)
        VALUES ($1, $2, $3, 'agendado', $4)
        RETURNING id, user_id, appointment_date, appointment_time, status, price, created_at
      `,
      [userId, appointmentDate, appointmentTime, DEFAULT_PRICE],
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Horario indisponivel para a data selecionada', 409, 'SLOT_CONFLICT');
    }

    throw error;
  }
}

export async function deleteAppointmentByOwnerOrAdmin({ appointmentId, user }) {
  const result = await query(
    `
      SELECT id, user_id
      FROM appointments
      WHERE id = $1
    `,
    [appointmentId],
  );

  if (result.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }

  const appointment = result.rows[0];
  const canDelete = user.role === 'admin' || appointment.user_id === user.id;

  if (!canDelete) {
    throw new AppError('Sem permissao para cancelar este agendamento', 403, 'FORBIDDEN');
  }

  await query(
    `
      DELETE FROM appointments
      WHERE id = $1
    `,
    [appointmentId],
  );
}

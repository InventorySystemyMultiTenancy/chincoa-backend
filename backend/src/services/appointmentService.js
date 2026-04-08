import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';
import { ensureCurrentWeekSchedule, reserveWeeklySlot } from './weeklyScheduleService.js';

export async function listMyAppointments(userId) {
  await ensureCurrentWeekSchedule();

  const result = await query(
    `
      SELECT id, user_id, appointment_date, appointment_time, status, price, created_at, updated_at
      FROM appointments
      WHERE user_id = $1 AND status IN ('agendado', 'pago')
      ORDER BY appointment_date DESC, appointment_time DESC
    `,
    [userId],
  );

  return result.rows;
}

export async function listSlotsByDate(appointmentDate) {
  await ensureCurrentWeekSchedule();

  const result = await query(
    `
      SELECT
        id,
        user_id,
        appointment_date,
        appointment_time,
        status,
        price,
        created_at,
        updated_at
      FROM appointments
      WHERE appointment_date = $1
      ORDER BY appointment_time ASC
    `,
    [appointmentDate],
  );

  return result.rows;
}

export async function createAppointment({ userId, appointmentDate, appointmentTime }) {
  return reserveWeeklySlot({ userId, appointmentDate, appointmentTime });
}

export async function deleteAppointmentByOwnerOrAdmin({ appointmentId, user }) {
  await ensureCurrentWeekSchedule();

  const result = await query(
    `
      SELECT id, user_id, status
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

  if (user.role !== 'admin' && appointment.status === 'pago') {
    throw new AppError('Nao e permitido cancelar agendamento pago', 400, 'PAID_APPOINTMENT_CANNOT_CANCEL');
  }

  await query(
    `
      UPDATE appointments
      SET
        user_id = NULL,
        status = 'disponivel',
        updated_at = NOW()
      WHERE id = $1
    `,
    [appointmentId],
  );
}

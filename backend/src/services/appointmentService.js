import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

const DEFAULT_PRICE = 45;

function getWeekdayFromDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.getDay();
}

async function getDayOverride(dateString) {
  const result = await query(
    `
      SELECT id, date, is_enabled, reason
      FROM business_days
      WHERE date = $1
      LIMIT 1
    `,
    [dateString],
  );

  return result.rowCount > 0 ? result.rows[0] : null;
}

async function getHoursByWeekday(weekday) {
  const result = await query(
    `
      SELECT id, weekday, slot_time, is_enabled
      FROM business_hours
      WHERE weekday = $1
      ORDER BY slot_time ASC
    `,
    [weekday],
  );

  return result.rows;
}

async function getBookedAppointmentsByDate(dateString) {
  const result = await query(
    `
      SELECT id, user_id, appointment_date, appointment_time, status, price, created_at, updated_at
      FROM appointments
      WHERE appointment_date = $1 AND status IN ('agendado', 'pago')
    `,
    [dateString],
  );

  return result.rows;
}

async function assertSlotEnabledForBooking(dateString, timeString) {
  const dayOverride = await getDayOverride(dateString);

  if (dayOverride && !dayOverride.is_enabled) {
    throw new AppError('Dia desabilitado para atendimento', 400, 'DAY_DISABLED', {
      date: dateString,
      reason: dayOverride.reason,
    });
  }

  const weekday = getWeekdayFromDate(dateString);

  const result = await query(
    `
      SELECT id, weekday, slot_time, is_enabled
      FROM business_hours
      WHERE weekday = $1 AND slot_time = $2
      LIMIT 1
    `,
    [weekday, timeString],
  );

  if (result.rowCount === 0 || !result.rows[0].is_enabled) {
    throw new AppError('Horario desabilitado para este dia', 400, 'SLOT_DISABLED');
  }
}

export async function listMyAppointments(userId) {
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
  const weekday = getWeekdayFromDate(appointmentDate);
  const [dayOverride, hours, booked] = await Promise.all([
    getDayOverride(appointmentDate),
    getHoursByWeekday(weekday),
    getBookedAppointmentsByDate(appointmentDate),
  ]);

  const dayDisabled = dayOverride ? !dayOverride.is_enabled : false;

  const bookedByTime = new Map(
    booked.map((item) => [String(item.appointment_time).slice(0, 5), item]),
  );

  return hours.map((hour) => {
    const time = String(hour.slot_time).slice(0, 5);
    const existing = bookedByTime.get(time);

    if (!hour.is_enabled || dayDisabled) {
      return {
        id: hour.id,
        appointment_id: null,
        user_id: null,
        appointment_date: appointmentDate,
        appointment_time: time,
        status: 'desabilitado',
        price: DEFAULT_PRICE,
        reason: dayDisabled ? dayOverride?.reason || 'Dia desabilitado' : 'Horario desabilitado',
      };
    }

    if (!existing) {
      return {
        id: hour.id,
        appointment_id: null,
        user_id: null,
        appointment_date: appointmentDate,
        appointment_time: time,
        status: 'disponivel',
        price: DEFAULT_PRICE,
        reason: null,
      };
    }

    return {
      id: hour.id,
      appointment_id: existing.id,
      user_id: existing.user_id,
      appointment_date: existing.appointment_date,
      appointment_time: String(existing.appointment_time).slice(0, 5),
      status: existing.status,
      price: Number(existing.price),
      reason: null,
    };
  });
}

export async function createAppointment({ userId, appointmentDate, appointmentTime }) {
  await assertSlotEnabledForBooking(appointmentDate, appointmentTime);

  try {
    const result = await query(
      `
        INSERT INTO appointments (user_id, appointment_date, appointment_time, status, price)
        VALUES ($1, $2, $3, 'agendado', $4)
        RETURNING id, user_id, appointment_date, appointment_time, status, price, created_at, updated_at
      `,
      [userId, appointmentDate, appointmentTime, DEFAULT_PRICE],
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError('Horario ja reservado', 409, 'SLOT_ALREADY_BOOKED');
    }

    throw error;
  }
}

export async function deleteAppointmentByOwnerOrAdmin({ appointmentId, user }) {
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
      DELETE FROM appointments
      WHERE id = $1
    `,
    [appointmentId],
  );
}

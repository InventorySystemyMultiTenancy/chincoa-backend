import { pool, query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';
import { isPastSlotByBusinessTimezone } from '../utils/validators.js';

const DEFAULT_PRICE = 45;
const APPOINTMENT_DEBUG_LOGS = String(process.env.APPOINTMENT_DEBUG_LOGS || '').trim() === 'true';

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

function normalizeTime(value) {
  const raw = String(value);
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

function minutesToHourMinute(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getSlotDecision({ dateString, timeString, dayOverride, hour, existing }) {
  const time = normalizeTime(timeString);
  const timeContext = isPastSlotByBusinessTimezone(dateString, time);

  if (timeContext.isPast) {
    return {
      status: 'desabilitado',
      reason: 'Horario passado no dia atual',
      code: 'PAST_APPOINTMENT',
      timeContext,
    };
  }

  if (dayOverride && !dayOverride.is_enabled) {
    return {
      status: 'desabilitado',
      reason: dayOverride.reason || 'Dia desabilitado',
      code: 'DAY_DISABLED',
      timeContext,
    };
  }

  if (!hour || !hour.is_enabled) {
    return {
      status: 'desabilitado',
      reason: 'Horario desabilitado',
      code: 'SLOT_DISABLED',
      timeContext,
    };
  }

  if (!existing) {
    return {
      status: 'disponivel',
      reason: null,
      code: null,
      timeContext,
    };
  }

  return {
    status: existing.status,
    reason: null,
    code: 'SLOT_ALREADY_BOOKED',
    timeContext,
  };
}

function maybeDebugLog(event, payload) {
  if (!APPOINTMENT_DEBUG_LOGS) {
    return;
  }

  console.log(`[appointments:${event}]`, JSON.stringify(payload));
}

async function assertSlotEnabledForBookingWithClient(client, dateString, timeString) {
  const normalizedTime = normalizeTime(timeString);

  const dayOverrideResult = await client.query(
    `
      SELECT id, date, is_enabled, reason
      FROM business_days
      WHERE date = $1
      LIMIT 1
    `,
    [dateString],
  );

  const dayOverride = dayOverrideResult.rowCount > 0 ? dayOverrideResult.rows[0] : null;

  const weekday = getWeekdayFromDate(dateString);

  const hourResult = await client.query(
    `
      SELECT id, weekday, slot_time, is_enabled
      FROM business_hours
      WHERE weekday = $1 AND slot_time = $2
      LIMIT 1
      FOR SHARE
    `,
    [weekday, normalizedTime],
  );

  const hour = hourResult.rowCount > 0 ? hourResult.rows[0] : null;

  const existingResult = await client.query(
    `
      SELECT id, user_id, appointment_date, appointment_time, status, price
      FROM appointments
      WHERE appointment_date = $1 AND appointment_time = $2 AND status IN ('agendado', 'pago')
      LIMIT 1
      FOR UPDATE
    `,
    [dateString, normalizedTime],
  );

  const existing = existingResult.rowCount > 0 ? existingResult.rows[0] : null;

  const decision = getSlotDecision({
    dateString,
    timeString: normalizedTime,
    dayOverride,
    hour,
    existing,
  });

  maybeDebugLog('post-check', {
    date: dateString,
    time: normalizedTime,
    decision,
  });

  if (decision.status === 'disponivel') {
    return;
  }

  if (decision.code === 'SLOT_ALREADY_BOOKED') {
    throw new AppError('Horario ja reservado', 409, 'SLOT_ALREADY_BOOKED');
  }

  if (decision.code === 'DAY_DISABLED') {
    throw new AppError('Dia desabilitado para atendimento', 400, 'DAY_DISABLED', {
      date: dateString,
      reason: decision.reason,
    });
  }

  if (decision.code === 'SLOT_DISABLED') {
    throw new AppError('Horario desabilitado para este dia', 400, 'SLOT_DISABLED');
  }

  if (decision.code === 'PAST_APPOINTMENT') {
    throw new AppError('Nao e permitido agendar horario passado no dia atual', 400, 'PAST_APPOINTMENT', {
      timezone: decision.timeContext.timezone,
      server_now_date: decision.timeContext.currentDate,
    });
  }

  throw new AppError('Falha de validacao de slot', 400, 'VALIDATION_ERROR');
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
  const nowContext = isPastSlotByBusinessTimezone(appointmentDate, '00:00');

  const [dayOverride, hours, booked] = await Promise.all([
    getDayOverride(appointmentDate),
    getHoursByWeekday(weekday),
    getBookedAppointmentsByDate(appointmentDate),
  ]);

  const bookedByTime = new Map(
    booked.map((item) => [normalizeTime(item.appointment_time), item]),
  );

  const slots = hours.map((hour) => {
    const time = normalizeTime(hour.slot_time);
    const existing = bookedByTime.get(time);
    const decision = getSlotDecision({
      dateString: appointmentDate,
      timeString: time,
      dayOverride,
      hour,
      existing,
    });

    maybeDebugLog('get-slots-decision', {
      date: appointmentDate,
      time,
      status: decision.status,
      code: decision.code,
    });

    if (decision.status === 'desabilitado') {
      return {
        id: hour.id,
        appointment_id: null,
        user_id: null,
        appointment_date: appointmentDate,
        appointment_time: time,
        status: 'desabilitado',
        price: DEFAULT_PRICE,
        reason: decision.reason,
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

  return {
    slots,
    meta: {
      timezone: nowContext.timezone,
      server_now_date: nowContext.currentDate,
      server_now: `${nowContext.currentDate}T${minutesToHourMinute(nowContext.currentMinutes)}:00`,
    },
  };
}

export async function createAppointment({ userId, appointmentDate, appointmentTime }) {
  const normalizedTime = normalizeTime(appointmentTime);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await assertSlotEnabledForBookingWithClient(client, appointmentDate, normalizedTime);

    const result = await client.query(
      `
        INSERT INTO appointments (user_id, appointment_date, appointment_time, status, price)
        VALUES ($1, $2, $3, 'agendado', $4)
        RETURNING id, user_id, appointment_date, appointment_time, status, price, created_at, updated_at
      `,
      [userId, appointmentDate, normalizedTime, DEFAULT_PRICE],
    );

    await client.query('COMMIT');

    maybeDebugLog('post-success', {
      userId,
      date: appointmentDate,
      time: normalizedTime,
      appointmentId: result.rows[0].id,
    });

    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      throw new AppError('Horario ja reservado', 409, 'SLOT_ALREADY_BOOKED');
    }

    throw error;
  } finally {
    client.release();
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

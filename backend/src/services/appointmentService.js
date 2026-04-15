import { pool, query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';
import { isPastSlotByBusinessTimezone } from '../utils/validators.js';
import { getRollingWindowByBusinessTimezone, runRollingScheduleMaintenance } from './rollingScheduleMaintenanceService.js';
import { assertValidServiceType, getServiceLabel, getServicePrice } from '../utils/serviceCatalog.js';

const DEFAULT_PRICE = getServicePrice('corte') || 50;
const APPOINTMENT_DEBUG_LOGS = String(process.env.APPOINTMENT_DEBUG_LOGS || '').trim() === 'true';

function getWeekdayFromDate(dateString) {
  if (dateString instanceof Date && !Number.isNaN(dateString.getTime())) {
    return dateString.getDay();
  }

  const text = String(dateString || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (!Number.isNaN(date.getTime())) {
      return date.getDay();
    }
  }

  const fallbackDate = new Date(text);
  if (!Number.isNaN(fallbackDate.getTime())) {
    return fallbackDate.getDay();
  }

  throw new AppError('Data invalida para calcular dia da semana', 500, 'INVALID_APPOINTMENT_DATE', {
    appointment_date: dateString,
  });
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

async function getHoursByWeekday(weekday, barberId) {
  const result = await query(
    `
      SELECT id, weekday, slot_time, is_booked_week
      FROM business_hours
      WHERE weekday = $1 AND barber_id = $2
      ORDER BY slot_time ASC
    `,
    [weekday, barberId],
  );

  return result.rows;
}

async function getDayHourOverrides(dateString) {
  const result = await query(
    `
      SELECT id, date, slot_time, is_enabled, reason
      FROM business_day_hour_overrides
      WHERE date = $1
      ORDER BY slot_time ASC
    `,
    [dateString],
  );

  return result.rows;
}

async function assertActiveBarberExists(barberId) {
  const result = await query(
    `
      SELECT id, full_name, image_url
      FROM barbers
      WHERE id = $1 AND is_active = true
      LIMIT 1
    `,
    [barberId],
  );

  if (result.rowCount === 0) {
    throw new AppError('Barbeiro nao encontrado ou inativo', 404, 'BARBER_NOT_FOUND');
  }

  return result.rows[0];
}

async function getBookedAppointmentsByDate(dateString, barberId) {
  const result = await query(
    `
      SELECT id, user_id, barber_id, appointment_date, appointment_time, service_type, status, price, created_at, updated_at
      FROM appointments
      WHERE appointment_date = $1 AND barber_id = $2 AND status IN ('agendado', 'pago')
    `,
    [dateString, barberId],
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

function getSlotDecision({ dateString, timeString, dayOverride, dayHourOverride, hour, existing }) {
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

  if (dayHourOverride && !dayHourOverride.is_enabled) {
    return {
      status: 'desabilitado',
      reason: dayHourOverride.reason || 'Horario desabilitado pelo admin para este dia',
      code: 'DAY_HOUR_DISABLED',
      timeContext,
    };
  }

  const hasManualEnableOverride = Boolean(dayHourOverride && dayHourOverride.is_enabled);

  if (!hour && !hasManualEnableOverride) {
    return {
      status: 'desabilitado',
      reason: 'Horario nao cadastrado para este dia da semana',
      code: 'SLOT_DISABLED',
      timeContext,
    };
  }

  if (hour && hour.is_booked_week) {
    return {
      status: existing?.status || 'agendado',
      reason: 'Horario ja agendado nesta semana',
      code: 'SLOT_ALREADY_BOOKED',
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

function serializeAppointment(row) {
  return {
    ...row,
    appointment_time: normalizeTime(row.appointment_time),
    service_type: row.service_type,
    service_label: getServiceLabel(row.service_type),
    price: Number(row.price),
    barber: row.barber_id
      ? {
          id: row.barber_id,
          full_name: row.barber_name || null,
          image_url: row.barber_image_url || null,
        }
      : null,
  };
}

function isBirthdayMatchForDate(birthDate, dateString) {
  if (!birthDate || !dateString) {
    return false;
  }

  return String(birthDate).slice(5, 10) === String(dateString).slice(5, 10);
}

async function resolveAppointmentPricing({ client, userId, appointmentDate, serviceType }) {
  const basePrice = getServicePrice(serviceType);

  if (basePrice === null) {
    throw new AppError('Tabela de preco nao encontrada para o servico', 500, 'SERVICE_PRICE_NOT_CONFIGURED', {
      service_type: serviceType,
    });
  }

  if (serviceType !== 'corte') {
    return {
      finalPrice: basePrice,
      discount: null,
    };
  }

  const userResult = await client.query(
    `
      SELECT birth_date
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  const birthDate = userResult.rowCount > 0 ? userResult.rows[0].birth_date : null;
  const hasBirthdayDiscount = isBirthdayMatchForDate(birthDate, appointmentDate);

  if (!hasBirthdayDiscount) {
    return {
      finalPrice: basePrice,
      discount: null,
    };
  }

  const discounted = Number((basePrice * 0.5).toFixed(2));

  return {
    finalPrice: discounted,
    discount: {
      applied: true,
      type: 'birthday',
      service_type: 'corte',
      base_price: basePrice,
      discount_percent: 50,
      final_price: discounted,
      message: 'Parabens! Voce recebeu 50% de desconto no corte.',
    },
  };
}

async function assertSlotEnabledForBookingWithClient(client, dateString, timeString, userId, barberId) {
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

  const window = getRollingWindowByBusinessTimezone();

  if (dateString < window.bookingStartDate || dateString > window.bookingEndDate) {
    throw new AppError(
      `Agendamentos permitidos somente de ${window.bookingStartDate} ate ${window.bookingEndDate}`,
      400,
      'VALIDATION_ERROR',
    );
  }

  const weekday = getWeekdayFromDate(dateString);

  const hourResult = await client.query(
    `
      SELECT id, weekday, slot_time, is_booked_week
      FROM business_hours
      WHERE weekday = $1 AND slot_time = $2 AND barber_id = $3
      LIMIT 1
      FOR UPDATE
    `,
    [weekday, normalizedTime, barberId],
  );

  const hour = hourResult.rowCount > 0 ? hourResult.rows[0] : null;

  const dayHourOverrideResult = await client.query(
    `
      SELECT id, date, slot_time, is_enabled, reason
      FROM business_day_hour_overrides
      WHERE date = $1 AND slot_time = $2
      LIMIT 1
      FOR UPDATE
    `,
    [dateString, normalizedTime],
  );

  const dayHourOverride = dayHourOverrideResult.rowCount > 0 ? dayHourOverrideResult.rows[0] : null;

  const existingResult = await client.query(
    `
      SELECT id, user_id, barber_id, appointment_date, appointment_time, service_type, status, price
      FROM appointments
      WHERE appointment_date = $1 AND appointment_time = $2 AND barber_id = $3 AND status IN ('agendado', 'pago')
      LIMIT 1
      FOR UPDATE
    `,
    [dateString, normalizedTime, barberId],
  );

  const existing = existingResult.rowCount > 0 ? existingResult.rows[0] : null;

  const decision = getSlotDecision({
    dateString,
    timeString: normalizedTime,
    dayOverride,
    dayHourOverride,
    hour,
    existing,
  });

  maybeDebugLog('post-check', {
    date: dateString,
    time: normalizedTime,
    decision,
    dayOverride,
    hour,
    existing,
  });

  if (decision.status === 'disponivel') {
    return { shouldInsert: true };
  }

  if (decision.code === 'SLOT_ALREADY_BOOKED') {
    if (existing && existing.user_id === userId) {
      return {
        shouldInsert: false,
        existingAppointment: serializeAppointment(existing),
      };
    }

    throw new AppError('Horario ja reservado', 409, 'SLOT_ALREADY_BOOKED', {
      date: dateString,
      time: normalizedTime,
      byWeeklyFlag: Boolean(hour?.is_booked_week),
      barber_id: barberId,
      existingAppointmentId: existing?.id || null,
      existingStatus: existing?.status || null,
      existingServiceType: existing?.service_type || null,
    });
  }

  if (decision.code === 'DAY_DISABLED') {
    throw new AppError('Dia desabilitado para atendimento', 400, 'DAY_DISABLED', {
      date: dateString,
      reason: decision.reason,
    });
  }

  if (decision.code === 'DAY_HOUR_DISABLED') {
    throw new AppError('Horario desabilitado manualmente para este dia', 400, 'DAY_HOUR_DISABLED', {
      date: dateString,
      time: normalizedTime,
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
      SELECT
        a.id,
        a.user_id,
        a.barber_id,
        b.full_name AS barber_name,
        b.image_url AS barber_image_url,
        a.appointment_date,
        a.appointment_time,
        a.service_type,
        a.status,
        a.price,
        a.created_at,
        a.updated_at
      FROM appointments a
      LEFT JOIN barbers b ON b.id = a.barber_id
      WHERE user_id = $1 AND status IN ('agendado', 'pago')
      ORDER BY appointment_date DESC, appointment_time DESC
    `,
    [userId],
  );

  return result.rows.map(serializeAppointment);
}

export async function listSlotsByDate(appointmentDate, barberId) {
  await runRollingScheduleMaintenance();
  const barber = await assertActiveBarberExists(barberId);

  const weekday = getWeekdayFromDate(appointmentDate);
  const nowContext = isPastSlotByBusinessTimezone(appointmentDate, '00:00');
  const window = getRollingWindowByBusinessTimezone();

  if (appointmentDate < window.bookingStartDate || appointmentDate > window.bookingEndDate) {
    return {
      slots: [],
      meta: {
        timezone: nowContext.timezone,
        server_now_date: nowContext.currentDate,
        server_now: `${nowContext.currentDate}T${minutesToHourMinute(nowContext.currentMinutes)}:00`,
        booking_window_start: window.bookingStartDate,
        booking_window_end: window.bookingEndDate,
        retention_start: window.retentionStartDate,
      },
    };
  }

  const [dayOverride, hours, dayHourOverrides, booked] = await Promise.all([
    getDayOverride(appointmentDate),
    getHoursByWeekday(weekday, barberId),
    getDayHourOverrides(appointmentDate),
    getBookedAppointmentsByDate(appointmentDate, barberId),
  ]);

  const dayOverrideByTime = new Map(
    dayHourOverrides.map((item) => [normalizeTime(item.slot_time), item]),
  );

  const mergedHoursByTime = new Map(
    hours.map((hour) => [normalizeTime(hour.slot_time), hour]),
  );

  for (const override of dayHourOverrides) {
    const time = normalizeTime(override.slot_time);

    if (!mergedHoursByTime.has(time)) {
      mergedHoursByTime.set(time, {
        id: null,
        weekday,
        slot_time: time,
        is_booked_week: false,
      });
    }
  }

  const mergedHours = Array.from(mergedHoursByTime.values()).sort((a, b) =>
    normalizeTime(a.slot_time).localeCompare(normalizeTime(b.slot_time)),
  );

  const bookedByTime = new Map(
    booked.map((item) => [normalizeTime(item.appointment_time), item]),
  );

  const slots = mergedHours.map((hour) => {
    const time = normalizeTime(hour.slot_time);
    const existing = bookedByTime.get(time);
    const dayHourOverride = dayOverrideByTime.get(time) || null;
    const decision = getSlotDecision({
      dateString: appointmentDate,
      timeString: time,
      dayOverride,
      dayHourOverride,
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
        day_hour_override_id: dayHourOverride?.id || null,
        appointment_id: null,
        user_id: null,
        barber_id: barber.id,
        appointment_date: appointmentDate,
        appointment_time: time,
        status: 'desabilitado',
        price: DEFAULT_PRICE,
        reason: decision.reason,
      };
    }

    if (decision.status === 'disponivel') {
      return {
        id: hour.id,
        day_hour_override_id: dayHourOverride?.id || null,
        appointment_id: null,
        user_id: null,
        barber_id: barber.id,
        appointment_date: appointmentDate,
        appointment_time: time,
        status: 'disponivel',
        price: DEFAULT_PRICE,
        reason: null,
      };
    }

    return {
      id: hour.id,
      day_hour_override_id: dayHourOverride?.id || null,
      appointment_id: existing?.id || null,
      user_id: existing?.user_id || null,
      barber_id: existing?.barber_id || barber.id,
      appointment_date: existing?.appointment_date || appointmentDate,
      appointment_time: normalizeTime(existing?.appointment_time || time),
      service_type: existing?.service_type || null,
      service_label: existing?.service_type ? getServiceLabel(existing.service_type) : null,
      status: existing?.status || 'agendado',
      price: Number(existing?.price || DEFAULT_PRICE),
      reason: existing ? null : 'Horario ja reservado',
    };
  });

  return {
    slots,
    meta: {
      timezone: nowContext.timezone,
      server_now_date: nowContext.currentDate,
      server_now: `${nowContext.currentDate}T${minutesToHourMinute(nowContext.currentMinutes)}:00`,
      booking_window_start: window.bookingStartDate,
      booking_window_end: window.bookingEndDate,
      retention_start: window.retentionStartDate,
      barber: {
        id: barber.id,
        full_name: barber.full_name,
        image_url: barber.image_url,
      },
    },
  };
}

export async function createAppointment({ userId, appointmentDate, appointmentTime, serviceType, barberId, paymentMethod }) {
  await runRollingScheduleMaintenance();
  await assertActiveBarberExists(barberId);

  const normalizedTime = normalizeTime(appointmentTime);
  const normalizedServiceType = assertValidServiceType(serviceType);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `appointment_slot:${appointmentDate}:${normalizedTime}:${barberId}`,
    ]);

    const bookingValidation = await assertSlotEnabledForBookingWithClient(
      client,
      appointmentDate,
      normalizedTime,
      userId,
      barberId,
    );

    const pricing = await resolveAppointmentPricing({
      client,
      userId,
      appointmentDate,
      serviceType: normalizedServiceType,
    });

    if (!bookingValidation.shouldInsert) {
      await client.query('COMMIT');

      maybeDebugLog('post-idempotent-hit', {
        userId,
        date: appointmentDate,
        time: normalizedTime,
        barberId,
        appointmentId: bookingValidation.existingAppointment.id,
      });

      return bookingValidation.existingAppointment;
    }

    const normalizedPaymentMethod = String(paymentMethod || 'manual').trim().toLowerCase();

    let legacyReusableSlot;

    try {
      legacyReusableSlot = await client.query(
        `
          UPDATE appointments
          SET user_id = $1,
              service_type = $4,
              status = 'agendado',
              price = $5,
              barber_id = $6,
              payment_method = $7,
              updated_at = NOW()
          WHERE appointment_date = $2
            AND appointment_time = $3
            AND (barber_id = $6 OR barber_id IS NULL)
            AND status = 'disponivel'
            AND user_id IS NULL
          RETURNING id, user_id, barber_id, appointment_date, appointment_time, service_type, status, price, created_at, updated_at
        `,
        [userId, appointmentDate, normalizedTime, normalizedServiceType, pricing.finalPrice, barberId, normalizedPaymentMethod],
      );
    } catch (error) {
      if (error.code !== '42703') {
        throw error;
      }

      legacyReusableSlot = await client.query(
        `
          UPDATE appointments
          SET user_id = $1,
              service_type = $4,
              status = 'agendado',
              price = $5,
              barber_id = $6,
              updated_at = NOW()
          WHERE appointment_date = $2
            AND appointment_time = $3
            AND (barber_id = $6 OR barber_id IS NULL)
            AND status = 'disponivel'
            AND user_id IS NULL
          RETURNING id, user_id, barber_id, appointment_date, appointment_time, service_type, status, price, created_at, updated_at
        `,
        [userId, appointmentDate, normalizedTime, normalizedServiceType, pricing.finalPrice, barberId],
      );
    }

    if (legacyReusableSlot.rowCount > 0) {
      await client.query(
        `
          UPDATE business_hours
          SET is_booked_week = true
          WHERE barber_id = $1 AND weekday = $2 AND slot_time = $3
        `,
        [barberId, getWeekdayFromDate(appointmentDate), normalizedTime],
      );

      await client.query('COMMIT');

      maybeDebugLog('post-legacy-slot-reused', {
        userId,
        date: appointmentDate,
        time: normalizedTime,
        barberId,
        appointmentId: legacyReusableSlot.rows[0].id,
      });

      return {
        ...serializeAppointment(legacyReusableSlot.rows[0]),
        discount: pricing.discount,
      };
    }

    let result;

    try {
      result = await client.query(
        `
          INSERT INTO appointments (
            user_id,
            barber_id,
            appointment_date,
            appointment_time,
            service_type,
            status,
            price,
            payment_method
          )
          VALUES ($1, $2, $3, $4, $5, 'agendado', $6, $7)
          RETURNING id, user_id, barber_id, appointment_date, appointment_time, service_type, status, price, created_at, updated_at
        `,
        [userId, barberId, appointmentDate, normalizedTime, normalizedServiceType, pricing.finalPrice, normalizedPaymentMethod],
      );
    } catch (error) {
      if (error.code !== '42703') {
        throw error;
      }

      result = await client.query(
        `
          INSERT INTO appointments (user_id, barber_id, appointment_date, appointment_time, service_type, status, price)
          VALUES ($1, $2, $3, $4, $5, 'agendado', $6)
          RETURNING id, user_id, barber_id, appointment_date, appointment_time, service_type, status, price, created_at, updated_at
        `,
        [userId, barberId, appointmentDate, normalizedTime, normalizedServiceType, pricing.finalPrice],
      );
    }

    await client.query(
      `
        UPDATE business_hours
        SET is_booked_week = true
        WHERE barber_id = $1 AND weekday = $2 AND slot_time = $3
      `,
      [barberId, getWeekdayFromDate(appointmentDate), normalizedTime],
    );

    await client.query('COMMIT');

    maybeDebugLog('post-success', {
      userId,
      date: appointmentDate,
      time: normalizedTime,
      barberId,
      appointmentId: result.rows[0].id,
    });

    return {
      ...serializeAppointment(result.rows[0]),
      discount: pricing.discount,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      const existingAfterConflict = await query(
        `
          SELECT id, user_id, appointment_date, appointment_time, service_type, status, price, created_at, updated_at
          FROM appointments
          WHERE appointment_date = $1 AND appointment_time = $2 AND barber_id = $3 AND status IN ('agendado', 'pago')
          LIMIT 1
        `,
        [appointmentDate, normalizedTime, barberId],
      );

      if (existingAfterConflict.rowCount > 0) {
        const conflictRow = existingAfterConflict.rows[0];

        maybeDebugLog('post-conflict-db-analyze', {
          userId,
          date: appointmentDate,
          time: normalizedTime,
          barberId,
          conflictAppointmentId: conflictRow.id,
          conflictUserId: conflictRow.user_id,
          conflictStatus: conflictRow.status,
        });

        if (conflictRow.user_id === userId) {
          return serializeAppointment(conflictRow);
        }

        throw new AppError('Horario ja reservado', 409, 'SLOT_ALREADY_BOOKED', {
          date: appointmentDate,
          time: normalizedTime,
          barber_id: barberId,
          source: 'db_unique_index',
          conflictAppointmentId: conflictRow.id,
          conflictStatus: conflictRow.status,
        });
      }

      maybeDebugLog('post-conflict-db', {
        userId,
        date: appointmentDate,
        time: normalizedTime,
        barberId,
        postgresCode: error.code,
        detail: error.detail,
      });

      throw new AppError('Horario ja reservado', 409, 'SLOT_ALREADY_BOOKED', {
        date: appointmentDate,
        time: normalizedTime,
        barber_id: barberId,
        source: 'db_unique_index',
      });
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAppointmentByOwnerOrAdmin({ appointmentId, user }) {
  const result = await query(
    `
      SELECT id, user_id, barber_id, status, appointment_date, appointment_time
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

  if (appointment.barber_id) {
    await query(
      `
        UPDATE business_hours
        SET is_booked_week = false
        WHERE barber_id = $1 AND weekday = $2 AND slot_time = $3
      `,
      [appointment.barber_id, getWeekdayFromDate(appointment.appointment_date), normalizeTime(appointment.appointment_time)],
    );
  }

  await query(
    `
      DELETE FROM appointments
      WHERE id = $1
    `,
    [appointmentId],
  );
}

import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';
import { getServiceLabel } from '../utils/serviceCatalog.js';

function normalizeTime(value) {
  return String(value).slice(0, 5);
}

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
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN barbers b ON b.id = a.barber_id
      ${whereClause}
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    appointment_time: normalizeTime(row.appointment_time),
    service_label: getServiceLabel(row.service_type),
    price: Number(row.price),
    barber: row.barber_id
      ? {
          id: row.barber_id,
          full_name: row.barber_name || null,
          image_url: row.barber_image_url || null,
        }
      : null,
  }));
}

export async function updateAppointmentStatus({ appointmentId, status }) {
  const current = await query(
    `
      SELECT id, user_id, barber_id, appointment_date, appointment_time, status, price, created_at
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

  if (status === 'disponivel') {
    if (slot.barber_id) {
      await query(
        `
          UPDATE business_hours
          SET is_booked_week = false
          WHERE barber_id = $1 AND weekday = $2 AND slot_time = $3
        `,
        [slot.barber_id, getWeekdayFromDate(slot.appointment_date), normalizeTime(slot.appointment_time)],
      );
    }

    await query(
      `
        DELETE FROM appointments
        WHERE id = $1
      `,
      [appointmentId],
    );

    return {
      ...slot,
      user_id: null,
      status: 'disponivel',
      updated_at: new Date().toISOString(),
    };
  }

  let result;

  try {
    result = await query(
      `
        UPDATE appointments
        SET
          status = $2,
          service_type = CASE
            WHEN service_type IN (
              'corte',
              'barboterapia',
              'corte_barba',
              'sobrancelha',
              'raspado',
              'pezinho',
              'penteado',
              'limpeza_pele',
              'hidratacao',
              'botox',
              'progressiva',
              'relaxamento',
              'luzes',
              'platinado',
              'coloracao'
            ) THEN service_type
            ELSE 'corte'
          END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, user_id, appointment_date, appointment_time, service_type, status, price, created_at, updated_at
      `,
      [appointmentId, status],
    );
  } catch (error) {
    if (error.code === '42703') {
      const fallback = await query(
        `
          UPDATE appointments
          SET status = $2
          WHERE id = $1
          RETURNING id, user_id, appointment_date, appointment_time, status, price, created_at
        `,
        [appointmentId, status],
      );

      if (fallback.rowCount === 0) {
        throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
      }

      return {
        ...fallback.rows[0],
        appointment_time: normalizeTime(fallback.rows[0].appointment_time),
        service_type: 'corte',
        service_label: getServiceLabel('corte'),
        price: Number(fallback.rows[0].price),
        updated_at: new Date().toISOString(),
      };
    }

    if (error.code === '23514' && String(error.constraint || '').includes('appointments_service_type_check')) {
      throw new AppError('Tipo de servico invalido no agendamento. Atualize o servico antes de alterar status.', 400, 'INVALID_SERVICE_TYPE', {
        appointmentId,
      });
    }

    if (error.code === '23514' && String(error.constraint || '').includes('appointment_user_status_consistency')) {
      throw new AppError('Nao e possivel marcar status sem cliente reservado', 400, 'SLOT_WITHOUT_USER');
    }

    throw error;
  }

  if (result.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }

  if (slot.barber_id) {
    await query(
      `
        UPDATE business_hours
        SET is_booked_week = true
        WHERE barber_id = $1 AND weekday = $2 AND slot_time = $3
      `,
      [slot.barber_id, getWeekdayFromDate(slot.appointment_date), normalizeTime(slot.appointment_time)],
    );
  }

  return {
    ...result.rows[0],
    appointment_time: normalizeTime(result.rows[0].appointment_time),
    service_label: getServiceLabel(result.rows[0].service_type),
    price: Number(result.rows[0].price),
  };
}

export async function deleteAppointmentAsAdmin(appointmentId) {
  const current = await query(
    `
      SELECT id, barber_id, appointment_date, appointment_time
      FROM appointments
      WHERE id = $1
    `,
    [appointmentId],
  );

  if (current.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }

  const appointment = current.rows[0];

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

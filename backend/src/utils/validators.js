import { AppError } from './appError.js';
import { assertValidServiceType } from './serviceCatalog.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PHONE_DIGITS_REGEX = /^\d{10,15}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_BUSINESS_TIMEZONE = 'America/Sao_Paulo';

export function getNowByBusinessTimezone() {
  const timezone = process.env.BUSINESS_TIMEZONE || DEFAULT_BUSINESS_TIMEZONE;

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return {
      currentDate: `${values.year}-${values.month}-${values.day}`,
      currentMinutes: Number(values.hour) * 60 + Number(values.minute),
      timezone,
    };
  } catch (_error) {
    const now = new Date();
    return {
      currentDate: now.toISOString().slice(0, 10),
      currentMinutes: now.getHours() * 60 + now.getMinutes(),
      timezone: 'server-localtime',
    };
  }
}

export function isPastSlotByBusinessTimezone(dateString, timeString) {
  const { currentDate, currentMinutes, timezone } = getNowByBusinessTimezone();

  if (dateString !== currentDate) {
    return {
      isPast: false,
      currentDate,
      currentMinutes,
      timezone,
    };
  }

  const [hours, minutes] = timeString.split(':').map(Number);
  const requestedMinutes = hours * 60 + minutes;

  return {
    isPast: requestedMinutes <= currentMinutes,
    currentDate,
    currentMinutes,
    timezone,
  };
}

export function getCurrentWeekRangeByBusinessTimezone() {
  const { currentDate, timezone } = getNowByBusinessTimezone();
  const current = new Date(`${currentDate}T00:00:00`);
  const day = current.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(current);
  monday.setDate(monday.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const toDateOnly = (value) => value.toISOString().slice(0, 10);

  return {
    weekStart: toDateOnly(monday),
    weekEnd: toDateOnly(sunday),
    timezone,
    currentDate,
  };
}

export function requireFields(payload, fields) {
  const missing = fields.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length > 0) {
    throw new AppError('Campos obrigatorios ausentes', 400, 'VALIDATION_ERROR', {
      missing,
    });
  }
}

export function validateEmail(email) {
  if (!EMAIL_REGEX.test(String(email || '').trim())) {
    throw new AppError('Email invalido', 400, 'VALIDATION_ERROR');
  }
}

export function validatePassword(password) {
  if (String(password || '').length < 6) {
    throw new AppError('Senha deve ter no minimo 6 caracteres', 400, 'VALIDATION_ERROR');
  }
}

export function validatePhone(phone) {
  const normalized = String(phone || '').replace(/\D/g, '');

  if (!PHONE_DIGITS_REGEX.test(normalized)) {
    throw new AppError('Telefone invalido. Use entre 10 e 15 digitos', 400, 'VALIDATION_ERROR');
  }
}

export function validateDate(date) {
  if (!DATE_REGEX.test(String(date || '').trim())) {
    throw new AppError('Data invalida. Use YYYY-MM-DD', 400, 'VALIDATION_ERROR');
  }
}

export function validateTime(time) {
  if (!TIME_REGEX.test(String(time || '').trim())) {
    throw new AppError('Horario invalido. Use HH:mm', 400, 'VALIDATION_ERROR');
  }
}

export function validateWeekday(weekday) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new AppError('weekday invalido. Use intervalo 0-6 (0=domingo)', 400, 'VALIDATION_ERROR');
  }
}

export function validateRole(role) {
  if (!['admin', 'client'].includes(role)) {
    throw new AppError('Role invalida', 400, 'VALIDATION_ERROR');
  }
}

export function validateUuid(value, fieldName = 'id') {
  if (!UUID_REGEX.test(String(value || '').trim())) {
    throw new AppError(`${fieldName} invalido`, 400, 'VALIDATION_ERROR');
  }
}

export function validateAppointmentStatus(status) {
  if (!['agendado', 'pago', 'disponivel'].includes(status)) {
    throw new AppError('Status invalido', 400, 'VALIDATION_ERROR');
  }
}

export function validateAppointmentPaymentMethod(paymentMethod) {
  if (!['manual', 'pix', 'point_card', 'assinante_premium'].includes(paymentMethod)) {
    throw new AppError('payment_method invalido', 422, 'VALIDATION_ERROR');
  }
}

export function validateServiceType(serviceType) {
  assertValidServiceType(serviceType);
}

export function ensureFutureSlot(dateString, timeString) {
  const context = isPastSlotByBusinessTimezone(dateString, timeString);

  if (context.isPast) {
    throw new AppError('Nao e permitido agendar horario passado no dia atual', 400, 'PAST_APPOINTMENT');
  }
}

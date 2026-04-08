import { AppError } from './appError.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

export function validateRole(role) {
  if (!['admin', 'client'].includes(role)) {
    throw new AppError('Role invalida', 400, 'VALIDATION_ERROR');
  }
}

export function validateAppointmentStatus(status) {
  if (!['agendado', 'pago', 'disponivel'].includes(status)) {
    throw new AppError('Status invalido', 400, 'VALIDATION_ERROR');
  }
}

export function ensureFutureSlot(dateString, timeString) {
  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);

  if (dateString !== currentDate) {
    return;
  }

  const [hours, minutes] = timeString.split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const requestedMinutes = hours * 60 + minutes;

  if (requestedMinutes <= currentMinutes) {
    throw new AppError('Nao e permitido agendar horario passado no dia atual', 400, 'PAST_APPOINTMENT');
  }
}

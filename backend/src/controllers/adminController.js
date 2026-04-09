import {
  deleteAppointmentAsAdmin,
  listAppointmentsByDate,
  updateAppointmentStatus,
} from '../services/adminService.js';
import {
  createBusinessDay,
  createBusinessHour,
  deleteBusinessDay,
  deleteBusinessHour,
  listBusinessDays,
  listBusinessHours,
  updateBusinessDay,
  updateBusinessHour,
} from '../services/scheduleAdminService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  requireFields,
  validateAppointmentStatus,
  validateDate,
  validateTime,
  validateWeekday,
} from '../utils/validators.js';

export async function listAppointments(req, res, next) {
  try {
    const date = req.query.date ? String(req.query.date).trim() : null;

    if (date) {
      validateDate(date);
    }

    const appointments = await listAppointmentsByDate(date);
    return sendSuccess(res, 200, { appointments });
  } catch (error) {
    return next(error);
  }
}

export async function patchAppointmentStatus(req, res, next) {
  try {
    requireFields(req.body, ['status']);
    const status = String(req.body.status).trim();
    validateAppointmentStatus(status);

    const appointment = await updateAppointmentStatus({
      appointmentId: req.params.id,
      status,
    });

    return sendSuccess(res, 200, { appointment });
  } catch (error) {
    return next(error);
  }
}

export async function removeAppointment(req, res, next) {
  try {
    await deleteAppointmentAsAdmin(req.params.id);

    return sendSuccess(res, 200, {
      message: 'Agendamento excluido com sucesso',
    });
  } catch (error) {
    return next(error);
  }
}

export async function getScheduleHours(req, res, next) {
  try {
    const weekdayRaw = req.query.weekday;
    let weekday = null;

    if (weekdayRaw !== undefined) {
      weekday = Number(weekdayRaw);
      validateWeekday(weekday);
    }

    const hours = await listBusinessHours(weekday);
    return sendSuccess(res, 200, { hours });
  } catch (error) {
    return next(error);
  }
}

export async function postScheduleHour(req, res, next) {
  try {
    requireFields(req.body, ['weekday', 'time']);

    const weekday = Number(req.body.weekday);
    const time = String(req.body.time).trim();

    validateWeekday(weekday);
    validateTime(time);

    const hour = await createBusinessHour({ weekday, time });
    return sendSuccess(res, 201, { hour });
  } catch (error) {
    return next(error);
  }
}

export async function patchScheduleHour(req, res, next) {
  try {
    const payload = {};

    if (req.body.weekday !== undefined) {
      payload.weekday = Number(req.body.weekday);
      validateWeekday(payload.weekday);
    }

    if (req.body.time !== undefined) {
      payload.time = String(req.body.time).trim();
      validateTime(payload.time);
    }

    const hour = await updateBusinessHour({
      id: req.params.id,
      ...payload,
    });

    return sendSuccess(res, 200, { hour });
  } catch (error) {
    return next(error);
  }
}

export async function removeScheduleHour(req, res, next) {
  try {
    await deleteBusinessHour(req.params.id);
    return sendSuccess(res, 200, { message: 'Horario removido com sucesso' });
  } catch (error) {
    return next(error);
  }
}

export async function getScheduleDays(req, res, next) {
  try {
    const from = req.query.from ? String(req.query.from).trim() : null;
    const to = req.query.to ? String(req.query.to).trim() : null;

    if (from) {
      validateDate(from);
    }

    if (to) {
      validateDate(to);
    }

    const days = await listBusinessDays({ from, to });
    return sendSuccess(res, 200, { days });
  } catch (error) {
    return next(error);
  }
}

export async function postScheduleDay(req, res, next) {
  try {
    requireFields(req.body, ['date', 'isEnabled']);

    const date = String(req.body.date).trim();
    const isEnabled = Boolean(req.body.isEnabled);
    const reason = req.body.reason ? String(req.body.reason).trim() : null;

    validateDate(date);

    const day = await createBusinessDay({ date, isEnabled, reason });
    return sendSuccess(res, 201, { day });
  } catch (error) {
    return next(error);
  }
}

export async function patchScheduleDay(req, res, next) {
  try {
    const payload = {};

    if (req.body.date !== undefined) {
      payload.date = String(req.body.date).trim();
      validateDate(payload.date);
    }

    if (req.body.isEnabled !== undefined) {
      payload.isEnabled = Boolean(req.body.isEnabled);
    }

    if (req.body.reason !== undefined) {
      payload.reason = req.body.reason ? String(req.body.reason).trim() : null;
    }

    const day = await updateBusinessDay({
      id: req.params.id,
      ...payload,
    });

    return sendSuccess(res, 200, { day });
  } catch (error) {
    return next(error);
  }
}

export async function removeScheduleDay(req, res, next) {
  try {
    await deleteBusinessDay(req.params.id);
    return sendSuccess(res, 200, { message: 'Dia removido com sucesso' });
  } catch (error) {
    return next(error);
  }
}

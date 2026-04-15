import {
  deleteAppointmentAsAdmin,
  listAppointmentsByDate,
  updateAppointmentStatus,
} from '../services/adminService.js';
import {
  createBusinessDay,
  createBusinessDayHour,
  createBusinessHour,
  deleteBusinessDay,
  deleteBusinessDayHour,
  deleteBusinessHour,
  listBusinessDays,
  listBusinessDayHours,
  listBusinessHours,
  updateBusinessDay,
  updateBusinessDayHour,
  updateBusinessHour,
} from '../services/scheduleAdminService.js';
import {
  createFixedExpense,
  createVariableExpense,
  getFinancialReport,
  listFixedExpenses,
  listVariableExpenses,
  updateFixedExpense,
  updateVariableExpense,
} from '../services/reportingService.js';
import { listAdminSubscribers } from '../services/paymentService.js';
import {
  createBarber,
  disableBarber,
  listAllBarbers,
  updateBarber,
} from '../services/barberService.js';
import { AppError } from '../utils/appError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  requireFields,
  validateAppointmentStatus,
  validateDate,
  validateTime,
  validateUuid,
  validateWeekday,
} from '../utils/validators.js';

export async function getAdminBarbers(_req, res, next) {
  try {
    const barbers = await listAllBarbers();
    return sendSuccess(res, 200, { barbers });
  } catch (error) {
    return next(error);
  }
}

export async function postAdminBarber(req, res, next) {
  try {
    requireFields(req.body, ['full_name']);

    const barber = await createBarber({
      fullName: req.body.full_name,
      imageUrl: req.body.image_url,
      isActive: req.body.is_active,
    });

    return sendSuccess(res, 201, { barber });
  } catch (error) {
    return next(error);
  }
}

export async function patchAdminBarber(req, res, next) {
  try {
    validateUuid(req.params.id, 'barber_id');

    const barber = await updateBarber({
      barberId: req.params.id,
      fullName: req.body.full_name,
      imageUrl: req.body.image_url,
      isActive: req.body.is_active,
    });

    return sendSuccess(res, 200, { barber });
  } catch (error) {
    return next(error);
  }
}

export async function deleteAdminBarber(req, res, next) {
  try {
    validateUuid(req.params.id, 'barber_id');

    const barber = await disableBarber(req.params.id);
    return sendSuccess(res, 200, { barber, message: 'Barbeiro inativado com sucesso' });
  } catch (error) {
    return next(error);
  }
}

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

export async function getScheduleDayHours(req, res, next) {
  try {
    const date = req.query.date ? String(req.query.date).trim() : null;
    const from = req.query.from ? String(req.query.from).trim() : null;
    const to = req.query.to ? String(req.query.to).trim() : null;

    if (date) {
      validateDate(date);
    }

    if (from) {
      validateDate(from);
    }

    if (to) {
      validateDate(to);
    }

    const dayHours = await listBusinessDayHours({ date, from, to });
    return sendSuccess(res, 200, { day_hours: dayHours });
  } catch (error) {
    return next(error);
  }
}

export async function postScheduleDayHour(req, res, next) {
  try {
    requireFields(req.body, ['date', 'time']);

    const date = String(req.body.date).trim();
    const time = String(req.body.time).trim();
    const isEnabled = req.body.isEnabled !== undefined ? Boolean(req.body.isEnabled) : true;
    const reason = req.body.reason ? String(req.body.reason).trim() : null;

    validateDate(date);
    validateTime(time);

    const dayHour = await createBusinessDayHour({ date, time, isEnabled, reason });
    return sendSuccess(res, 201, { day_hour: dayHour });
  } catch (error) {
    return next(error);
  }
}

export async function patchScheduleDayHour(req, res, next) {
  try {
    const payload = {};

    if (req.body.date !== undefined) {
      payload.date = String(req.body.date).trim();
      validateDate(payload.date);
    }

    if (req.body.time !== undefined) {
      payload.time = String(req.body.time).trim();
      validateTime(payload.time);
    }

    if (req.body.isEnabled !== undefined) {
      payload.isEnabled = Boolean(req.body.isEnabled);
    }

    if (req.body.reason !== undefined) {
      payload.reason = req.body.reason ? String(req.body.reason).trim() : null;
    }

    const dayHour = await updateBusinessDayHour({ id: req.params.id, ...payload });
    return sendSuccess(res, 200, { day_hour: dayHour });
  } catch (error) {
    return next(error);
  }
}

export async function removeScheduleDayHour(req, res, next) {
  try {
    await deleteBusinessDayHour(req.params.id);
    return sendSuccess(res, 200, { message: 'Horario do dia removido com sucesso' });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminSubscribers(req, res, next) {
  try {
    const data = await listAdminSubscribers({
      status: req.query.status,
      includeInactive: req.query.include_inactive,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    });

    return sendSuccess(res, 200, data);
  } catch (error) {
    return next(error);
  }
}

export async function getFinancialReportSummary(req, res, next) {
  try {
    const startDate = String(req.query.startDate || req.query.start_date || '').trim();
    const endDate = String(req.query.endDate || req.query.end_date || '').trim();

    requireFields(
      {
        start_date: startDate,
        end_date: endDate,
      },
      ['start_date', 'end_date'],
    );

    validateDate(startDate);
    validateDate(endDate);

    if (startDate > endDate) {
      throw new AppError('Data inicial nao pode ser maior que data final', 400, 'VALIDATION_ERROR');
    }

    const report = await getFinancialReport({ startDate, endDate });
    return sendSuccess(res, 200, { report });
  } catch (error) {
    return next(error);
  }
}

export async function getFixedExpenses(req, res, next) {
  try {
    const fixedExpenses = await listFixedExpenses();
    return sendSuccess(res, 200, { fixed_expenses: fixedExpenses });
  } catch (error) {
    return next(error);
  }
}

export async function postFixedExpense(req, res, next) {
  try {
    requireFields(req.body, ['title', 'amount', 'starts_on']);

    const startsOn = String(req.body.starts_on).trim();
    const endsOn = req.body.ends_on ? String(req.body.ends_on).trim() : null;

    validateDate(startsOn);

    if (endsOn) {
      validateDate(endsOn);
    }

    const fixedExpense = await createFixedExpense({
      title: req.body.title,
      amount: req.body.amount,
      startsOn,
      endsOn,
      isActive: req.body.is_active,
      notes: req.body.notes,
    });

    return sendSuccess(res, 201, { fixed_expense: fixedExpense });
  } catch (error) {
    return next(error);
  }
}

export async function patchFixedExpense(req, res, next) {
  try {
    validateUuid(req.params.id, 'fixed_expense_id');

    if (
      req.body.title === undefined
      && req.body.amount === undefined
      && req.body.starts_on === undefined
      && req.body.ends_on === undefined
      && req.body.is_active === undefined
      && req.body.notes === undefined
    ) {
      throw new AppError('Nenhum campo informado para atualizacao', 400, 'VALIDATION_ERROR');
    }

    if (req.body.starts_on !== undefined) {
      validateDate(String(req.body.starts_on).trim());
    }

    if (req.body.ends_on !== undefined && req.body.ends_on) {
      validateDate(String(req.body.ends_on).trim());
    }

    const fixedExpense = await updateFixedExpense({
      id: req.params.id,
      title: req.body.title,
      amount: req.body.amount,
      startsOn: req.body.starts_on,
      endsOn: req.body.ends_on,
      isActive: req.body.is_active,
      notes: req.body.notes,
    });

    return sendSuccess(res, 200, { fixed_expense: fixedExpense });
  } catch (error) {
    return next(error);
  }
}

export async function getVariableExpenses(req, res, next) {
  try {
    const startDate = req.query.startDate || req.query.start_date || null;
    const endDate = req.query.endDate || req.query.end_date || null;

    if (startDate) {
      validateDate(String(startDate).trim());
    }

    if (endDate) {
      validateDate(String(endDate).trim());
    }

    const variableExpenses = await listVariableExpenses({
      startDate: startDate ? String(startDate).trim() : null,
      endDate: endDate ? String(endDate).trim() : null,
    });

    return sendSuccess(res, 200, { variable_expenses: variableExpenses });
  } catch (error) {
    return next(error);
  }
}

export async function postVariableExpense(req, res, next) {
  try {
    requireFields(req.body, ['title', 'amount', 'expense_date']);

    const expenseDate = String(req.body.expense_date).trim();
    validateDate(expenseDate);

    const variableExpense = await createVariableExpense({
      title: req.body.title,
      amount: req.body.amount,
      expenseDate,
      notes: req.body.notes,
    });

    return sendSuccess(res, 201, { variable_expense: variableExpense });
  } catch (error) {
    return next(error);
  }
}

export async function patchVariableExpense(req, res, next) {
  try {
    validateUuid(req.params.id, 'variable_expense_id');

    if (
      req.body.title === undefined
      && req.body.amount === undefined
      && req.body.expense_date === undefined
      && req.body.notes === undefined
    ) {
      throw new AppError('Nenhum campo informado para atualizacao', 400, 'VALIDATION_ERROR');
    }

    if (req.body.expense_date !== undefined) {
      validateDate(String(req.body.expense_date).trim());
    }

    const variableExpense = await updateVariableExpense({
      id: req.params.id,
      title: req.body.title,
      amount: req.body.amount,
      expenseDate: req.body.expense_date,
      notes: req.body.notes,
    });

    return sendSuccess(res, 200, { variable_expense: variableExpense });
  } catch (error) {
    return next(error);
  }
}

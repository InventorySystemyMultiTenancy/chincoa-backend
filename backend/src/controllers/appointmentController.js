import {
  createAppointment,
  deleteAppointmentByOwnerOrAdmin,
  listSlotsByDate,
  listMyAppointments,
} from '../services/appointmentService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  requireFields,
  validateDate,
  validateServiceType,
  validateTime,
} from '../utils/validators.js';
import { SERVICE_CATALOG, normalizeServiceType } from '../utils/serviceCatalog.js';

export async function getMyAppointments(req, res, next) {
  try {
    const appointments = await listMyAppointments(req.user.id);
    return sendSuccess(res, 200, { appointments });
  } catch (error) {
    return next(error);
  }
}

export async function getSlotsByDate(req, res, next) {
  try {
    requireFields(req.query, ['date']);

    const date = String(req.query.date).trim();
    validateDate(date);

    const { slots, meta } = await listSlotsByDate(date);
    return sendSuccess(res, 200, { slots, meta });
  } catch (error) {
    return next(error);
  }
}

export async function createMyAppointment(req, res, next) {
  try {
    const appointmentDateRaw = req.body.appointment_date ?? req.body.appointmentDate;
    const appointmentTimeRaw = req.body.appointment_time ?? req.body.appointmentTime;
    const serviceTypeRaw = req.body.service_type ?? req.body.serviceType;

    if (!appointmentDateRaw || !appointmentTimeRaw || !serviceTypeRaw) {
      requireFields(
        {
          appointment_date: appointmentDateRaw,
          appointment_time: appointmentTimeRaw,
          service_type: serviceTypeRaw,
        },
        ['appointment_date', 'appointment_time', 'service_type'],
      );
    }

    const appointmentDate = String(appointmentDateRaw).trim();
    const appointmentTime = String(appointmentTimeRaw).trim();
    const serviceType = normalizeServiceType(serviceTypeRaw);

    validateDate(appointmentDate);
    validateTime(appointmentTime);
    validateServiceType(serviceType);

    const appointment = await createAppointment({
      userId: req.user.id,
      appointmentDate,
      appointmentTime,
      serviceType,
    });

    return sendSuccess(res, 201, { appointment });
  } catch (error) {
    return next(error);
  }
}

export async function getAppointmentServices(_req, res, next) {
  try {
    return sendSuccess(res, 200, { services: SERVICE_CATALOG });
  } catch (error) {
    return next(error);
  }
}

export async function deleteAppointment(req, res, next) {
  try {
    await deleteAppointmentByOwnerOrAdmin({
      appointmentId: req.params.id,
      user: req.user,
    });

    return sendSuccess(res, 200, {
      message: 'Agendamento cancelado com sucesso',
    });
  } catch (error) {
    return next(error);
  }
}

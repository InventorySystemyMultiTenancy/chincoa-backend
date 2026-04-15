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
  validateAppointmentPaymentMethod,
  validateServiceType,
  validateTime,
  validateUuid,
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
    requireFields(req.query, ['date', 'barber_id']);

    const date = String(req.query.date).trim();
    const barberId = String(req.query.barber_id).trim();
    validateDate(date);
    validateUuid(barberId, 'barber_id');

    const { slots, meta } = await listSlotsByDate(date, barberId);
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
    const barberIdRaw = req.body.barber_id ?? req.body.barberId;
    const paymentMethodRaw = req.body.payment_method ?? req.body.paymentMethod;

    if (!appointmentDateRaw || !appointmentTimeRaw || !serviceTypeRaw || !barberIdRaw) {
      requireFields(
        {
          appointment_date: appointmentDateRaw,
          appointment_time: appointmentTimeRaw,
          service_type: serviceTypeRaw,
          barber_id: barberIdRaw,
        },
        ['appointment_date', 'appointment_time', 'service_type', 'barber_id'],
      );
    }

    const appointmentDate = String(appointmentDateRaw).trim();
    const appointmentTime = String(appointmentTimeRaw).trim();
    const serviceType = normalizeServiceType(serviceTypeRaw);
    const barberId = String(barberIdRaw).trim();
    const paymentMethod = paymentMethodRaw ? String(paymentMethodRaw).trim() : null;

    validateDate(appointmentDate);
    validateTime(appointmentTime);
    validateServiceType(serviceType);
    validateUuid(barberId, 'barber_id');

    if (paymentMethod) {
      validateAppointmentPaymentMethod(paymentMethod);
    }

    const appointment = await createAppointment({
      userId: req.user.id,
      appointmentDate,
      appointmentTime,
      serviceType,
      barberId,
      paymentMethod,
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

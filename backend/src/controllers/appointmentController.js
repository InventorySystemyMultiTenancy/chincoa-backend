import {
  createAppointment,
  deleteAppointmentByOwnerOrAdmin,
  listMyAppointments,
} from '../services/appointmentService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  ensureFutureSlot,
  requireFields,
  validateDate,
  validateTime,
} from '../utils/validators.js';

export async function getMyAppointments(req, res, next) {
  try {
    const appointments = await listMyAppointments(req.user.id);
    return sendSuccess(res, 200, { appointments });
  } catch (error) {
    return next(error);
  }
}

export async function createMyAppointment(req, res, next) {
  try {
    requireFields(req.body, ['appointment_date', 'appointment_time']);

    const appointmentDate = String(req.body.appointment_date).trim();
    const appointmentTime = String(req.body.appointment_time).trim();

    validateDate(appointmentDate);
    validateTime(appointmentTime);
    ensureFutureSlot(appointmentDate, appointmentTime);

    const appointment = await createAppointment({
      userId: req.user.id,
      appointmentDate,
      appointmentTime,
    });

    return sendSuccess(res, 201, { appointment });
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

import {
  deleteAppointmentAsAdmin,
  listAppointmentsByDate,
  updateAppointmentStatus,
} from '../services/adminService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { validateAppointmentStatus, validateDate, requireFields } from '../utils/validators.js';

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

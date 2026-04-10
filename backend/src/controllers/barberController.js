import {
  createBarber,
  disableBarber,
  listActiveBarbers,
  listAllBarbers,
  updateBarber,
} from '../services/barberService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireFields, validateUuid } from '../utils/validators.js';

export async function getPublicBarbers(_req, res, next) {
  try {
    const barbers = await listActiveBarbers();
    return sendSuccess(res, 200, { barbers });
  } catch (error) {
    return next(error);
  }
}

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

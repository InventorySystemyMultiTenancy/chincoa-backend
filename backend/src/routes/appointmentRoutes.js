import { Router } from 'express';

import {
  createMyAppointment,
  deleteAppointment,
  getAppointmentServices,
  getSlotsByDate,
  getMyAppointments,
} from '../controllers/appointmentController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/slots', getSlotsByDate);
router.get('/services', getAppointmentServices);
router.get('/me', requireAuth, getMyAppointments);
router.post('/', requireAuth, createMyAppointment);
router.delete('/:id', requireAuth, deleteAppointment);

export default router;

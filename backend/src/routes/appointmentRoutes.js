import { Router } from 'express';

import {
  createMyAppointment,
  deleteAppointment,
  getSlotsByDate,
  getMyAppointments,
} from '../controllers/appointmentController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/slots', getSlotsByDate);
router.get('/me', requireAuth, getMyAppointments);
router.post('/', requireAuth, createMyAppointment);
router.delete('/:id', requireAuth, deleteAppointment);

export default router;

import { Router } from 'express';

import {
  createMyAppointment,
  deleteAppointment,
  getMyAppointments,
} from '../controllers/appointmentController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/me', requireAuth, getMyAppointments);
router.post('/', requireAuth, createMyAppointment);
router.delete('/:id', requireAuth, deleteAppointment);

export default router;

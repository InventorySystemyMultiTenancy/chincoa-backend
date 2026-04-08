import { Router } from 'express';

import {
  listAppointments,
  patchAppointmentStatus,
  removeAppointment,
} from '../controllers/adminController.js';
import { requireAdmin, requireAuth } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/appointments', listAppointments);
router.patch('/appointments/:id/status', patchAppointmentStatus);
router.delete('/appointments/:id', removeAppointment);

export default router;

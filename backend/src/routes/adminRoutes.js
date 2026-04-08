import { Router } from 'express';

import {
  getScheduleDays,
  getScheduleHours,
  listAppointments,
  patchScheduleDay,
  patchScheduleHour,
  patchAppointmentStatus,
  postScheduleDay,
  postScheduleHour,
  removeAppointment,
  removeScheduleDay,
  removeScheduleHour,
} from '../controllers/adminController.js';
import { requireAdmin, requireAuth } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/appointments', listAppointments);
router.patch('/appointments/:id/status', patchAppointmentStatus);
router.delete('/appointments/:id', removeAppointment);

router.get('/schedule/hours', getScheduleHours);
router.post('/schedule/hours', postScheduleHour);
router.patch('/schedule/hours/:id', patchScheduleHour);
router.delete('/schedule/hours/:id', removeScheduleHour);

router.get('/schedule/days', getScheduleDays);
router.post('/schedule/days', postScheduleDay);
router.patch('/schedule/days/:id', patchScheduleDay);
router.delete('/schedule/days/:id', removeScheduleDay);

export default router;

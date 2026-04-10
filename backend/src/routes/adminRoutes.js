import { Router } from 'express';

import {
  deleteAdminBarber,
  getAdminBarbers,
  patchAdminBarber,
  postAdminBarber,
  getFinancialReportSummary,
  getFixedExpenses,
  getScheduleDays,
  getScheduleHours,
  getVariableExpenses,
  listAppointments,
  patchScheduleDay,
  patchScheduleHour,
  patchAppointmentStatus,
  postFixedExpense,
  postScheduleDay,
  postScheduleHour,
  postVariableExpense,
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

router.get('/barbers', getAdminBarbers);
router.post('/barbers', postAdminBarber);
router.patch('/barbers/:id', patchAdminBarber);
router.delete('/barbers/:id', deleteAdminBarber);

router.get('/reports/financial', getFinancialReportSummary);

router.get('/expenses/fixed', getFixedExpenses);
router.post('/expenses/fixed', postFixedExpense);

router.get('/expenses/variable', getVariableExpenses);
router.post('/expenses/variable', postVariableExpense);

router.get('/schedule/hours', getScheduleHours);
router.post('/schedule/hours', postScheduleHour);
router.patch('/schedule/hours/:id', patchScheduleHour);
router.delete('/schedule/hours/:id', removeScheduleHour);

router.get('/schedule/days', getScheduleDays);
router.post('/schedule/days', postScheduleDay);
router.patch('/schedule/days/:id', patchScheduleDay);
router.delete('/schedule/days/:id', removeScheduleDay);

export default router;

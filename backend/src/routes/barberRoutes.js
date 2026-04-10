import { Router } from 'express';

import { getPublicBarbers } from '../controllers/barberController.js';

const router = Router();

router.get('/', getPublicBarbers);
router.get('/active', getPublicBarbers);

export default router;

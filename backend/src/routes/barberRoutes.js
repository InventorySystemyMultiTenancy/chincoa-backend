import { Router } from 'express';

import { getPublicBarbers } from '../controllers/barberController.js';

const router = Router();

router.get('/', getPublicBarbers);

export default router;

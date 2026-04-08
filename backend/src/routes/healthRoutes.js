import { Router } from 'express';

import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();

router.get('/health', (_req, res) => {
  return sendSuccess(res, 200, {
    status: 'ok',
    service: 'chincoa-backend',
    timestamp: new Date().toISOString(),
  });
});

export default router;

import { Router } from 'express';

import {
  getAdminSubscriptionPlans,
  getMySubscription,
  getPublicSubscriptionPlans,
  getSubscription,
  getStatus,
  patchAdminSubscriptionPlan,
  postCancelSubscription,
  postCancel,
  postCreateSubscription,
  postCreateSubscriptionPlan,
  postCreatePix,
  postCreatePoint,
  postMercadoPagoIpn,
  postMercadoPagoWebhook,
} from '../controllers/paymentController.js';
import { requireAdmin, requireAuth } from '../middlewares/authMiddleware.js';
import { resolvePaymentStore } from '../middlewares/paymentStoreMiddleware.js';

const router = Router();
const PAYMENT_DEBUG_LOGS = String(process.env.PAYMENT_DEBUG_LOGS || '').trim() === 'true';

router.use((req, _res, next) => {
  if (PAYMENT_DEBUG_LOGS) {
    console.log(
      '[payments:route-hit]',
      JSON.stringify({
        method: req.method,
        path: req.originalUrl,
      }),
    );
  }

  next();
});

router.use(resolvePaymentStore);

router.post('/ipn/mercadopago', postMercadoPagoIpn);
router.post('/webhooks/mercadopago', postMercadoPagoWebhook);
router.get('/subscriptions/plans/public', getPublicSubscriptionPlans);

router.post('/create-pix', requireAuth, postCreatePix);
router.post('/create-point', requireAuth, postCreatePoint);
router.post('/create', requireAuth, postCreatePoint);

router.get('/subscriptions/plans', requireAuth, requireAdmin, getAdminSubscriptionPlans);
router.post('/subscriptions/plans', requireAuth, requireAdmin, postCreateSubscriptionPlan);
router.patch('/subscriptions/plans/:reference', requireAuth, requireAdmin, patchAdminSubscriptionPlan);
router.post('/subscriptions', requireAuth, postCreateSubscription);
router.get('/subscriptions/me', requireAuth, getMySubscription);
router.get('/subscriptions/:reference', requireAuth, getSubscription);
router.post('/subscriptions/:reference/cancel', requireAuth, postCancelSubscription);
router.delete('/subscriptions/:reference/cancel', requireAuth, postCancelSubscription);

router.get('/status/:reference', requireAuth, getStatus);
router.post('/cancel/:reference', requireAuth, postCancel);
router.delete('/cancel/:reference', requireAuth, postCancel);

export default router;

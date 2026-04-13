import { Router } from 'express';

import {
  getSubscription,
  getStatus,
  postCancelSubscription,
  postCancel,
  postCreateSubscription,
  postCreateSubscriptionPlan,
  postCreatePix,
  postCreatePoint,
  postMercadoPagoIpn,
  postMercadoPagoWebhook,
} from '../controllers/paymentController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { resolvePaymentStore } from '../middlewares/paymentStoreMiddleware.js';

const router = Router();

router.use(resolvePaymentStore);

router.post('/ipn/mercadopago', postMercadoPagoIpn);
router.post('/webhooks/mercadopago', postMercadoPagoWebhook);

router.post('/create-pix', requireAuth, postCreatePix);
router.post('/create-point', requireAuth, postCreatePoint);
router.post('/create', requireAuth, postCreatePoint);

router.post('/subscriptions/plans', requireAuth, postCreateSubscriptionPlan);
router.post('/subscriptions', requireAuth, postCreateSubscription);
router.get('/subscriptions/:reference', requireAuth, getSubscription);
router.post('/subscriptions/:reference/cancel', requireAuth, postCancelSubscription);
router.delete('/subscriptions/:reference/cancel', requireAuth, postCancelSubscription);

router.get('/status/:reference', requireAuth, getStatus);
router.post('/cancel/:reference', requireAuth, postCancel);
router.delete('/cancel/:reference', requireAuth, postCancel);

export default router;

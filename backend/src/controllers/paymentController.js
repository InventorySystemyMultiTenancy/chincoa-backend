import {
  cancelPayment,
  checkPaymentStatus,
  createPixPayment,
  createPointPayment,
  processIpnNotification,
  processWebhookNotification,
} from '../services/paymentService.js';
import { AppError } from '../utils/appError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireFields } from '../utils/validators.js';

function normalizeReference(value) {
  const text = String(value || '').trim();

  if (!text) {
    throw new AppError('Referencia de pagamento obrigatoria', 400, 'VALIDATION_ERROR');
  }

  return text;
}

function getIdempotencyKey(req) {
  const fromHeader = String(req.headers['x-idempotency-key'] || '').trim();
  return fromHeader || null;
}

export async function postCreatePix(req, res, next) {
  try {
    requireFields(req.body, ['appointment_id']);

    const result = await createPixPayment({
      appointmentId: String(req.body.appointment_id).trim(),
      amount: req.body.amount,
      description: req.body.description,
      payerEmail: req.body.payer_email || req.body.email,
      payerName: req.body.payer_name || req.body.payerName,
      idempotencyKey: getIdempotencyKey(req),
      user: req.user,
      store: req.store,
    });

    return sendSuccess(res, 201, result);
  } catch (error) {
    return next(error);
  }
}

export async function postCreatePoint(req, res, next) {
  try {
    requireFields(req.body, ['appointment_id']);

    const result = await createPointPayment({
      appointmentId: String(req.body.appointment_id).trim(),
      amount: req.body.amount,
      description: req.body.description,
      idempotencyKey: getIdempotencyKey(req),
      user: req.user,
      store: req.store,
    });

    return sendSuccess(res, 201, result);
  } catch (error) {
    return next(error);
  }
}

export async function getStatus(req, res, next) {
  try {
    const reference = normalizeReference(req.params.reference);

    const result = await checkPaymentStatus({
      reference,
      store: req.store,
    });

    return sendSuccess(res, 200, result);
  } catch (error) {
    return next(error);
  }
}

export async function postCancel(req, res, next) {
  try {
    const reference = normalizeReference(req.params.reference);

    const result = await cancelPayment({
      reference,
      user: req.user,
      store: req.store,
    });

    return sendSuccess(res, 200, result);
  } catch (error) {
    return next(error);
  }
}

export function postMercadoPagoIpn(req, res, _next) {
  sendSuccess(res, 200, {
    received: true,
    channel: 'ipn',
  });

  setImmediate(async () => {
    try {
      await processIpnNotification({
        queryParams: req.query,
        body: req.body,
        store: req.store,
      });
    } catch (error) {
      console.error('[payments:ipn-error]', error.message);
    }
  });
}

export function postMercadoPagoWebhook(req, res, _next) {
  sendSuccess(res, 200, {
    received: true,
    channel: 'webhook',
  });

  setImmediate(async () => {
    try {
      await processWebhookNotification({
        queryParams: req.query,
        body: req.body,
        store: req.store,
      });
    } catch (error) {
      console.error('[payments:webhook-error]', error.message);
    }
  });
}

import {
  cancelSubscription,
  cancelPayment,
  checkPaymentStatus,
  createSubscription,
  createSubscriptionPlan,
  createPixPayment,
  createPointPayment,
  getCurrentSubscriptionByUser,
  getSubscriptionStatus,
  listAdminSubscriptionPlans,
  listPublicSubscriptionPlans,
  setSubscriptionPlanActive,
  processIpnNotification,
  processWebhookNotification,
} from '../services/paymentService.js';
import { AppError } from '../utils/appError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireFields } from '../utils/validators.js';

const PAYMENT_DEBUG_LOGS = String(process.env.PAYMENT_DEBUG_LOGS || '').trim() === 'true';

function paymentDebugLog(event, payload) {
  if (!PAYMENT_DEBUG_LOGS) {
    return;
  }

  console.log(`[payments:controller:${event}]`, JSON.stringify(payload));
}

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

export async function postCreateSubscriptionPlan(req, res, next) {
  try {
    paymentDebugLog('create-plan:request', {
      method: req.method,
      path: req.originalUrl,
      user_id: req.user?.id || null,
      role: req.user?.role || null,
      store_id: req.store?.id || null,
      has_name: req.body?.name !== undefined,
      transaction_amount: req.body?.transaction_amount,
      frequency: req.body?.frequency,
      frequency_type: req.body?.frequency_type,
      currency_id: req.body?.currency_id,
    });

    requireFields(req.body, ['name', 'transaction_amount']);

    const result = await createSubscriptionPlan({
      name: req.body.name,
      description: req.body.description,
      reason: req.body.reason,
      transactionAmount: req.body.transaction_amount,
      frequency: req.body.frequency,
      frequencyType: req.body.frequency_type,
      currencyId: req.body.currency_id,
      backUrl: req.body.back_url,
      idempotencyKey: getIdempotencyKey(req),
      user: req.user,
      store: req.store,
    });

    paymentDebugLog('create-plan:success', {
      plan_id: result?.plan?.id || null,
      preapproval_plan_id: result?.plan?.preapproval_plan_id || null,
      provider_id: result?.provider?.id || null,
    });

    return sendSuccess(res, 201, result);
  } catch (error) {
    paymentDebugLog('create-plan:error', {
      method: req.method,
      path: req.originalUrl,
      user_id: req.user?.id || null,
      role: req.user?.role || null,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      statusCode: error.statusCode || 500,
      details: error.details || null,
    });

    return next(error);
  }
}

export async function getPublicSubscriptionPlans(req, res, next) {
  try {
    paymentDebugLog('list-public-plans:request', {
      method: req.method,
      path: req.originalUrl,
    });

    const plans = await listPublicSubscriptionPlans();

    paymentDebugLog('list-public-plans:success', {
      count: plans.length,
    });

    return sendSuccess(res, 200, { plans });
  } catch (error) {
    paymentDebugLog('list-public-plans:error', {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      statusCode: error.statusCode || 500,
      details: error.details || null,
    });

    return next(error);
  }
}

export async function getAdminSubscriptionPlans(req, res, next) {
  try {
    paymentDebugLog('list-admin-plans:request', {
      method: req.method,
      path: req.originalUrl,
      user_id: req.user?.id || null,
      role: req.user?.role || null,
    });

    const plans = await listAdminSubscriptionPlans();

    paymentDebugLog('list-admin-plans:success', {
      count: plans.length,
    });

    return sendSuccess(res, 200, { plans });
  } catch (error) {
    paymentDebugLog('list-admin-plans:error', {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      statusCode: error.statusCode || 500,
      details: error.details || null,
    });

    return next(error);
  }
}

export async function patchAdminSubscriptionPlan(req, res, next) {
  try {
    paymentDebugLog('patch-plan:request', {
      method: req.method,
      path: req.originalUrl,
      user_id: req.user?.id || null,
      role: req.user?.role || null,
      reference: req.params.reference,
      is_active: req.body?.is_active,
    });

    if (req.body.is_active === undefined) {
      throw new AppError('Campo is_active obrigatorio', 400, 'VALIDATION_ERROR');
    }

    const plan = await setSubscriptionPlanActive({
      reference: req.params.reference,
      isActive: req.body.is_active,
      user: req.user,
    });

    paymentDebugLog('patch-plan:success', {
      id: plan?.id || null,
      preapproval_plan_id: plan?.preapproval_plan_id || null,
      is_active: plan?.is_active,
    });

    return sendSuccess(res, 200, { plan });
  } catch (error) {
    paymentDebugLog('patch-plan:error', {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      statusCode: error.statusCode || 500,
      details: error.details || null,
    });

    return next(error);
  }
}

export async function postCreateSubscription(req, res, next) {
  try {
    requireFields(req.body, ['preapproval_plan_id', 'token', 'email']);

    const result = await createSubscription({
      preapprovalPlanId: req.body.preapproval_plan_id,
      payerEmail: req.body.email,
      cardTokenId: req.body.token,
      reason: req.body.reason,
      backUrl: req.body.back_url,
      status: req.body.status,
      idempotencyKey: getIdempotencyKey(req),
      user: req.user,
      store: req.store,
    });

    return sendSuccess(res, 201, result);
  } catch (error) {
    return next(error);
  }
}

export async function getSubscription(req, res, next) {
  try {
    const reference = normalizeReference(req.params.reference);

    const result = await getSubscriptionStatus({
      reference,
      user: req.user,
      store: req.store,
    });

    return sendSuccess(res, 200, result);
  } catch (error) {
    return next(error);
  }
}

export async function postCancelSubscription(req, res, next) {
  try {
    const reference = normalizeReference(req.params.reference);

    const result = await cancelSubscription({
      reference,
      user: req.user,
      store: req.store,
    });

    return sendSuccess(res, 200, result);
  } catch (error) {
    return next(error);
  }
}

export async function getMySubscription(req, res, next) {
  try {
    const subscription = await getCurrentSubscriptionByUser({ userId: req.user.id });

    return sendSuccess(res, 200, {
      subscription,
    });
  } catch (error) {
    return next(error);
  }
}

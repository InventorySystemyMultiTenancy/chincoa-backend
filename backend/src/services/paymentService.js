import { randomUUID } from 'node:crypto';

import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';

const MP_API_BASE_URL = String(process.env.MP_API_BASE_URL || 'https://api.mercadopago.com').trim();
const MP_REQUEST_TIMEOUT_MS = Number(process.env.MP_REQUEST_TIMEOUT_MS || 10000);
const MP_MAX_RETRIES = Number(process.env.MP_MAX_RETRIES || 2);
const PAYMENT_DEBUG_LOGS = String(process.env.PAYMENT_DEBUG_LOGS || '').trim() === 'true';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function logPayment(event, payload) {
  if (!PAYMENT_DEBUG_LOGS) {
    return;
  }

  console.log(`[payments:${event}]`, JSON.stringify(payload));
}

function sanitizeAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Valor de pagamento invalido', 400, 'INVALID_AMOUNT');
  }

  return Number(amount.toFixed(2));
}

function normalizeNullable(value) {
  const text = String(value || '').trim();
  return text ? text : null;
}

function normalizeMercadoPagoStatus(rawStatus) {
  const status = String(rawStatus || '').trim().toLowerCase();

  if (!status) {
    return 'pending';
  }

  if (status === 'approved' || status === 'authorized') {
    return 'approved';
  }

  if (status === 'pending' || status === 'in_process' || status === 'in_mediation') {
    return 'pending';
  }

  if (status === 'cancelled' || status === 'canceled' || status === 'refunded' || status === 'charged_back') {
    return 'canceled';
  }

  if (status === 'rejected') {
    return 'rejected';
  }

  return 'pending';
}

function normalizePointIntentState(rawState) {
  const state = String(rawState || '').trim().toUpperCase();

  if (!state) {
    return 'pending';
  }

  if (state === 'FINISHED') {
    return 'approved';
  }

  if (state === 'CANCELED' || state === 'ERROR' || state === 'EXPIRED') {
    return 'canceled';
  }

  if (state === 'REJECTED') {
    return 'rejected';
  }

  return 'pending';
}

function normalizeSubscriptionStatus(rawStatus, fallback = 'pending') {
  const status = String(rawStatus || '').trim().toLowerCase();

  if (!status) {
    return fallback;
  }

  if (status === 'authorized' || status === 'active') {
    return 'authorized';
  }

  if (status === 'paused' || status === 'suspended') {
    return 'paused';
  }

  if (status === 'cancelled' || status === 'canceled') {
    return 'canceled';
  }

  if (status === 'pending') {
    return 'pending';
  }

  return fallback;
}

export function mapSubscriptionStatusForFrontend(rawStatus) {
  return normalizeSubscriptionStatus(rawStatus, 'unknown');
}

function getSubscriptionActivityFlags(rawStatus) {
  const normalizedStatus = mapSubscriptionStatusForFrontend(rawStatus);

  if (normalizedStatus === 'canceled') {
    return {
      is_active: false,
      is_canceled: true,
      subscription_state: 'cancelada',
    };
  }

  if (['authorized', 'pending', 'paused'].includes(normalizedStatus)) {
    return {
      is_active: true,
      is_canceled: false,
      subscription_state: 'ativa',
    };
  }

  return {
    is_active: false,
    is_canceled: false,
    subscription_state: 'desconhecida',
  };
}

function parseBooleanQuery(value, defaultValue = false) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'sim'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'nao'].includes(normalized)) {
    return false;
  }

  throw new AppError('Parametro include_inactive invalido', 422, 'VALIDATION_ERROR');
}

function parsePagination({ page, limit }) {
  const parsedPage = Number.parseInt(String(page ?? '1'), 10);
  const parsedLimit = Number.parseInt(String(limit ?? '50'), 10);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError('Parametro page invalido', 422, 'VALIDATION_ERROR');
  }

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    throw new AppError('Parametro limit invalido', 422, 'VALIDATION_ERROR');
  }

  return {
    page: parsedPage,
    limit: parsedLimit,
    offset: (parsedPage - 1) * parsedLimit,
  };
}

function normalizeAdminSubscriptionStatusFilter(statusRaw) {
  const normalized = String(statusRaw || '').trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === 'cancelled') {
    return 'canceled';
  }

  if (['authorized', 'pending', 'paused', 'canceled', 'all'].includes(normalized)) {
    return normalized;
  }

  throw new AppError('Parametro status invalido', 422, 'VALIDATION_ERROR');
}

function buildNormalizedSubscriptionStatusSql(columnRef) {
  return `
    CASE
      WHEN lower(COALESCE(${columnRef}, '')) IN ('authorized', 'active') THEN 'authorized'
      WHEN lower(COALESCE(${columnRef}, '')) IN ('pending') THEN 'pending'
      WHEN lower(COALESCE(${columnRef}, '')) IN ('paused', 'suspended') THEN 'paused'
      WHEN lower(COALESCE(${columnRef}, '')) IN ('canceled', 'cancelled') THEN 'canceled'
      ELSE 'unknown'
    END
  `;
}

function mapSubscriberContract(row) {
  const normalizedStatus = mapSubscriptionStatusForFrontend(row.status || row.provider_status);
  const activityFlags = getSubscriptionActivityFlags(normalizedStatus);

  return {
    user_id: row.user_id,
    full_name: row.full_name || null,
    email: row.email || null,
    phone: row.phone || null,
    plan_name: row.plan_name || row.reason || null,
    preapproval_plan_id: row.preapproval_plan_id || null,
    subscription_id: row.subscription_id || null,
    status: normalizedStatus,
    is_active: activityFlags.is_active,
    is_canceled: activityFlags.is_canceled,
    subscription_state: activityFlags.subscription_state,
    transaction_amount: row.transaction_amount === null ? null : Number(row.transaction_amount),
    currency_id: row.currency_id || null,
  };
}

export async function listAdminSubscribers({ status, includeInactive, search, page, limit }) {
  const statusFilter = normalizeAdminSubscriptionStatusFilter(status);
  const includeInactiveFilter = parseBooleanQuery(includeInactive, false);
  const pagination = parsePagination({ page, limit });
  const searchValue = String(search || '').trim();
  const params = [];
  const whereClauses = [];

  if (searchValue) {
    params.push(`%${searchValue}%`);
    const searchParamIndex = params.length;
    whereClauses.push(`(
      full_name ILIKE $${searchParamIndex}
      OR email ILIKE $${searchParamIndex}
      OR phone ILIKE $${searchParamIndex}
      OR payer_email ILIKE $${searchParamIndex}
    )`);
  }

  const normalizedStatusSql = buildNormalizedSubscriptionStatusSql('s.status');

  if (statusFilter && statusFilter !== 'all') {
    params.push(statusFilter);
    whereClauses.push(`status = $${params.length}`);
  } else if (statusFilter === 'all' && !includeInactiveFilter) {
    whereClauses.push("status IN ('authorized', 'pending')");
  } else if (!statusFilter) {
    whereClauses.push("status IN ('authorized', 'pending')");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const rankedBaseSql = `
    WITH ranked AS (
      SELECT
        s.user_id,
        u.full_name,
        u.email,
        u.phone,
        s.payer_email,
        COALESCE(p.name, s.reason) AS plan_name,
        s.reason,
        COALESCE(s.mp_plan_id, p.mp_plan_id) AS preapproval_plan_id,
        s.mp_preapproval_id AS subscription_id,
        ${normalizedStatusSql} AS status,
        s.provider_status,
        COALESCE(p.transaction_amount, NULL) AS transaction_amount,
        COALESCE(p.currency_id, 'BRL') AS currency_id,
        ROW_NUMBER() OVER (
          PARTITION BY s.user_id
          ORDER BY
            s.updated_at DESC,
            s.created_at DESC
        ) AS rn
      FROM subscriptions s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN subscription_plans p ON p.mp_plan_id = s.mp_plan_id
      WHERE s.user_id IS NOT NULL
    ),
    dedup AS (
      SELECT *
      FROM ranked
      WHERE rn = 1
    )
  `;

  try {
    const countResult = await query(
      `
        ${rankedBaseSql}
        SELECT COUNT(*)::int AS total
        FROM dedup
        ${whereSql}
      `,
      params,
    );

    const total = countResult.rows[0]?.total || 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit);

    const dataParams = [...params, pagination.limit, pagination.offset];

    const rowsResult = await query(
      `
        ${rankedBaseSql}
        SELECT
          user_id,
          full_name,
          email,
          phone,
          plan_name,
          reason,
          preapproval_plan_id,
          subscription_id,
          status,
          provider_status,
          transaction_amount,
          currency_id
        FROM dedup
        ${whereSql}
        ORDER BY full_name ASC NULLS LAST, email ASC NULLS LAST
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      dataParams,
    );

    return {
      subscribers: rowsResult.rows.map(mapSubscriberContract),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        total_pages: totalPages,
      },
    };
  } catch (error) {
    if (error.code !== '42703') {
      throw error;
    }

    const legacyRankedBaseSql = `
      WITH ranked AS (
        SELECT
          s.user_id,
          u.full_name,
          u.email,
          u.phone,
          s.payer_email,
          COALESCE(p.name, s.reason) AS plan_name,
          s.reason,
          COALESCE(s.preapproval_plan_id, p.preapproval_plan_id) AS preapproval_plan_id,
          s.mp_preapproval_id AS subscription_id,
          ${normalizedStatusSql} AS status,
          s.provider_status,
          COALESCE(p.transaction_amount, NULL) AS transaction_amount,
          COALESCE(p.currency_id, 'BRL') AS currency_id,
          ROW_NUMBER() OVER (
            PARTITION BY s.user_id
            ORDER BY
              s.updated_at DESC,
              s.created_at DESC
          ) AS rn
        FROM subscriptions s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN subscription_plans p ON p.preapproval_plan_id = s.preapproval_plan_id
        WHERE s.user_id IS NOT NULL
      ),
      dedup AS (
        SELECT *
        FROM ranked
        WHERE rn = 1
      )
    `;

    const countResult = await query(
      `
        ${legacyRankedBaseSql}
        SELECT COUNT(*)::int AS total
        FROM dedup
        ${whereSql}
      `,
      params,
    );

    const total = countResult.rows[0]?.total || 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit);
    const dataParams = [...params, pagination.limit, pagination.offset];

    const rowsResult = await query(
      `
        ${legacyRankedBaseSql}
        SELECT
          user_id,
          full_name,
          email,
          phone,
          plan_name,
          reason,
          preapproval_plan_id,
          subscription_id,
          status,
          provider_status,
          transaction_amount,
          currency_id
        FROM dedup
        ${whereSql}
        ORDER BY full_name ASC NULLS LAST, email ASC NULLS LAST
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      dataParams,
    );

    return {
      subscribers: rowsResult.rows.map(mapSubscriberContract),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        total_pages: totalPages,
      },
    };
  }
}

export async function getCurrentSubscriptionByUser({ userId }) {
  let currentResult;

  try {
    currentResult = await query(
      `
        SELECT
          id,
          user_id,
          payer_email,
          mp_preapproval_id,
          mp_plan_id,
          external_reference,
          reason,
          status,
          provider_status,
          next_payment_date,
          back_url,
          card_token_last4,
          created_at,
          updated_at
        FROM subscriptions
        WHERE user_id = $1
        ORDER BY
          updated_at DESC,
          created_at DESC
        LIMIT 1
      `,
      [userId],
    );
  } catch (error) {
    if (error.code !== '42703') {
      throw error;
    }

    currentResult = await query(
      `
        SELECT
          id,
          user_id,
          payer_email,
          mp_preapproval_id,
          preapproval_plan_id AS mp_plan_id,
          external_reference,
          reason,
          status,
          provider_status,
          next_payment_date,
          back_url,
          card_token_last4,
          created_at,
          updated_at
        FROM subscriptions
        WHERE user_id = $1
        ORDER BY
          updated_at DESC,
          created_at DESC
        LIMIT 1
      `,
      [userId],
    );
  }

  if (currentResult.rowCount === 0) {
    return null;
  }

  const subscription = currentResult.rows[0];
  const plan = await getPlanByMpId(subscription.mp_plan_id);
  const attempts = await listSubscriptionAttempts(subscription.id);
  const providerEvents = await listSubscriptionProviderEvents(subscription.id);

  return mapSubscriptionContract({
    subscription,
    plan,
    attempts,
    providerEvents,
  });
}

function isValidEmail(email) {
  const text = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function buildMercadoPagoError(data, statusCode) {
  const apiMessage = data?.message || data?.error || data?.cause?.[0]?.description;
  const message = apiMessage || 'Falha na comunicacao com Mercado Pago';

  return new AppError(message, statusCode >= 500 ? 502 : statusCode, 'PROVIDER_UNAVAILABLE', {
    provider_status: statusCode,
    provider_message: apiMessage || null,
    provider_error: data?.error || null,
  });
}

function toExternalReference(appointmentId) {
  return `appointment:${appointmentId}`;
}

function fromExternalReference(externalReference) {
  const text = normalizeNullable(externalReference);

  if (!text) {
    return null;
  }

  if (text.startsWith('appointment:')) {
    const candidate = text.slice('appointment:'.length);
    return UUID_REGEX.test(candidate) ? candidate : null;
  }

  return UUID_REGEX.test(text) ? text : null;
}

function toSubscriptionExternalReference(userId) {
  return `subscription:${userId}`;
}

function fromSubscriptionExternalReference(externalReference) {
  const text = normalizeNullable(externalReference);

  if (!text) {
    return null;
  }

  if (!text.startsWith('subscription:')) {
    return null;
  }

  const candidate = text.slice('subscription:'.length);
  return UUID_REGEX.test(candidate) ? candidate : null;
}

function ensureSubscriptionEmail(email) {
  const normalized = normalizeNullable(email);

  if (!normalized) {
    throw new AppError('Email do assinante obrigatorio para criar assinatura', 400, 'VALIDATION_ERROR');
  }

  if (!isValidEmail(normalized)) {
    throw new AppError('Email do assinante invalido', 400, 'VALIDATION_ERROR');
  }

  return normalized;
}

function normalizeCurrency(currencyId) {
  return normalizeNullable(currencyId) || 'BRL';
}

function sanitizeFrequency(value, fallback = 1) {
  const number = Number(value ?? fallback);

  if (!Number.isInteger(number) || number <= 0) {
    throw new AppError('Frequencia da recorrencia invalida', 400, 'VALIDATION_ERROR');
  }

  return number;
}

function sanitizeFrequencyType(value, fallback = 'months') {
  const normalized = String(value || fallback).trim().toLowerCase();

  if (!['days', 'months'].includes(normalized)) {
    throw new AppError('frequency_type invalido. Use days ou months', 400, 'VALIDATION_ERROR');
  }

  return normalized;
}

function ensureMercadoPagoToken(store) {
  const token = normalizeNullable(store?.mp_access_token);

  if (!token) {
    throw new AppError('Access Token do Mercado Pago nao configurado', 500, 'MERCADO_PAGO_TOKEN_MISSING');
  }

  return token;
}

function ensurePointDevice(store) {
  const deviceId = normalizeNullable(store?.mp_device_id);

  if (!deviceId) {
    throw new AppError('Device ID da Point nao configurado', 400, 'POINT_DEVICE_ID_MISSING');
  }

  return deviceId;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return {
      message: text,
    };
  }
}

async function mercadoPagoRequest({
  path,
  method = 'GET',
  token,
  payload,
  idempotencyKey,
  timeoutMs = MP_REQUEST_TIMEOUT_MS,
  retries = MP_MAX_RETRIES,
}) {
  const url = `${MP_API_BASE_URL}${path}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
      };

      if (payload !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      if (idempotencyKey) {
        headers['X-Idempotency-Key'] = idempotencyKey;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      const data = safeParseJson(text);

      if (response.ok) {
        return data;
      }

      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        await sleep(200 * (attempt + 1));
        continue;
      }

      throw buildMercadoPagoError(data, response.status);
    } catch (error) {
      const shouldRetry = (error.name === 'AbortError' || error.code === 'ECONNRESET') && attempt < retries;

      if (shouldRetry) {
        await sleep(200 * (attempt + 1));
        continue;
      }

      if (error.name === 'AbortError') {
        throw new AppError('Timeout ao comunicar com Mercado Pago', 504, 'PROVIDER_UNAVAILABLE');
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new AppError('Falha de comunicacao com Mercado Pago', 502, 'PROVIDER_UNAVAILABLE');
}

async function findAppointmentByReference(reference) {
  const result = await query(
    `
      SELECT
        id,
        user_id,
        appointment_date,
        appointment_time,
        status,
        price,
        payment_id,
        payment_intent_id,
        payment_status,
        payment_method,
        payment_provider,
        payment_external_reference,
        payment_idempotency_key
      FROM appointments
      WHERE id::text = $1
         OR payment_id = $1
         OR payment_intent_id = $1
      LIMIT 1
    `,
    [reference],
  );

  return result.rowCount > 0 ? result.rows[0] : null;
}

async function getAppointmentForWrite({ appointmentId, user }) {
  const result = await query(
    `
      SELECT
        id,
        user_id,
        appointment_date,
        appointment_time,
        status,
        price,
        payment_id,
        payment_intent_id,
        payment_status,
        payment_method,
        payment_provider,
        payment_external_reference,
        payment_idempotency_key
      FROM appointments
      WHERE id = $1
      LIMIT 1
    `,
    [appointmentId],
  );

  if (result.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }

  const appointment = result.rows[0];

  if (user.role !== 'admin' && appointment.user_id !== user.id) {
    throw new AppError('Sem permissao para operar neste agendamento', 403, 'FORBIDDEN');
  }

  return appointment;
}

function toPaymentResponse({ appointment, providerStatus, qrCodeBase64, qrCodeCopyPaste }) {
  return {
    appointmentId: appointment.id,
    paymentId: appointment.payment_id,
    paymentIntentId: appointment.payment_intent_id,
    paymentStatus: appointment.payment_status,
    providerStatus,
    paymentMethod: appointment.payment_method,
    qrCodeBase64: qrCodeBase64 || null,
    qrCodeCopyPaste: qrCodeCopyPaste || null,
  };
}

async function updateAppointmentPaymentState({
  appointmentId,
  paymentId,
  paymentIntentId,
  paymentStatus,
  paymentMethod,
  paymentProvider = 'mercado_pago',
  paymentExternalReference,
  paymentIdempotencyKey,
}) {
  const currentResult = await query(
    `
      SELECT id, status, payment_status
      FROM appointments
      WHERE id = $1
      LIMIT 1
    `,
    [appointmentId],
  );

  if (currentResult.rowCount === 0) {
    throw new AppError('Agendamento nao encontrado', 404, 'APPOINTMENT_NOT_FOUND');
  }

  const current = currentResult.rows[0];
  const nextPaymentStatus = normalizeMercadoPagoStatus(paymentStatus);
  const nextAppointmentStatus = nextPaymentStatus === 'approved'
    ? 'pago'
    : (current.status === 'pago' ? 'pago' : 'agendado');

  const updateResult = await query(
    `
      UPDATE appointments
      SET
        status = $2,
        payment_id = COALESCE($3, payment_id),
        payment_intent_id = COALESCE($4, payment_intent_id),
        payment_status = $5,
        payment_method = COALESCE($6, payment_method),
        payment_provider = COALESCE($7, payment_provider),
        payment_external_reference = COALESCE($8, payment_external_reference),
        payment_idempotency_key = COALESCE($9, payment_idempotency_key),
        payment_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        status,
        payment_id,
        payment_intent_id,
        payment_status,
        payment_method,
        payment_provider,
        payment_external_reference
    `,
    [
      appointmentId,
      nextAppointmentStatus,
      normalizeNullable(paymentId),
      normalizeNullable(paymentIntentId),
      nextPaymentStatus,
      normalizeNullable(paymentMethod),
      normalizeNullable(paymentProvider),
      normalizeNullable(paymentExternalReference),
      normalizeNullable(paymentIdempotencyKey),
    ],
  );

  return updateResult.rows[0];
}

async function fetchPointIntent({ token, paymentIntentId }) {
  try {
    return await mercadoPagoRequest({
      path: `/point/integration-api/payment-intents/${paymentIntentId}`,
      method: 'GET',
      token,
    });
  } catch (error) {
    if (
      error.code === 'PROVIDER_UNAVAILABLE'
      && (error.details?.provider_status === 404 || error.details?.provider_status === 400)
    ) {
      return null;
    }

    throw error;
  }
}

async function fetchPayment({ token, paymentId }) {
  try {
    return await mercadoPagoRequest({
      path: `/v1/payments/${paymentId}`,
      method: 'GET',
      token,
    });
  } catch (error) {
    if (error.code === 'PROVIDER_UNAVAILABLE' && error.details?.provider_status === 404) {
      return null;
    }

    throw error;
  }
}

async function registerNotification({ source, notificationKey, topic, resourceId, payload }) {
  const result = await query(
    `
      INSERT INTO payment_notifications (source, notification_key, topic, resource_id, payload)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (notification_key) DO NOTHING
      RETURNING id
    `,
    [source, notificationKey, topic, resourceId, JSON.stringify(payload || {})],
  );

  return result.rowCount > 0;
}

async function upsertSubscriptionPlan({
  mpPlanId,
  name,
  description,
  reason,
  frequency,
  frequencyType,
  transactionAmount,
  currencyId,
  backUrl,
  isActive,
  status,
  createdBy,
}) {
  const payload = [
    mpPlanId,
    String(name || reason || 'Plano mensal').trim(),
    normalizeNullable(description),
    normalizeNullable(reason),
    frequency,
    frequencyType,
    transactionAmount,
    currencyId,
    normalizeNullable(backUrl),
    isActive !== undefined ? Boolean(isActive) : true,
    normalizeSubscriptionStatus(status),
    normalizeNullable(createdBy),
  ];

  const updated = await query(
    `
      UPDATE subscription_plans
      SET
        name = $2,
        description = $3,
        reason = $4,
        frequency = $5,
        frequency_type = $6,
        transaction_amount = $7,
        currency_id = $8,
        back_url = $9,
        is_active = $10,
        status = $11,
        created_by = COALESCE($12, created_by),
        updated_at = NOW()
      WHERE mp_plan_id = $1
      RETURNING
        id,
        mp_plan_id,
        name,
        description,
        reason,
        frequency,
        frequency_type,
        transaction_amount,
        currency_id,
        back_url,
        is_active,
        status,
        created_by,
        created_at,
        updated_at
    `,
    payload,
  );

  if (updated.rowCount > 0) {
    return updated.rows[0];
  }

  const inserted = await query(
    `
      INSERT INTO subscription_plans (
        mp_plan_id,
        name,
        description,
        reason,
        frequency,
        frequency_type,
        transaction_amount,
        currency_id,
        back_url,
        is_active,
        status,
        created_by
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      WHERE NOT EXISTS (
        SELECT 1 FROM subscription_plans WHERE mp_plan_id = $1
      )
      RETURNING
        id,
        mp_plan_id,
        name,
        description,
        reason,
        frequency,
        frequency_type,
        transaction_amount,
        currency_id,
        back_url,
        is_active,
        status,
        created_by,
        created_at,
        updated_at
    `,
    payload,
  );

  if (inserted.rowCount > 0) {
    return inserted.rows[0];
  }

  const fallback = await query(
    `
      SELECT
        id,
        mp_plan_id,
        name,
        description,
        reason,
        frequency,
        frequency_type,
        transaction_amount,
        currency_id,
        back_url,
        is_active,
        status,
        created_by,
        created_at,
        updated_at
      FROM subscription_plans
      WHERE mp_plan_id = $1
      LIMIT 1
    `,
    [mpPlanId],
  );

  return fallback.rows[0];
}

function mapPublicPlanContract(plan) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description || null,
    transaction_amount: Number(plan.transaction_amount),
    frequency: Number(plan.frequency),
    frequency_type: plan.frequency_type,
    currency_id: plan.currency_id,
    preapproval_plan_id: plan.mp_plan_id,
  };
}

export async function listPublicSubscriptionPlans() {
  const result = await query(
    `
      SELECT
        id,
        name,
        description,
        transaction_amount,
        frequency,
        frequency_type,
        currency_id,
        mp_plan_id,
        is_active,
        status,
        created_at
      FROM subscription_plans
      WHERE is_active = true
      ORDER BY transaction_amount ASC, created_at ASC
    `,
  );

  return result.rows.map(mapPublicPlanContract);
}

function mapAdminPlanContract(plan) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description || null,
    reason: plan.reason || null,
    transaction_amount: Number(plan.transaction_amount),
    frequency: Number(plan.frequency),
    frequency_type: plan.frequency_type,
    currency_id: plan.currency_id,
    preapproval_plan_id: plan.mp_plan_id,
    is_active: Boolean(plan.is_active),
    provider_status: plan.status || null,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
  };
}

export async function listAdminSubscriptionPlans() {
  const result = await query(
    `
      SELECT
        id,
        name,
        description,
        reason,
        transaction_amount,
        frequency,
        frequency_type,
        currency_id,
        mp_plan_id,
        is_active,
        status,
        created_at,
        updated_at
      FROM subscription_plans
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map(mapAdminPlanContract);
}

export async function setSubscriptionPlanActive({ reference, isActive, user }) {
  if (user.role !== 'admin') {
    throw new AppError('Somente admin pode atualizar plano de assinatura', 403, 'FORBIDDEN_ADMIN_ONLY');
  }

  const normalizedReference = normalizeNullable(reference);

  if (!normalizedReference) {
    throw new AppError('Referencia do plano obrigatoria', 400, 'VALIDATION_ERROR');
  }

  const result = await query(
    `
      UPDATE subscription_plans
      SET is_active = $2, updated_at = NOW()
      WHERE id::text = $1 OR mp_plan_id = $1
      RETURNING
        id,
        name,
        description,
        reason,
        transaction_amount,
        frequency,
        frequency_type,
        currency_id,
        mp_plan_id,
        is_active,
        status,
        created_at,
        updated_at
    `,
    [normalizedReference, Boolean(isActive)],
  );

  if (result.rowCount === 0) {
    throw new AppError('Plano de assinatura nao encontrado', 404, 'SUBSCRIPTION_PLAN_NOT_FOUND');
  }

  return mapAdminPlanContract(result.rows[0]);
}

async function findActivePlanByMpId(preapprovalPlanId) {
  const result = await query(
    `
      SELECT
        id,
        mp_plan_id,
        name,
        description,
        reason,
        frequency,
        frequency_type,
        transaction_amount,
        currency_id,
        back_url,
        is_active,
        status
      FROM subscription_plans
      WHERE mp_plan_id = $1
      LIMIT 1
    `,
    [preapprovalPlanId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const plan = result.rows[0];

  if (!plan.is_active) {
    return null;
  }

  return plan;
}

async function findSubscriptionByReference(reference) {
  const result = await query(
    `
      SELECT
        id,
        user_id,
        payer_email,
        mp_preapproval_id,
        mp_plan_id,
        external_reference,
        reason,
        status,
        provider_status,
        next_payment_date,
        back_url,
        card_token_last4,
        created_at,
        updated_at
      FROM subscriptions
      WHERE id::text = $1 OR mp_preapproval_id = $1
      LIMIT 1
    `,
    [reference],
  );

  return result.rowCount > 0 ? result.rows[0] : null;
}

async function upsertSubscriptionFromProvider({
  mpPreapprovalId,
  userId,
  payerEmail,
  mpPlanId,
  externalReference,
  reason,
  status,
  providerStatus,
  nextPaymentDate,
  backUrl,
  cardTokenLast4,
}) {
  const payload = [
    normalizeNullable(userId),
    normalizeNullable(payerEmail),
    mpPreapprovalId,
    normalizeNullable(mpPlanId),
    normalizeNullable(externalReference),
    normalizeNullable(reason),
    normalizeSubscriptionStatus(status || providerStatus),
    normalizeNullable(providerStatus),
    normalizeNullable(nextPaymentDate),
    normalizeNullable(backUrl),
    normalizeNullable(cardTokenLast4),
  ];

  const updated = await query(
    `
      UPDATE subscriptions
      SET
        user_id = COALESCE($1, user_id),
        payer_email = COALESCE($2, payer_email),
        mp_plan_id = COALESCE($4, mp_plan_id),
        external_reference = COALESCE($5, external_reference),
        reason = COALESCE($6, reason),
        status = $7,
        provider_status = COALESCE($8, provider_status),
        next_payment_date = COALESCE($9, next_payment_date),
        back_url = COALESCE($10, back_url),
        card_token_last4 = COALESCE($11, card_token_last4),
        updated_at = NOW()
      WHERE mp_preapproval_id = $3
      RETURNING
        id,
        user_id,
        payer_email,
        mp_preapproval_id,
        mp_plan_id,
        external_reference,
        reason,
        status,
        provider_status,
        next_payment_date,
        back_url,
        card_token_last4,
        created_at,
        updated_at
    `,
    payload,
  );

  if (updated.rowCount > 0) {
    return updated.rows[0];
  }

  const inserted = await query(
    `
      INSERT INTO subscriptions (
        user_id,
        payer_email,
        mp_preapproval_id,
        mp_plan_id,
        external_reference,
        reason,
        status,
        provider_status,
        next_payment_date,
        back_url,
        card_token_last4
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      WHERE NOT EXISTS (
        SELECT 1 FROM subscriptions WHERE mp_preapproval_id = $3
      )
      RETURNING
        id,
        user_id,
        payer_email,
        mp_preapproval_id,
        mp_plan_id,
        external_reference,
        reason,
        status,
        provider_status,
        next_payment_date,
        back_url,
        card_token_last4,
        created_at,
        updated_at
    `,
    payload,
  );

  if (inserted.rowCount > 0) {
    return inserted.rows[0];
  }

  const fallback = await query(
    `
      SELECT
        id,
        user_id,
        payer_email,
        mp_preapproval_id,
        mp_plan_id,
        external_reference,
        reason,
        status,
        provider_status,
        next_payment_date,
        back_url,
        card_token_last4,
        created_at,
        updated_at
      FROM subscriptions
      WHERE mp_preapproval_id = $1
      LIMIT 1
    `,
    [mpPreapprovalId],
  );

  return fallback.rows[0];
}

async function getPlanByMpId(mpPlanId) {
  if (!mpPlanId) {
    return null;
  }

  try {
    const result = await query(
      `
        SELECT
          mp_plan_id,
          reason,
          frequency,
          frequency_type,
          transaction_amount,
          currency_id,
          back_url
        FROM subscription_plans
        WHERE mp_plan_id = $1
        LIMIT 1
      `,
      [mpPlanId],
    );

    return result.rowCount > 0 ? result.rows[0] : null;
  } catch (error) {
    if (error.code !== '42703') {
      throw error;
    }

    const legacyResult = await query(
      `
        SELECT
          preapproval_plan_id AS mp_plan_id,
          reason,
          frequency,
          frequency_type,
          transaction_amount,
          currency_id,
          back_url
        FROM subscription_plans
        WHERE preapproval_plan_id = $1
        LIMIT 1
      `,
      [mpPlanId],
    );

    return legacyResult.rowCount > 0 ? legacyResult.rows[0] : null;
  }
}

async function createSubscriptionAttempt({ subscriptionId, status, providerStatus, message, amount }) {
  const result = await query(
    `
      INSERT INTO subscription_attempts (subscription_id, status, provider_status, message, amount)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, status, provider_status, message, amount, created_at
    `,
    [
      subscriptionId,
      normalizeSubscriptionStatus(status || providerStatus),
      normalizeNullable(providerStatus),
      normalizeNullable(message),
      Number.isFinite(Number(amount)) ? Number(amount) : null,
    ],
  );

  return result.rows[0];
}

async function createSubscriptionProviderEvent({ subscriptionId, eventKey, type, status, message, payload }) {
  const normalizedEventKey = normalizeNullable(eventKey);

  if (normalizedEventKey) {
    const existing = await query(
      `
        SELECT id, type, status, message, created_at
        FROM subscription_provider_events
        WHERE provider_event_key = $1
        LIMIT 1
      `,
      [normalizedEventKey],
    );

    if (existing.rowCount > 0) {
      return null;
    }
  }

  const result = await query(
    `
      INSERT INTO subscription_provider_events (subscription_id, provider_event_key, type, status, message, payload)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING id, type, status, message, created_at
    `,
    [
      normalizeNullable(subscriptionId),
      normalizedEventKey,
      normalizeNullable(type) || 'subscription_event',
      normalizeNullable(status),
      normalizeNullable(message),
      JSON.stringify(payload || {}),
    ],
  );

  return result.rowCount > 0 ? result.rows[0] : null;
}

async function listSubscriptionAttempts(subscriptionId) {
  const result = await query(
    `
      SELECT id, status, provider_status, message, created_at, amount
      FROM subscription_attempts
      WHERE subscription_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [subscriptionId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    provider_status: row.provider_status,
    message: row.message,
    created_at: row.created_at,
    amount: row.amount === null ? null : Number(row.amount),
  }));
}

async function listSubscriptionProviderEvents(subscriptionId) {
  const result = await query(
    `
      SELECT id, type, status, message, created_at
      FROM subscription_provider_events
      WHERE subscription_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [subscriptionId],
  );

  return result.rows;
}

function mapSubscriptionContract({ subscription, plan, attempts, providerEvents }) {
  const normalizedStatus = mapSubscriptionStatusForFrontend(subscription.status || subscription.provider_status);
  const activityFlags = getSubscriptionActivityFlags(normalizedStatus);

  return {
    id: subscription.id,
    mp_preapproval_id: subscription.mp_preapproval_id,
    preapproval_plan_id: subscription.mp_plan_id || null,
    status: normalizedStatus,
    is_active: activityFlags.is_active,
    is_canceled: activityFlags.is_canceled,
    subscription_state: activityFlags.subscription_state,
    provider_status: subscription.provider_status || null,
    next_payment_date: subscription.next_payment_date || null,
    reason: subscription.reason || plan?.reason || null,
    transaction_amount: plan?.transaction_amount !== undefined && plan?.transaction_amount !== null
      ? Number(plan.transaction_amount)
      : null,
    currency_id: plan?.currency_id || 'BRL',
    frequency: plan?.frequency ?? null,
    frequency_type: plan?.frequency_type || null,
    email: subscription.payer_email,
    attempts: attempts || [],
    provider_events: providerEvents || [],
  };
}

async function finishNotification({ notificationKey, success, errorMessage = null }) {
  await query(
    `
      UPDATE payment_notifications
      SET
        processing_status = $2,
        error_message = $3,
        processed_at = NOW()
      WHERE notification_key = $1
    `,
    [notificationKey, success ? 'processed' : 'failed', errorMessage],
  );
}

async function syncAppointmentFromProvider({ appointment, paymentDetails, intentDetails }) {
  const externalReference = paymentDetails?.external_reference
    || intentDetails?.additional_info?.external_reference
    || appointment?.payment_external_reference
    || null;

  const appointmentId = appointment?.id || fromExternalReference(externalReference);

  if (!appointmentId) {
    return null;
  }

  const mappedStatus = paymentDetails
    ? normalizeMercadoPagoStatus(paymentDetails.status)
    : normalizePointIntentState(intentDetails?.state);

  return updateAppointmentPaymentState({
    appointmentId,
    paymentId: normalizeNullable(paymentDetails?.id),
    paymentIntentId: normalizeNullable(intentDetails?.id),
    paymentStatus: mappedStatus,
    paymentMethod: appointment?.payment_method || (intentDetails ? 'point_card' : 'pix'),
    paymentExternalReference: externalReference,
  });
}

export async function createPixPayment({
  appointmentId,
  amount,
  description,
  payerEmail,
  payerName,
  idempotencyKey,
  user,
  store,
}) {
  const token = ensureMercadoPagoToken(store);
  const appointment = await getAppointmentForWrite({ appointmentId, user });

  if (appointment.status === 'pago' || appointment.payment_status === 'approved') {
    throw new AppError('Agendamento ja possui pagamento confirmado', 409, 'PAYMENT_ALREADY_APPROVED');
  }

  const finalAmount = sanitizeAmount(amount ?? appointment.price);
  const finalIdempotencyKey = normalizeNullable(idempotencyKey) || `pix:${appointmentId}`;

  if (
    appointment.payment_method === 'pix'
    && appointment.payment_status === 'pending'
    && appointment.payment_id
    && appointment.payment_idempotency_key === finalIdempotencyKey
  ) {
    return toPaymentResponse({ appointment, providerStatus: 'pending' });
  }

  const notificationUrlBase = normalizeNullable(process.env.BACKEND_PUBLIC_URL);
  const notificationUrl = notificationUrlBase
    ? `${notificationUrlBase.replace(/\/$/, '')}/api/payments/webhooks/mercadopago`
    : undefined;

  const created = await mercadoPagoRequest({
    path: '/v1/payments',
    method: 'POST',
    token,
    idempotencyKey: finalIdempotencyKey,
    payload: {
      transaction_amount: finalAmount,
      description: normalizeNullable(description) || `Agendamento ${appointment.id}`,
      payment_method_id: 'pix',
      external_reference: toExternalReference(appointment.id),
      payer: {
        email: normalizeNullable(payerEmail) || 'cliente@chincoa.com',
        first_name: normalizeNullable(payerName) || 'Cliente',
      },
      notification_url: notificationUrl,
    },
  });

  const updated = await updateAppointmentPaymentState({
    appointmentId: appointment.id,
    paymentId: normalizeNullable(created?.id),
    paymentIntentId: null,
    paymentStatus: created?.status,
    paymentMethod: 'pix',
    paymentProvider: 'mercado_pago',
    paymentExternalReference: created?.external_reference,
    paymentIdempotencyKey: finalIdempotencyKey,
  });

  logPayment('create-pix', {
    appointmentId: appointment.id,
    paymentId: updated.payment_id,
    paymentStatus: updated.payment_status,
    storeId: store?.id || 'default',
  });

  return toPaymentResponse({
    appointment: updated,
    providerStatus: created?.status,
    qrCodeBase64: created?.point_of_interaction?.transaction_data?.qr_code_base64,
    qrCodeCopyPaste: created?.point_of_interaction?.transaction_data?.qr_code,
  });
}

export async function createPointPayment({
  appointmentId,
  amount,
  description,
  idempotencyKey,
  user,
  store,
}) {
  const token = ensureMercadoPagoToken(store);
  const deviceId = ensurePointDevice(store);
  const appointment = await getAppointmentForWrite({ appointmentId, user });

  if (appointment.status === 'pago' || appointment.payment_status === 'approved') {
    throw new AppError('Agendamento ja possui pagamento confirmado', 409, 'PAYMENT_ALREADY_APPROVED');
  }

  const finalAmount = sanitizeAmount(amount ?? appointment.price);
  const finalIdempotencyKey = normalizeNullable(idempotencyKey) || `point:${appointmentId}`;

  if (
    appointment.payment_method === 'point_card'
    && appointment.payment_status === 'pending'
    && appointment.payment_intent_id
    && appointment.payment_idempotency_key === finalIdempotencyKey
  ) {
    return toPaymentResponse({ appointment, providerStatus: 'pending' });
  }

  const created = await mercadoPagoRequest({
    path: `/point/integration-api/devices/${deviceId}/payment-intents`,
    method: 'POST',
    token,
    idempotencyKey: finalIdempotencyKey,
    payload: {
      amount: Math.round(finalAmount * 100),
      description: normalizeNullable(description) || `Agendamento ${appointment.id}`,
      additional_info: {
        external_reference: toExternalReference(appointment.id),
        print_on_terminal: true,
      },
    },
  });

  const updated = await updateAppointmentPaymentState({
    appointmentId: appointment.id,
    paymentId: normalizeNullable(created?.payment?.id),
    paymentIntentId: normalizeNullable(created?.id),
    paymentStatus: normalizePointIntentState(created?.state),
    paymentMethod: 'point_card',
    paymentProvider: 'mercado_pago',
    paymentExternalReference: created?.additional_info?.external_reference,
    paymentIdempotencyKey: finalIdempotencyKey,
  });

  logPayment('create-point', {
    appointmentId: appointment.id,
    paymentIntentId: updated.payment_intent_id,
    paymentStatus: updated.payment_status,
    storeId: store?.id || 'default',
  });

  return {
    appointmentId: updated.id,
    paymentIntentId: updated.payment_intent_id,
    paymentId: updated.payment_id,
    paymentStatus: updated.payment_status,
    providerStatus: created?.state || null,
    paymentMethod: updated.payment_method,
  };
}

export async function checkPaymentStatus({ reference, store }) {
  const token = ensureMercadoPagoToken(store);
  const localAppointment = await findAppointmentByReference(reference);

  const intentCandidates = [reference, localAppointment?.payment_intent_id]
    .map((item) => normalizeNullable(item))
    .filter(Boolean);

  const visitedIntent = new Set();

  for (const intentId of intentCandidates) {
    if (visitedIntent.has(intentId)) {
      continue;
    }

    visitedIntent.add(intentId);

    const intent = await fetchPointIntent({ token, paymentIntentId: intentId });

    if (!intent) {
      continue;
    }

    const realPaymentId = normalizeNullable(intent?.payment?.id);
    const payment = realPaymentId ? await fetchPayment({ token, paymentId: realPaymentId }) : null;
    const updated = await syncAppointmentFromProvider({
      appointment: localAppointment,
      paymentDetails: payment,
      intentDetails: intent,
    });

    return {
      reference,
      appointmentId: updated?.id || null,
      paymentIntentId: normalizeNullable(intent?.id),
      paymentId: normalizeNullable(payment?.id) || realPaymentId,
      status: payment ? normalizeMercadoPagoStatus(payment.status) : normalizePointIntentState(intent.state),
      providerStatus: payment?.status || intent?.state || null,
      statusDetail: payment?.status_detail || null,
      paymentMethod: updated?.payment_method || localAppointment?.payment_method || 'point_card',
    };
  }

  const paymentCandidates = [reference, localAppointment?.payment_id]
    .map((item) => normalizeNullable(item))
    .filter(Boolean);
  const visitedPayment = new Set();

  for (const paymentId of paymentCandidates) {
    if (visitedPayment.has(paymentId)) {
      continue;
    }

    visitedPayment.add(paymentId);

    const payment = await fetchPayment({ token, paymentId });

    if (!payment) {
      continue;
    }

    const updated = await syncAppointmentFromProvider({
      appointment: localAppointment,
      paymentDetails: payment,
      intentDetails: null,
    });

    return {
      reference,
      appointmentId: updated?.id || null,
      paymentIntentId: updated?.payment_intent_id || localAppointment?.payment_intent_id || null,
      paymentId: normalizeNullable(payment.id),
      status: normalizeMercadoPagoStatus(payment.status),
      providerStatus: payment.status,
      statusDetail: payment.status_detail || null,
      paymentMethod: updated?.payment_method || localAppointment?.payment_method || 'pix',
    };
  }

  throw new AppError('Pagamento nao encontrado no Mercado Pago', 404, 'PAYMENT_NOT_FOUND');
}

export async function cancelPayment({ reference, user, store }) {
  const token = ensureMercadoPagoToken(store);
  const appointment = await findAppointmentByReference(reference);

  if (appointment) {
    if (user.role !== 'admin' && appointment.user_id !== user.id) {
      throw new AppError('Sem permissao para cancelar este pagamento', 403, 'FORBIDDEN');
    }

    if (appointment.status === 'pago' || appointment.payment_status === 'approved') {
      throw new AppError('Pagamento ja finalizado e nao pode ser cancelado', 409, 'PAYMENT_ALREADY_FINALIZED');
    }
  }

  const intentCandidates = [reference, appointment?.payment_intent_id]
    .map((item) => normalizeNullable(item))
    .filter(Boolean);

  for (const intentId of intentCandidates) {
    const intent = await fetchPointIntent({ token, paymentIntentId: intentId });

    if (!intent) {
      continue;
    }

    await mercadoPagoRequest({
      path: `/point/integration-api/payment-intents/${intentId}`,
      method: 'DELETE',
      token,
    });

    if (appointment) {
      await updateAppointmentPaymentState({
        appointmentId: appointment.id,
        paymentId: normalizeNullable(intent?.payment?.id),
        paymentIntentId: intentId,
        paymentStatus: 'canceled',
        paymentMethod: appointment.payment_method || 'point_card',
        paymentExternalReference: intent?.additional_info?.external_reference,
      });
    }

    return {
      reference,
      canceled: true,
      paymentIntentId: intentId,
      paymentId: normalizeNullable(intent?.payment?.id),
      status: 'canceled',
    };
  }

  const paymentCandidates = [reference, appointment?.payment_id]
    .map((item) => normalizeNullable(item))
    .filter(Boolean);

  for (const paymentId of paymentCandidates) {
    const payment = await fetchPayment({ token, paymentId });

    if (!payment) {
      continue;
    }

    const canceled = await mercadoPagoRequest({
      path: `/v1/payments/${paymentId}`,
      method: 'PUT',
      token,
      payload: { status: 'cancelled' },
    });

    if (appointment) {
      await updateAppointmentPaymentState({
        appointmentId: appointment.id,
        paymentId,
        paymentIntentId: appointment.payment_intent_id,
        paymentStatus: 'canceled',
        paymentMethod: appointment.payment_method || 'pix',
        paymentExternalReference: canceled?.external_reference,
      });
    }

    return {
      reference,
      canceled: true,
      paymentIntentId: appointment?.payment_intent_id || null,
      paymentId,
      status: 'canceled',
    };
  }

  throw new AppError('Pagamento nao encontrado para cancelamento', 404, 'PAYMENT_NOT_FOUND');
}

function isPaymentTopic(topic, action) {
  const full = `${String(topic || '')} ${String(action || '')}`.toLowerCase();
  return full.includes('payment');
}

function isPreapprovalTopic(topic, action) {
  const full = `${String(topic || '')} ${String(action || '')}`.toLowerCase();
  return full.includes('preapproval') || full.includes('subscription');
}

async function fetchPreapproval({ token, preapprovalId }) {
  try {
    return await mercadoPagoRequest({
      path: `/preapproval/${preapprovalId}`,
      method: 'GET',
      token,
    });
  } catch (error) {
    if (error.code === 'PROVIDER_UNAVAILABLE' && error.details?.provider_status === 404) {
      return null;
    }

    throw error;
  }
}

export async function createSubscriptionPlan({
  name,
  description,
  reason,
  transactionAmount,
  frequency,
  frequencyType,
  currencyId,
  backUrl,
  idempotencyKey,
  user,
  store,
}) {
  if (user.role !== 'admin') {
    throw new AppError('Somente admin pode criar plano de assinatura', 403, 'FORBIDDEN_ADMIN_ONLY');
  }

  const token = ensureMercadoPagoToken(store);
  const finalAmount = sanitizeAmount(transactionAmount);
  const finalFrequency = sanitizeFrequency(frequency, 1);
  const finalFrequencyType = sanitizeFrequencyType(frequencyType, 'months');
  const finalName = String(name || reason || 'Plano mensal').trim();
  const finalReason = normalizeNullable(reason) || finalName;
  const finalDescription = normalizeNullable(description);
  const finalBackUrl = normalizeNullable(backUrl) || normalizeNullable(process.env.MP_SUBSCRIPTION_BACK_URL);

  if (!finalBackUrl) {
    throw new AppError('back_url obrigatoria para plano de assinatura', 400, 'VALIDATION_ERROR');
  }

  const created = await mercadoPagoRequest({
    path: '/preapproval_plan',
    method: 'POST',
    token,
    idempotencyKey: normalizeNullable(idempotencyKey) || `plan:${finalReason}:${finalAmount}`,
    payload: {
      reason: finalReason,
      auto_recurring: {
        frequency: finalFrequency,
        frequency_type: finalFrequencyType,
        transaction_amount: finalAmount,
        currency_id: normalizeCurrency(currencyId),
      },
      back_url: finalBackUrl || undefined,
    },
  });

  const plan = await upsertSubscriptionPlan({
    mpPlanId: String(created?.id || '').trim(),
    name: finalName,
    description: finalDescription,
    reason: created?.reason || finalReason,
    frequency: Number(created?.auto_recurring?.frequency || finalFrequency),
    frequencyType: String(created?.auto_recurring?.frequency_type || finalFrequencyType),
    transactionAmount: Number(created?.auto_recurring?.transaction_amount || finalAmount),
    currencyId: String(created?.auto_recurring?.currency_id || normalizeCurrency(currencyId)),
    backUrl: created?.back_url || finalBackUrl,
    isActive: true,
    status: created?.status || 'authorized',
    createdBy: user.id,
  });

  return {
    plan: {
      ...mapPublicPlanContract(plan),
      is_active: Boolean(plan.is_active),
      provider_status: plan.status,
    },
    provider: {
      id: created?.id || null,
      init_point: created?.init_point || null,
      back_url: created?.back_url || null,
    },
  };
}

export async function createSubscription({
  preapprovalPlanId,
  payerEmail,
  cardTokenId,
  reason,
  backUrl,
  status,
  idempotencyKey,
  user,
  store,
}) {
  const token = ensureMercadoPagoToken(store);
  const finalEmail = ensureSubscriptionEmail(payerEmail);
  const finalPlanId = normalizeNullable(preapprovalPlanId);

  if (!finalPlanId) {
    throw new AppError('preapproval_plan_id obrigatorio', 400, 'VALIDATION_ERROR');
  }

  const activePlan = await findActivePlanByMpId(finalPlanId);

  if (!activePlan) {
    throw new AppError('Plano de assinatura inativo ou inexistente', 400, 'VALIDATION_ERROR', {
      preapproval_plan_id: finalPlanId,
    });
  }

  const finalToken = normalizeNullable(cardTokenId);

  if (!finalToken) {
    throw new AppError('card_token_id obrigatorio', 400, 'VALIDATION_ERROR');
  }

  const finalStatus = normalizeNullable(status) || 'authorized';
  const finalReason = normalizeNullable(reason) || activePlan.reason || activePlan.name || 'Assinatura mensal';
  const finalBackUrl = normalizeNullable(backUrl) || normalizeNullable(process.env.MP_SUBSCRIPTION_BACK_URL);
  const externalReference = toSubscriptionExternalReference(user.id);

  if (!finalBackUrl) {
    throw new AppError('back_url obrigatoria para assinatura', 400, 'VALIDATION_ERROR');
  }

  const created = await mercadoPagoRequest({
    path: '/preapproval',
    method: 'POST',
    token,
    idempotencyKey: normalizeNullable(idempotencyKey) || `subscription:${user.id}:${finalPlanId}`,
    payload: {
      preapproval_plan_id: finalPlanId,
      payer_email: finalEmail,
      card_token_id: finalToken,
      reason: finalReason,
      status: finalStatus,
      external_reference: externalReference,
      back_url: finalBackUrl || undefined,
    },
  });

  const subscription = await upsertSubscriptionFromProvider({
    mpPreapprovalId: String(created?.id || '').trim(),
    userId: user.id,
    payerEmail: created?.payer_email || finalEmail,
    mpPlanId: created?.preapproval_plan_id || finalPlanId,
    externalReference: created?.external_reference || externalReference,
    reason: created?.reason || finalReason,
    status: created?.status || finalStatus,
    providerStatus: created?.status,
    nextPaymentDate: created?.next_payment_date,
    backUrl: created?.back_url || finalBackUrl,
    cardTokenLast4: created?.card_id ? String(created.card_id).slice(-4) : null,
  });

  await createSubscriptionAttempt({
    subscriptionId: subscription.id,
    status: created?.status || finalStatus,
    providerStatus: created?.status,
    message: 'Assinatura criada',
    amount: null,
  });

  await createSubscriptionProviderEvent({
    subscriptionId: subscription.id,
    eventKey: `create:${subscription.mp_preapproval_id}`,
    type: 'subscription_created',
    status: created?.status || finalStatus,
    message: 'Assinatura criada via backend',
    payload: created,
  });

  const plan = await getPlanByMpId(subscription.mp_plan_id);
  const attempts = await listSubscriptionAttempts(subscription.id);
  const providerEvents = await listSubscriptionProviderEvents(subscription.id);

  const contract = mapSubscriptionContract({
    subscription,
    plan,
    attempts,
    providerEvents,
  });

  return {
    subscription: contract,
    provider: {
      id: created?.id || null,
      status: created?.status || null,
      next_payment_date: created?.next_payment_date || null,
    },
  };
}

export async function getSubscriptionStatus({ reference, user, store }) {
  const token = ensureMercadoPagoToken(store);
  const local = await findSubscriptionByReference(reference);

  if (!local) {
    throw new AppError('Assinatura nao encontrada', 404, 'SUBSCRIPTION_NOT_FOUND');
  }

  if (user.role !== 'admin' && local.user_id !== user.id) {
    throw new AppError('Sem permissao para consultar esta assinatura', 403, 'FORBIDDEN_ADMIN_ONLY');
  }

  const provider = await fetchPreapproval({ token, preapprovalId: local.mp_preapproval_id });

  if (!provider) {
    const plan = await getPlanByMpId(local.mp_plan_id);
    const attempts = await listSubscriptionAttempts(local.id);
    const providerEvents = await listSubscriptionProviderEvents(local.id);

    return {
      subscription: mapSubscriptionContract({
        subscription: local,
        plan,
        attempts,
        providerEvents,
      }),
      provider: null,
    };
  }

  const updated = await upsertSubscriptionFromProvider({
    mpPreapprovalId: local.mp_preapproval_id,
    userId: local.user_id,
    payerEmail: provider?.payer_email || local.payer_email,
    mpPlanId: provider?.preapproval_plan_id || local.mp_plan_id,
    externalReference: provider?.external_reference || local.external_reference,
    reason: provider?.reason || local.reason,
    status: provider?.status || local.status,
    providerStatus: provider?.status,
    nextPaymentDate: provider?.next_payment_date || local.next_payment_date,
    backUrl: provider?.back_url || local.back_url,
    cardTokenLast4: local.card_token_last4,
  });

  await createSubscriptionProviderEvent({
    subscriptionId: updated.id,
    eventKey: `status:${updated.mp_preapproval_id}:${provider?.status}:${provider?.next_payment_date || ''}`,
    type: 'subscription_status_sync',
    status: provider?.status,
    message: 'Sincronizacao de status via consulta',
    payload: provider,
  });

  const hasStatusChange =
    normalizeSubscriptionStatus(local.status) !== normalizeSubscriptionStatus(updated.status)
    || String(local.provider_status || '') !== String(updated.provider_status || '');

  if (hasStatusChange) {
    await createSubscriptionAttempt({
      subscriptionId: updated.id,
      status: provider?.status || updated.status,
      providerStatus: provider?.status,
      message: 'Atualizacao de status via polling',
      amount: null,
    });
  }

  const plan = await getPlanByMpId(updated.mp_plan_id);
  const attempts = await listSubscriptionAttempts(updated.id);
  const providerEvents = await listSubscriptionProviderEvents(updated.id);

  return {
    subscription: mapSubscriptionContract({
      subscription: updated,
      plan,
      attempts,
      providerEvents,
    }),
    provider: {
      id: provider?.id || null,
      status: provider?.status || null,
      next_payment_date: provider?.next_payment_date || null,
    },
  };
}

export async function cancelSubscription({ reference, user, store }) {
  const token = ensureMercadoPagoToken(store);
  const local = await findSubscriptionByReference(reference);

  if (!local) {
    throw new AppError('Assinatura nao encontrada', 404, 'SUBSCRIPTION_NOT_FOUND');
  }

  if (user.role !== 'admin' && local.user_id !== user.id) {
    throw new AppError('Sem permissao para cancelar esta assinatura', 403, 'FORBIDDEN_ADMIN_ONLY');
  }

  if (normalizeSubscriptionStatus(local.status) === 'canceled') {
    throw new AppError('Assinatura ja cancelada', 409, 'SUBSCRIPTION_ALREADY_CANCELED');
  }

  const canceled = await mercadoPagoRequest({
    path: `/preapproval/${local.mp_preapproval_id}`,
    method: 'PUT',
    token,
    payload: { status: 'cancelled' },
  });

  const updated = await upsertSubscriptionFromProvider({
    mpPreapprovalId: local.mp_preapproval_id,
    userId: local.user_id,
    payerEmail: canceled?.payer_email || local.payer_email,
    mpPlanId: canceled?.preapproval_plan_id || local.mp_plan_id,
    externalReference: canceled?.external_reference || local.external_reference,
    reason: canceled?.reason || local.reason,
    status: canceled?.status || 'canceled',
    providerStatus: canceled?.status || 'canceled',
    nextPaymentDate: canceled?.next_payment_date || local.next_payment_date,
    backUrl: canceled?.back_url || local.back_url,
    cardTokenLast4: local.card_token_last4,
  });

  await createSubscriptionAttempt({
    subscriptionId: updated.id,
    status: 'canceled',
    providerStatus: canceled?.status || 'canceled',
    message: 'Assinatura cancelada',
    amount: null,
  });

  await createSubscriptionProviderEvent({
    subscriptionId: updated.id,
    eventKey: `cancel:${updated.mp_preapproval_id}`,
    type: 'subscription_canceled',
    status: canceled?.status || 'canceled',
    message: 'Cancelamento solicitado no backend',
    payload: canceled,
  });

  const plan = await getPlanByMpId(updated.mp_plan_id);
  const attempts = await listSubscriptionAttempts(updated.id);
  const providerEvents = await listSubscriptionProviderEvents(updated.id);

  return {
    subscription: mapSubscriptionContract({
      subscription: updated,
      plan,
      attempts,
      providerEvents,
    }),
    canceled: true,
  };
}

async function processNotification({ source, queryParams, body, store }) {
  const token = ensureMercadoPagoToken(store);
  const topic = normalizeNullable(queryParams?.topic) || normalizeNullable(body?.topic) || normalizeNullable(body?.type) || 'unknown';
  const action = normalizeNullable(body?.action);
  const resourceId = normalizeNullable(queryParams?.id)
    || normalizeNullable(body?.data?.id)
    || normalizeNullable(body?.resource)
    || normalizeNullable(body?.id);

  if (!resourceId) {
    return { ignored: true, reason: 'missing-resource-id' };
  }

  const notificationKey = `${source}:${topic}:${resourceId}`;
  const isNew = await registerNotification({
    source,
    notificationKey,
    topic,
    resourceId,
    payload: { query: queryParams || {}, body: body || {} },
  });

  if (!isNew) {
    return { ignored: true, reason: 'duplicate-notification' };
  }

  try {
    if (isPreapprovalTopic(topic, action)) {
      const preapproval = await fetchPreapproval({ token, preapprovalId: resourceId });

      if (preapproval) {
        const userIdFromReference = fromSubscriptionExternalReference(preapproval?.external_reference);

        const updatedSubscription = await upsertSubscriptionFromProvider({
          mpPreapprovalId: String(preapproval?.id || resourceId),
          userId: userIdFromReference,
          payerEmail: preapproval?.payer_email,
          mpPlanId: preapproval?.preapproval_plan_id,
          externalReference: preapproval?.external_reference,
          reason: preapproval?.reason,
          status: preapproval?.status,
          providerStatus: preapproval?.status,
          nextPaymentDate: preapproval?.next_payment_date,
          backUrl: preapproval?.back_url,
          cardTokenLast4: null,
        });

        await createSubscriptionProviderEvent({
          subscriptionId: updatedSubscription.id,
          eventKey: `${source}:preapproval:${resourceId}:${action || 'update'}`,
          type: 'preapproval_notification',
          status: preapproval?.status,
          message: `Notificacao ${source} de assinatura`,
          payload: {
            queryParams,
            body,
            preapproval,
          },
        });

        await createSubscriptionAttempt({
          subscriptionId: updatedSubscription.id,
          status: preapproval?.status,
          providerStatus: preapproval?.status,
          message: `Atualizacao via ${source}`,
          amount: null,
        });
      }

      await finishNotification({ notificationKey, success: true });

      return {
        processed: true,
        preapprovalId: resourceId,
        status: normalizeSubscriptionStatus(preapproval?.status),
      };
    }

    if (!isPaymentTopic(topic, action)) {
      await finishNotification({ notificationKey, success: true });
      return { ignored: true, reason: 'non-payment-topic' };
    }

    const payment = await fetchPayment({ token, paymentId: resourceId });

    if (!payment) {
      throw new AppError('Pagamento do webhook nao encontrado', 404, 'PAYMENT_NOT_FOUND');
    }

    const appointmentReference = fromExternalReference(payment.external_reference);
    const appointment = appointmentReference ? await findAppointmentByReference(appointmentReference) : await findAppointmentByReference(resourceId);

    await syncAppointmentFromProvider({
      appointment,
      paymentDetails: payment,
      intentDetails: null,
    });

    await finishNotification({ notificationKey, success: true });

    return {
      processed: true,
      paymentId: normalizeNullable(payment.id),
      status: normalizeMercadoPagoStatus(payment.status),
    };
  } catch (error) {
    await finishNotification({
      notificationKey,
      success: false,
      errorMessage: String(error.message || 'Erro ao processar notificacao').slice(0, 400),
    });
    throw error;
  }
}

export async function processIpnNotification({ queryParams, body, store }) {
  return processNotification({
    source: 'ipn',
    queryParams,
    body,
    store,
  });
}

export async function processWebhookNotification({ queryParams, body, store }) {
  return processNotification({
    source: 'webhook',
    queryParams,
    body,
    store,
  });
}

export function nextIdempotencyKey() {
  return randomUUID();
}

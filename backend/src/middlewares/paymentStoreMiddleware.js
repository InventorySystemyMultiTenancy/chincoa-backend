import { query } from '../db/pool.js';

function normalizeNullable(value) {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : null;
}

function fromEnv(storeId = 'default') {
  return {
    id: storeId,
    source: 'env',
    mp_access_token: normalizeNullable(process.env.MP_ACCESS_TOKEN),
    mp_device_id: normalizeNullable(process.env.MP_DEVICE_ID),
  };
}

export async function resolvePaymentStore(req, _res, next) {
  const storeId = normalizeNullable(req.headers['x-store-id'])
    || normalizeNullable(req.query.storeId)
    || normalizeNullable(req.query.store_id)
    || normalizeNullable(req.body?.storeId)
    || normalizeNullable(req.body?.store_id)
    || 'default';

  try {
    const result = await query(
      `
        SELECT id, mp_access_token, mp_device_id
        FROM stores
        WHERE id = $1
        LIMIT 1
      `,
      [storeId],
    );

    if (result.rowCount > 0) {
      req.store = {
        id: result.rows[0].id,
        source: 'database',
        mp_access_token: normalizeNullable(result.rows[0].mp_access_token),
        mp_device_id: normalizeNullable(result.rows[0].mp_device_id),
      };
      return next();
    }
  } catch (error) {
    if (error.code !== '42P01' && error.code !== 'DATABASE_URL_MISSING') {
      return next(error);
    }
  }

  req.store = fromEnv(storeId);
  return next();
}

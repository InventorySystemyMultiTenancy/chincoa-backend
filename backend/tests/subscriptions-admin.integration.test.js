import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import app from '../src/app.js';
import { pool, query } from '../src/db/pool.js';
import { signToken } from '../src/utils/jwt.js';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'integration-test-secret';
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

async function applyMigrations() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const sqlDir = path.resolve(currentDir, '../sql');
  const entries = await fs.readdir(sqlDir, { withFileTypes: true });

  const migrationFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of migrationFiles) {
    const sqlPath = path.join(sqlDir, fileName);
    const sql = await fs.readFile(sqlPath, 'utf-8');
    await query(sql);
  }
}

async function resetData() {
  await query(`
    TRUNCATE TABLE
      subscription_provider_events,
      subscription_attempts,
      subscriptions,
      subscription_plans,
      payment_notifications,
      appointments,
      business_day_hour_overrides,
      business_hours,
      business_days,
      system_settings,
      barbers,
      users
    RESTART IDENTITY CASCADE
  `);
}

async function createUser({ fullName, email, role = 'client' }) {
  const result = await query(
    `
      INSERT INTO users (full_name, email, phone, password_hash, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, full_name, email, phone, role
    `,
    [fullName, email, String(Date.now()) + Math.floor(Math.random() * 1000), 'hash', role],
  );

  return result.rows[0];
}

async function createBarber(fullName = 'Barbeiro Teste') {
  const result = await query(
    `
      INSERT INTO barbers (full_name, is_active)
      VALUES ($1, true)
      RETURNING id
    `,
    [fullName],
  );

  return result.rows[0];
}

async function createBusinessHour({ barberId, date, time }) {
  const weekday = new Date(`${date}T00:00:00`).getDay();

  await query(
    `
      INSERT INTO business_hours (weekday, slot_time, is_booked_week, barber_id)
      VALUES ($1, $2, false, $3)
      ON CONFLICT (weekday, slot_time, barber_id)
      DO NOTHING
    `,
    [weekday, `${time}:00`, barberId],
  );
}

if (!hasDatabase) {
  test('integration tests skipped without DATABASE_URL', { skip: true }, () => {});
} else {
  describe('admin subscribers and current subscription endpoints', () => {
    let adminUser;
    let clientUser;
    let adminToken;
    let clientToken;

    before(async () => {
      await applyMigrations();
    });

    beforeEach(async () => {
      await resetData();
      adminUser = await createUser({ fullName: 'Admin Teste', email: 'admin@integration.test', role: 'admin' });
      clientUser = await createUser({ fullName: 'Cliente Premium', email: 'client@integration.test', role: 'client' });
      adminToken = signToken(adminUser);
      clientToken = signToken(clientUser);
    });

    after(async () => {
      await pool.end();
    });

    test('GET /api/admin/subscribers returns only authorized/pending by default', async () => {
      const secondaryUser = await createUser({
        fullName: 'Cliente Inativo',
        email: 'inactive@integration.test',
        role: 'client',
      });

      await query(
        `
          INSERT INTO subscription_plans (
            mp_plan_id,
            name,
            reason,
            frequency,
            frequency_type,
            transaction_amount,
            currency_id,
            is_active,
            status
          )
          VALUES
            ('plan_monthly', 'Plano Mensal', 'Plano Mensal', 1, 'months', 29.90, 'BRL', true, 'authorized'),
            ('plan_old', 'Plano Antigo', 'Plano Antigo', 1, 'months', 19.90, 'BRL', false, 'paused')
        `,
      );

      await query(
        `
          INSERT INTO subscriptions (
            user_id,
            payer_email,
            mp_preapproval_id,
            mp_plan_id,
            reason,
            status,
            provider_status,
            updated_at,
            created_at
          )
          VALUES
            ($1, 'client@integration.test', 'sub_pending', 'plan_monthly', 'Plano Mensal', 'pending', 'active', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 day'),
            ($2, 'inactive@integration.test', 'sub_canceled', 'plan_old', 'Plano Antigo', 'canceled', 'cancelled', NOW(), NOW())
        `,
        [clientUser.id, secondaryUser.id],
      );

      const response = await request(app)
        .get('/api/admin/subscribers?page=1&limit=50')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.data.subscribers.length, 1);
      assert.equal(response.body.data.subscribers[0].email, 'client@integration.test');
      assert.equal(response.body.data.subscribers[0].status, 'pending');
      assert.equal(response.body.data.subscribers[0].is_active, true);
      assert.equal(response.body.data.subscribers[0].is_canceled, false);
      assert.equal(response.body.data.subscribers[0].subscription_state, 'ativa');
      assert.equal(response.body.data.subscribers[0].plan_name, 'Plano Mensal');
      assert.equal(response.body.data.pagination.page, 1);
      assert.equal(response.body.data.pagination.limit, 50);
    });

    test('GET /api/admin/subscriptions works as alias and honors status=all with include_inactive=true', async () => {
      await query(
        `
          INSERT INTO subscription_plans (
            mp_plan_id,
            name,
            reason,
            frequency,
            frequency_type,
            transaction_amount,
            currency_id,
            is_active,
            status
          )
          VALUES ('plan_monthly', 'Plano Mensal', 'Plano Mensal', 1, 'months', 29.90, 'BRL', true, 'authorized')
        `,
      );

      await query(
        `
          INSERT INTO subscriptions (
            user_id,
            payer_email,
            mp_preapproval_id,
            mp_plan_id,
            reason,
            status,
            provider_status,
            updated_at,
            created_at
          )
          VALUES
            ($1, 'client@integration.test', 'sub_authorized', 'plan_monthly', 'Plano Mensal', 'authorized', 'active', NOW(), NOW()),
            ($1, 'client@integration.test', 'sub_cancelled_legacy', 'plan_monthly', 'Plano Mensal', 'cancelled', 'cancelled', NOW() - INTERVAL '10 day', NOW() - INTERVAL '10 day')
        `,
        [clientUser.id],
      );

      const response = await request(app)
        .get('/api/admin/subscriptions?status=all&include_inactive=true')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.data.subscribers.length, 1);
      assert.equal(response.body.data.subscribers[0].status, 'authorized');
    });

    test('admin subscribers endpoint enforces auth and admin role', async () => {
      const unauthenticated = await request(app).get('/api/admin/subscribers');
      assert.equal(unauthenticated.status, 401);

      const forbidden = await request(app)
        .get('/api/admin/subscribers')
        .set('Authorization', `Bearer ${clientToken}`);
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.body.error.code, 'FORBIDDEN_ADMIN_ONLY');
    });

    test('GET /api/payments/subscriptions/me returns prioritized current subscription', async () => {
      await query(
        `
          INSERT INTO subscription_plans (
            mp_plan_id,
            name,
            reason,
            frequency,
            frequency_type,
            transaction_amount,
            currency_id,
            is_active,
            status
          )
          VALUES ('plan_monthly', 'Plano Mensal', 'Plano Mensal', 1, 'months', 29.90, 'BRL', true, 'authorized')
        `,
      );

      await query(
        `
          INSERT INTO subscriptions (
            user_id,
            payer_email,
            mp_preapproval_id,
            mp_plan_id,
            reason,
            status,
            provider_status,
            next_payment_date,
            updated_at,
            created_at
          )
          VALUES
            ($1, 'client@integration.test', 'sub_canceled_newer', 'plan_monthly', 'Plano Mensal', 'canceled', 'cancelled', NOW() + INTERVAL '5 day', NOW(), NOW()),
            ($1, 'client@integration.test', 'sub_authorized_older', 'plan_monthly', 'Plano Mensal', 'authorized', 'active', NOW() + INTERVAL '3 day', NOW() - INTERVAL '2 day', NOW() - INTERVAL '2 day')
        `,
        [clientUser.id],
      );

      const response = await request(app)
        .get('/api/payments/subscriptions/me')
        .set('Authorization', `Bearer ${clientToken}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.data.subscription.mp_preapproval_id, 'sub_canceled_newer');
      assert.equal(response.body.data.subscription.status, 'canceled');
      assert.equal(response.body.data.subscription.is_active, false);
      assert.equal(response.body.data.subscription.is_canceled, true);
      assert.equal(response.body.data.subscription.subscription_state, 'cancelada');
      assert.equal(response.body.data.subscription.preapproval_plan_id, 'plan_monthly');
      assert.equal(response.body.data.subscription.transaction_amount, 29.9);
      assert.deepEqual(response.body.data.subscription.attempts, []);
      assert.deepEqual(response.body.data.subscription.provider_events, []);
    });

    test('GET /api/payments/subscriptions/me returns subscription null when absent', async () => {
      const response = await request(app)
        .get('/api/payments/subscriptions/me')
        .set('Authorization', `Bearer ${clientToken}`);

      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.data.subscription, null);
    });

    test('POST /api/appointments accepts payment_method=assinante_premium', async () => {
      const barber = await createBarber();
      const date = '2026-05-22';
      await createBusinessHour({ barberId: barber.id, date, time: '09:00' });

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          appointment_date: date,
          appointment_time: '09:00',
          service_type: 'corte',
          barber_id: barber.id,
          payment_method: 'assinante_premium',
        });

      assert.equal(response.status, 201);
      assert.equal(response.body.success, true);

      const persisted = await query(
        `
          SELECT payment_method
          FROM appointments
          WHERE id = $1
        `,
        [response.body.data.appointment.id],
      );

      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].payment_method, 'assinante_premium');
    });
  });
}

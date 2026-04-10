import assert from 'node:assert/strict';
import { before, beforeEach, after, describe, test } from 'node:test';

import request from 'supertest';

import app from '../src/app.js';
import { pool, query } from '../src/db/pool.js';
import { signToken } from '../src/utils/jwt.js';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'integration-test-secret';
}

const hasDatabase = Boolean(process.env.DATABASE_URL);

function weekdayFromDate(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function toHourMinute(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function ensureSchema() {
  await query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS business_days (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL UNIQUE,
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS business_hours (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      slot_time TIME NOT NULL,
      is_booked_week BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (weekday, slot_time)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      service_type TEXT NOT NULL DEFAULT 'corte' CHECK (
        service_type IN (
          'corte',
          'barboterapia',
          'corte_barba',
          'sobrancelha',
          'raspado',
          'pezinho',
          'penteado',
          'limpeza_pele',
          'hidratacao',
          'botox',
          'progressiva',
          'relaxamento',
          'luzes',
          'platinado',
          'coloracao'
        )
      ),
      status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'pago', 'disponivel')),
      price NUMERIC(10,2) NOT NULL DEFAULT 50.00,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT appointment_user_status_consistency CHECK (
        (status = 'disponivel' AND user_id IS NULL)
        OR (status IN ('agendado', 'pago') AND user_id IS NOT NULL)
      )
    );

    DROP INDEX IF EXISTS unique_appointment_slot;
    DROP INDEX IF EXISTS unique_active_appointment_slot;

    CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_reserved_slot
      ON appointments (appointment_date, appointment_time)
      WHERE status IN ('agendado', 'pago');
  `);
}

async function resetData() {
  await query('DELETE FROM appointments');
  await query('DELETE FROM business_days');
  await query('DELETE FROM business_hours');
  await query("DELETE FROM users WHERE email LIKE '%@integration.test'");
}

async function createUser(email, role) {
  const result = await query(
    `
      INSERT INTO users (full_name, email, phone, password_hash, role)
      VALUES ($1, $2, '', $3, $4)
      RETURNING id, full_name, email, phone, role, created_at
    `,
    ['Integration User', email, 'hash', role],
  );

  return result.rows[0];
}

async function createHour(weekday, time, isEnabled = true) {
  await query(
    `
      INSERT INTO business_hours (weekday, slot_time)
      VALUES ($1, $2)
      ON CONFLICT (weekday, slot_time)
      DO NOTHING
    `,
    [weekday, time],
  );
}

if (!hasDatabase) {
  test('integration tests skipped without DATABASE_URL', { skip: true }, () => {});
} else {
  describe('appointments integration', () => {
    let clientUser;
    let adminUser;
    let clientToken;

    before(async () => {
      await ensureSchema();
    });

    beforeEach(async () => {
      await resetData();
      clientUser = await createUser('client@integration.test', 'client');
      adminUser = await createUser('admin@integration.test', 'admin');
      clientToken = signToken(clientUser);
    });

    after(async () => {
      await pool.end();
    });

    test('slot available then booking succeeds', async () => {
      const date = '2026-04-15';
      const weekday = weekdayFromDate(date);
      await createHour(weekday, '09:00', true);

      const slotsResponse = await request(app).get(`/api/appointments/slots?date=${date}`);
      assert.equal(slotsResponse.status, 200);
      const slot = slotsResponse.body.data.slots.find((item) => item.appointment_time === '09:00');
      assert.equal(slot.status, 'disponivel');

      const bookResponse = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ appointment_date: date, appointment_time: '09:00', service_type: 'corte' });

      assert.equal(bookResponse.status, 201);
      assert.equal(bookResponse.body.success, true);
      assert.equal(bookResponse.body.data.appointment.status, 'agendado');
    });

    test('reserved slot returns 409 on second booking', async () => {
      const date = '2026-04-16';
      const weekday = weekdayFromDate(date);
      await createHour(weekday, '10:00', true);

      const first = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ appointment_date: date, appointment_time: '10:00', service_type: 'corte' });

      assert.equal(first.status, 201);

      const second = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ appointment_date: date, appointment_time: '10:00', service_type: 'corte' });

      assert.equal(second.status, 409);
      assert.equal(second.body.error.code, 'SLOT_ALREADY_BOOKED');
    });

    test('scheduled slot from weekly rule can be booked when hour exists', async () => {
      const date = '2026-04-17';
      const weekday = weekdayFromDate(date);
      await createHour(weekday, '11:00', true);

      const slotsResponse = await request(app).get(`/api/appointments/slots?date=${date}`);
      assert.equal(slotsResponse.status, 200);
      const slot = slotsResponse.body.data.slots.find((item) => item.appointment_time === '11:00');
      assert.equal(slot.status, 'desabilitado');

      const bookResponse = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ appointment_date: date, appointment_time: '11:00', service_type: 'corte' });

      assert.equal(bookResponse.status, 201);
    });

    test('disabled day blocked in GET and POST', async () => {
      const date = '2026-04-18';
      const weekday = weekdayFromDate(date);
      await createHour(weekday, '12:00', true);

      await query(
        `
          INSERT INTO business_days (date, is_enabled, reason)
          VALUES ($1, false, 'Feriado')
        `,
        [date],
      );

      const slotsResponse = await request(app).get(`/api/appointments/slots?date=${date}`);
      assert.equal(slotsResponse.status, 200);
      const slot = slotsResponse.body.data.slots.find((item) => item.appointment_time === '12:00');
      assert.equal(slot.status, 'desabilitado');

      const bookResponse = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ appointment_date: date, appointment_time: '12:00', service_type: 'corte' });

      assert.equal(bookResponse.status, 400);
      assert.equal(bookResponse.body.error.code, 'DAY_DISABLED');
    });

    test('past time in current business day is blocked', async () => {
      const timezone = process.env.BUSINESS_TIMEZONE || 'America/Sao_Paulo';
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date()).map((part) => [part.type, part.value]),
      );
      const date = `${parts.year}-${parts.month}-${parts.day}`;
      const nowMinutes = Number(parts.hour) * 60 + Number(parts.minute);

      if (nowMinutes <= 1) {
        return;
      }

      const pastTime = toHourMinute(nowMinutes - 1);
      const weekday = weekdayFromDate(date);
      await createHour(weekday, `${pastTime}:00`, true);

      const bookResponse = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ appointment_date: date, appointment_time: pastTime, service_type: 'corte' });

      assert.equal(bookResponse.status, 400);
      assert.equal(bookResponse.body.error.code, 'PAST_APPOINTMENT');
    });

    test('concurrent booking allows only one success', async () => {
      const date = '2026-04-19';
      const weekday = weekdayFromDate(date);
      await createHour(weekday, '13:00', true);

      const call = () =>
        request(app)
          .post('/api/appointments')
          .set('Authorization', `Bearer ${clientToken}`)
          .send({ appointment_date: date, appointment_time: '13:00', service_type: 'corte' });

      const [first, second] = await Promise.all([call(), call()]);
      const statuses = [first.status, second.status].sort((a, b) => a - b);

      assert.deepEqual(statuses, [201, 409]);
      const conflict = first.status === 409 ? first : second;
      assert.equal(conflict.body.error.code, 'SLOT_ALREADY_BOOKED');
    });
  });
}

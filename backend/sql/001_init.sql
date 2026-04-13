CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO public;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL UNIQUE,
  birth_date DATE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_not_null
  ON users (lower(email))
  WHERE email IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_reserved_slot
  ON appointments (appointment_date, appointment_time)
  WHERE status IN ('agendado', 'pago');

CREATE INDEX IF NOT EXISTS idx_appointments_user_id
  ON appointments (user_id);

CREATE INDEX IF NOT EXISTS idx_appointments_date_time
  ON appointments (appointment_date, appointment_time);

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON appointments (status);

CREATE INDEX IF NOT EXISTS idx_business_days_date
  ON business_days (date);

DO $$
BEGIN
  -- Em esquemas novos (com barber_id), a populacao inicial e feita em migracoes posteriores.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'business_hours'
      AND column_name = 'barber_id'
  ) THEN
    INSERT INTO business_hours (weekday, slot_time)
    SELECT source.weekday, source.slot_time
    FROM (
      SELECT
        w AS weekday,
        gs::time AS slot_time
      FROM generate_series(0, 6) AS w
      CROSS JOIN generate_series(
        '2000-01-01 09:00:00'::timestamp,
        '2000-01-01 22:00:00'::timestamp,
        '1 hour'::interval
      ) AS gs
    ) source
    WHERE NOT EXISTS (
      SELECT 1
      FROM business_hours bh
      WHERE bh.weekday = source.weekday
        AND bh.slot_time = source.slot_time
    );
  END IF;
END $$;

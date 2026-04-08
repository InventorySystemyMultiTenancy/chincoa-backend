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

CREATE TABLE IF NOT EXISTS business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  slot_time TIME NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
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
  week_start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('agendado', 'pago', 'disponivel')),
  price NUMERIC(10,2) NOT NULL DEFAULT 45.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointment_user_status_consistency CHECK (
    (status = 'disponivel' AND user_id IS NULL)
    OR (status IN ('agendado', 'pago') AND user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_slot
  ON appointments (appointment_date, appointment_time);

CREATE INDEX IF NOT EXISTS idx_appointments_user_id
  ON appointments (user_id);

CREATE INDEX IF NOT EXISTS idx_appointments_date_time
  ON appointments (appointment_date, appointment_time);

CREATE INDEX IF NOT EXISTS idx_appointments_week_start
  ON appointments (week_start_date);

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON appointments (status);

INSERT INTO business_hours (weekday, slot_time)
SELECT weekday, slot_time
FROM (
  SELECT
    w AS weekday,
    gs::time AS slot_time
  FROM generate_series(0, 6) AS w
  CROSS JOIN generate_series('09:00'::time, '18:00'::time, '1 hour') AS gs
) source
ON CONFLICT (weekday, slot_time) DO NOTHING;

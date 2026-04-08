CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO public;

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

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'pago', 'disponivel')),
  price NUMERIC(10,2) NOT NULL DEFAULT 45.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE appointments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_user_id_fkey;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS week_start_date DATE;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE appointments
  ALTER COLUMN status SET DEFAULT 'disponivel';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointment_user_status_consistency'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointment_user_status_consistency
      CHECK (
        (status = 'disponivel' AND user_id IS NULL)
        OR (status IN ('agendado', 'pago') AND user_id IS NOT NULL)
      ) NOT VALID;
  END IF;
END $$;

UPDATE appointments
SET week_start_date = (
  appointment_date
  - ((EXTRACT(ISODOW FROM appointment_date)::INT - 1) * INTERVAL '1 day')
)::DATE
WHERE week_start_date IS NULL;

ALTER TABLE appointments
  ALTER COLUMN week_start_date SET NOT NULL;

DROP INDEX IF EXISTS unique_active_appointment_slot;

CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_slot
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
  CROSS JOIN generate_series(
    '2000-01-01 09:00:00'::timestamp,
    '2000-01-01 18:00:00'::timestamp,
    '1 hour'::interval
  ) AS gs
) source
ON CONFLICT (weekday, slot_time) DO NOTHING;

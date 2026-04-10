SET search_path TO public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS barbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_barbers_full_name_not_null
  ON barbers (lower(full_name));

INSERT INTO barbers (id, full_name, is_active)
SELECT gen_random_uuid(), 'Barbeiro Padrao', true
WHERE NOT EXISTS (SELECT 1 FROM barbers);

ALTER TABLE business_hours
  ADD COLUMN IF NOT EXISTS barber_id UUID;

UPDATE business_hours
SET barber_id = (
  SELECT id
  FROM barbers
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE barber_id IS NULL;

ALTER TABLE business_hours
  ALTER COLUMN barber_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_hours_barber_id_fkey'
  ) THEN
    ALTER TABLE business_hours
      ADD CONSTRAINT business_hours_barber_id_fkey
      FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE business_hours
  DROP CONSTRAINT IF EXISTS business_hours_weekday_slot_time_key;

DROP INDEX IF EXISTS business_hours_weekday_slot_time_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_hours_weekday_time_barber
  ON business_hours (weekday, slot_time, barber_id);

CREATE INDEX IF NOT EXISTS idx_business_hours_barber_weekday
  ON business_hours (barber_id, weekday, slot_time);

INSERT INTO business_hours (weekday, slot_time, is_booked_week, barber_id)
SELECT template.weekday, template.slot_time, false, b.id
FROM (
  SELECT DISTINCT weekday, slot_time
  FROM business_hours
) template
CROSS JOIN barbers b
ON CONFLICT (weekday, slot_time, barber_id) DO NOTHING;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS barber_id UUID;

UPDATE appointments
SET barber_id = (
  SELECT id
  FROM barbers
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE status IN ('agendado', 'pago')
  AND barber_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_barber_id_fkey'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_barber_id_fkey
      FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointment_barber_status_consistency'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointment_barber_status_consistency
      CHECK (
        (status = 'disponivel' AND barber_id IS NULL)
        OR (status IN ('agendado', 'pago') AND barber_id IS NOT NULL)
      ) NOT VALID;
  END IF;
END $$;

DROP INDEX IF EXISTS unique_appointment_reserved_slot;
DROP INDEX IF EXISTS unique_appointment_reserved_slot_per_barber;

CREATE UNIQUE INDEX IF NOT EXISTS unique_appointment_reserved_slot_per_barber
  ON appointments (appointment_date, appointment_time, barber_id)
  WHERE status IN ('agendado', 'pago');

SET search_path TO public;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_id TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_status TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_provider TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_external_reference TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_idempotency_key TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_updated_at TIMESTAMPTZ;

UPDATE appointments
SET payment_status = COALESCE(payment_status, CASE WHEN status = 'pago' THEN 'approved' ELSE 'pending' END),
    payment_method = COALESCE(payment_method, 'manual'),
    payment_provider = COALESCE(payment_provider, 'none'),
    payment_updated_at = COALESCE(payment_updated_at, NOW())
WHERE payment_status IS NULL
   OR payment_method IS NULL
   OR payment_provider IS NULL
   OR payment_updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_payment_status_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_payment_status_check
      CHECK (payment_status IN ('pending', 'approved', 'rejected', 'canceled')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_payment_method_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_payment_method_check
      CHECK (payment_method IN ('manual', 'pix', 'point_card')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_payment_provider_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_payment_provider_check
      CHECK (payment_provider IN ('none', 'mercado_pago')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_payment_id
  ON appointments (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_payment_intent_id
  ON appointments (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_payment_status
  ON appointments (payment_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_payment_id_not_null
  ON appointments (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_payment_intent_id_not_null
  ON appointments (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('ipn', 'webhook')),
  notification_key TEXT NOT NULL UNIQUE,
  topic TEXT,
  resource_id TEXT,
  payload JSONB,
  processing_status TEXT NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_notifications_source_topic
  ON payment_notifications (source, topic, created_at DESC);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mp_access_token TEXT,
  mp_device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

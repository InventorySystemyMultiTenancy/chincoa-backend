SET search_path TO public;

-- Mantem compatibilidade com payload antigo e novo no campo payment_method.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_payment_method_check'
      AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE appointments
      DROP CONSTRAINT appointments_payment_method_check;
  END IF;

  ALTER TABLE appointments
    ADD CONSTRAINT appointments_payment_method_check
    CHECK (payment_method IN ('manual', 'pix', 'point_card', 'assinante_premium'));
END $$;

-- Indices para consulta de assinatura atual e listagem de assinantes no admin.
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_updated
  ON subscriptions (user_id, status, updated_at DESC, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'mp_plan_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subscriptions_mp_plan_id ON subscriptions (mp_plan_id)';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'preapproval_plan_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subscriptions_preapproval_plan_id ON subscriptions (preapproval_plan_id)';
  END IF;
END $$;

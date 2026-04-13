SET search_path TO public;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

UPDATE subscription_plans
SET name = COALESCE(NULLIF(name, ''), NULLIF(reason, ''), 'Plano mensal')
WHERE name IS NULL OR name = '';

ALTER TABLE subscription_plans
  ALTER COLUMN name SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
  ON subscription_plans (is_active, created_at DESC);

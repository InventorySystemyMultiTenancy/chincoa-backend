SET search_path TO public;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_plan_id TEXT NOT NULL UNIQUE,
  reason TEXT,
  frequency INTEGER NOT NULL,
  frequency_type TEXT NOT NULL CHECK (frequency_type IN ('days', 'months')),
  transaction_amount NUMERIC(10,2) NOT NULL,
  currency_id TEXT NOT NULL DEFAULT 'BRL',
  back_url TEXT,
  status TEXT NOT NULL DEFAULT 'authorized',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_status
  ON subscription_plans (status, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payer_email TEXT NOT NULL,
  mp_preapproval_id TEXT NOT NULL UNIQUE,
  mp_plan_id TEXT,
  external_reference TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'paused', 'cancelled')),
  provider_status TEXT,
  next_payment_date TIMESTAMPTZ,
  back_url TEXT,
  card_token_last4 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user
  ON subscriptions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_external_reference
  ON subscriptions (external_reference);

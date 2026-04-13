SET search_path TO public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_plan_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  reason TEXT,
  frequency INTEGER NOT NULL,
  frequency_type TEXT NOT NULL CHECK (frequency_type IN ('days', 'months')),
  transaction_amount NUMERIC(10,2) NOT NULL,
  currency_id TEXT NOT NULL DEFAULT 'BRL',
  back_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'authorized',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_status
  ON subscription_plans (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
  ON subscription_plans (is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payer_email TEXT NOT NULL,
  mp_preapproval_id TEXT NOT NULL UNIQUE,
  mp_plan_id TEXT,
  external_reference TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'paused', 'canceled')),
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

CREATE TABLE IF NOT EXISTS subscription_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'authorized', 'paused', 'canceled')),
  provider_status TEXT,
  message TEXT,
  amount NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_attempts_subscription
  ON subscription_attempts (subscription_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscription_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider_event_key TEXT,
  type TEXT NOT NULL,
  status TEXT,
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_provider_events_key
  ON subscription_provider_events (provider_event_key)
  WHERE provider_event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_provider_events_subscription
  ON subscription_provider_events (subscription_id, created_at DESC);

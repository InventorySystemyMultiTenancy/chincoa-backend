SET search_path TO public;

-- Normaliza valores legados para o status canonico usado no backend.
UPDATE subscriptions
SET status = 'canceled'
WHERE lower(status) = 'cancelled';

DO $$
DECLARE
  status_check RECORD;
BEGIN
  -- Remove qualquer check legado de status na tabela subscriptions.
  FOR status_check IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'subscriptions'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      AND pg_get_constraintdef(c.oid) ILIKE '%pending%'
      AND pg_get_constraintdef(c.oid) ILIKE '%authorized%'
  LOOP
    EXECUTE format('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS %I', status_check.conname);
  END LOOP;
END $$;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending', 'authorized', 'paused', 'canceled', 'cancelled'));

SET search_path TO public;

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_date DATE;

UPDATE users
SET phone = regexp_replace(COALESCE(phone, ''), '\\D', '', 'g');

WITH ranked_users AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM users
  WHERE phone IS NULL OR btrim(phone) = ''
)
UPDATE users u
SET phone = CONCAT('9', LPAD(r.rn::text, 10, '0'))
FROM ranked_users r
WHERE u.id = r.id;

DO $$
DECLARE
  duplicate_phone RECORD;
BEGIN
  FOR duplicate_phone IN
    SELECT id
    FROM (
      SELECT id,
             phone,
             ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at, id) AS rn
      FROM users
      WHERE phone IS NOT NULL AND btrim(phone) <> ''
    ) d
    WHERE d.rn > 1
  LOOP
    UPDATE users
    SET phone = CONCAT('8', substring(id::text, 1, 10))
    WHERE id = duplicate_phone.id;
  END LOOP;
END $$;

ALTER TABLE users
  ALTER COLUMN phone SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND indexname = 'users_phone_key'
  ) THEN
    CREATE UNIQUE INDEX users_phone_key ON users (phone);
  END IF;
END $$;

DROP INDEX IF EXISTS users_email_key;
DROP INDEX IF EXISTS uq_users_email_not_null;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_not_null
  ON users (lower(email))
  WHERE email IS NOT NULL;

SET search_path TO public;

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_date DATE;

UPDATE users
SET phone = regexp_replace(COALESCE(phone, ''), '\D', '', 'g');

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

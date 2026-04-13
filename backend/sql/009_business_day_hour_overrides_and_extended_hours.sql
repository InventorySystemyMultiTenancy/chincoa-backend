SET search_path TO public;

CREATE TABLE IF NOT EXISTS business_day_hour_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  slot_time TIME NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, slot_time)
);

CREATE INDEX IF NOT EXISTS idx_business_day_hour_overrides_date
  ON business_day_hour_overrides (date, slot_time);

INSERT INTO business_hours (weekday, slot_time, is_booked_week, barber_id)
SELECT w.weekday, t.slot_time, false, b.id
FROM (
  SELECT generate_series(0, 6) AS weekday
) w
CROSS JOIN (
  SELECT gs::time AS slot_time
  FROM generate_series(
    '2000-01-01 09:00:00'::timestamp,
    '2000-01-01 22:00:00'::timestamp,
    '1 hour'::interval
  ) AS gs
) t
CROSS JOIN barbers b
ON CONFLICT (weekday, slot_time, barber_id) DO NOTHING;

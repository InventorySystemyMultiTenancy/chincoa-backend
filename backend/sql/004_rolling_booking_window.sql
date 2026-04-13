SET search_path TO public;

-- Limpeza inicial para manter somente historico recente e janela de agenda futura.
DELETE FROM appointments
WHERE appointment_date < (CURRENT_DATE - INTERVAL '60 days')::date;

DELETE FROM business_days
WHERE date < (CURRENT_DATE - INTERVAL '60 days')::date
   OR date > (CURRENT_DATE + INTERVAL '15 days')::date;

-- Garante que sempre existam dias da agenda do hoje ate os proximos 15 dias.
INSERT INTO business_days (date, is_enabled, reason)
SELECT d::date, true, NULL
FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days', '1 day'::interval) AS d
WHERE NOT EXISTS (
   SELECT 1
   FROM business_days bd
   WHERE bd.date = d::date
);

INSERT INTO system_settings (setting_key, setting_value)
VALUES ('rolling_booking_window_last_run_date', CURRENT_DATE::text)
ON CONFLICT (setting_key)
DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW();

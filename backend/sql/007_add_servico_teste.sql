ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_service_type_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_service_type_check
  CHECK (
    service_type IN (
      'corte',
      'sobrancelha',
      'barba',
      'sobrancelha_cabelo',
      'cabelo_sobrancelha_barba',
      'massagem_facial_toalha',
      'completo',
      'servico_teste'
    )
  );

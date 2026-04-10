UPDATE appointments
SET service_type = CASE
  WHEN service_type IS NULL OR btrim(service_type) = '' THEN 'corte'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'corte' THEN 'corte'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'barboterapia' THEN 'barboterapia'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) IN (
    'corte_barba',
    'corte_e_barba'
  ) THEN 'corte_barba'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'sobrancelha' THEN 'sobrancelha'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'raspado' THEN 'raspado'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'pezinho' THEN 'pezinho'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'penteado' THEN 'penteado'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) IN (
    'limpeza_de_pele',
    'limpeza_pele',
    'massagem_facial',
    'massagem_facial_toalha'
  ) THEN 'limpeza_pele'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'hidratacao' THEN 'hidratacao'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'botox' THEN 'botox'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'progressiva' THEN 'progressiva'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) IN (
    'relaxamento',
    'barba',
    'servico_teste'
  ) THEN 'relaxamento'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'luzes' THEN 'luzes'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'platinado' THEN 'platinado'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) = 'coloracao' THEN 'coloracao'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) IN (
    'sobrancelha_cabelo',
    'sobrancelha_e_cabelo',
    'cabelo_sobrancelha',
    'cabelo_e_sobrancelha'
  ) THEN 'corte'
  WHEN lower(regexp_replace(btrim(service_type), '[^a-z0-9]+', '_', 'g')) IN (
    'cabelo_sobrancelha_barba',
    'cabelo_e_sobrancelha_e_barba',
    'barba_cabelo_sobrancelha',
    'barba_e_cabelo_e_sobrancelha',
    'completo',
    'completo_tudo',
    'tudo'
  ) THEN 'corte_barba'
  ELSE 'corte'
END;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_service_type_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_service_type_check
  CHECK (
    service_type IN (
      'corte',
      'barboterapia',
      'corte_barba',
      'sobrancelha',
      'raspado',
      'pezinho',
      'penteado',
      'limpeza_pele',
      'hidratacao',
      'botox',
      'progressiva',
      'relaxamento',
      'luzes',
      'platinado',
      'coloracao'
    )
  );

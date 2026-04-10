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

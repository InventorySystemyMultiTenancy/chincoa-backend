import { AppError } from './appError.js';

export const SERVICE_CATALOG = Object.freeze([
  { key: 'corte', label: 'Corte', price: 50 },
  { key: 'barboterapia', label: 'Barboterapia', price: 40 },
  { key: 'corte_barba', label: 'Corte & Barba', price: 85 },
  { key: 'sobrancelha', label: 'Sobrancelha', price: 15 },
  { key: 'raspado', label: 'Raspado', price: 25 },
  { key: 'pezinho', label: 'Pezinho', price: 10 },
  { key: 'penteado', label: 'Penteado', price: 25 },
  { key: 'limpeza_pele', label: 'Limpeza de Pele', price: 30 },
  { key: 'hidratacao', label: 'Hidratação', price: 25 },
  { key: 'botox', label: 'Botox', price: 75 },
  { key: 'progressiva', label: 'Progressiva', price: 75 },
  { key: 'relaxamento', label: 'Relaxamento', price: 40 },
  { key: 'luzes', label: 'Luzes', price: 90 },
  { key: 'platinado', label: 'Platinado', price: 125 },
  { key: 'coloracao', label: 'Coloração', price: 40 },
]);

const SERVICE_PRICE_BY_KEY = new Map(SERVICE_CATALOG.map((service) => [service.key, service.price]));
const SERVICE_LABEL_BY_KEY = new Map(SERVICE_CATALOG.map((service) => [service.key, service.label]));

export const SERVICE_KEYS = Object.freeze(SERVICE_CATALOG.map((service) => service.key));

export function normalizeServiceType(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getServicePrice(serviceType) {
  const normalized = normalizeServiceType(serviceType);
  return SERVICE_PRICE_BY_KEY.get(normalized) ?? null;
}

export function getServiceLabel(serviceType) {
  const normalized = normalizeServiceType(serviceType);
  return SERVICE_LABEL_BY_KEY.get(normalized) ?? null;
}

export function assertValidServiceType(serviceType) {
  const normalized = normalizeServiceType(serviceType);

  if (!SERVICE_PRICE_BY_KEY.has(normalized)) {
    throw new AppError('Tipo de servico invalido', 400, 'INVALID_SERVICE_TYPE', {
      accepted: SERVICE_KEYS,
    });
  }

  return normalized;
}

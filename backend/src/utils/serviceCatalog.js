import { AppError } from './appError.js';

export const SERVICE_CATALOG = Object.freeze([
  { key: 'corte', label: 'Corte', price: 50 },
  { key: 'sobrancelha', label: 'Sobrancelha', price: 5 },
  { key: 'barba', label: 'Barba', price: 70 },
  { key: 'sobrancelha_cabelo', label: 'Sobrancelha e Cabelo', price: 55 },
  { key: 'cabelo_sobrancelha_barba', label: 'Cabelo, Sobrancelha e Barba', price: 70 },
  { key: 'massagem_facial_toalha', label: 'Massagem Facial (Toalha)', price: 30 },
  { key: 'completo', label: 'Completo (Tudo)', price: 100 },
]);

const SERVICE_PRICE_BY_KEY = new Map(SERVICE_CATALOG.map((service) => [service.key, service.price]));
const SERVICE_LABEL_BY_KEY = new Map(SERVICE_CATALOG.map((service) => [service.key, service.label]));

export const SERVICE_KEYS = Object.freeze(SERVICE_CATALOG.map((service) => service.key));

export function normalizeServiceType(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
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

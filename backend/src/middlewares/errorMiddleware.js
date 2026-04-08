import { sendError } from '../utils/apiResponse.js';

export function notFoundHandler(_req, res) {
  return sendError(res, 404, 'Rota nao encontrada', 'NOT_FOUND');
}

export function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.message || 'Erro interno no servidor';
  const details = error.details || null;

  if (statusCode >= 500) {
    console.error(error);
  }

  return sendError(res, statusCode, message, code, details);
}

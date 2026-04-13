import { sendError } from '../utils/apiResponse.js';

const appointmentDebugLogs = String(process.env.APPOINTMENT_DEBUG_LOGS || '').trim() === 'true';
const paymentDebugLogs = String(process.env.PAYMENT_DEBUG_LOGS || '').trim() === 'true';

export function notFoundHandler(_req, res) {
  if (paymentDebugLogs && (_req.path.startsWith('/api/payments') || _req.path.startsWith('/api/payment'))) {
    console.log(
      '[payments:not-found]',
      JSON.stringify({
        method: _req.method,
        path: _req.path,
      }),
    );
  }

  return sendError(res, 404, 'Rota nao encontrada', 'NOT_FOUND');
}

export function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.message || 'Erro interno no servidor';
  const details = error.details || null;

  if (
    appointmentDebugLogs
    && (_req.path.startsWith('/api/appointments') || _req.path.startsWith('/api/admin/appointments'))
  ) {
    console.log(
      '[appointments:error]',
      JSON.stringify({
        method: _req.method,
        path: _req.path,
        statusCode,
        code,
        message,
        details,
      }),
    );
  }

  if (statusCode >= 500) {
    console.error(error);
  }

  return sendError(res, statusCode, message, code, details);
}

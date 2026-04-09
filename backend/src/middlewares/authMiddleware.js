import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';
import { verifyToken } from '../utils/jwt.js';

function parseBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    throw new AppError('Token ausente', 401, 'AUTH_TOKEN_EXPIRED');
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Formato de token invalido', 401, 'AUTH_TOKEN_EXPIRED');
  }

  return token;
}

export async function requireAuth(req, _res, next) {
  try {
    const token = parseBearerToken(req.headers.authorization);
    const payload = verifyToken(token);

    const result = await query(
      `
        SELECT id, full_name, email, phone, birth_date, role, created_at
        FROM users
        WHERE id = $1
      `,
      [payload.sub],
    );

    if (result.rowCount === 0) {
      throw new AppError('Usuario nao encontrado', 401, 'AUTH_TOKEN_EXPIRED');
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return next(new AppError('Token invalido ou expirado', 401, 'AUTH_TOKEN_EXPIRED'));
    }

    next(error);
  }
}

export function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(new AppError('Acesso restrito a administradores', 403, 'FORBIDDEN_ADMIN_ONLY'));
  }

  return next();
}

import { query } from '../db/pool.js';
import { AppError } from '../utils/appError.js';
import { verifyToken } from '../utils/jwt.js';

function parseBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    throw new AppError('Token ausente', 401, 'UNAUTHORIZED');
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Formato de token invalido', 401, 'UNAUTHORIZED');
  }

  return token;
}

export async function requireAuth(req, _res, next) {
  try {
    const token = parseBearerToken(req.headers.authorization);
    const payload = verifyToken(token);

    const result = await query(
      `
        SELECT id, full_name, email, phone, role, created_at
        FROM users
        WHERE id = $1
      `,
      [payload.sub],
    );

    if (result.rowCount === 0) {
      throw new AppError('Usuario nao encontrado', 401, 'UNAUTHORIZED');
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(new AppError('Acesso restrito a administradores', 403, 'FORBIDDEN'));
  }

  return next();
}

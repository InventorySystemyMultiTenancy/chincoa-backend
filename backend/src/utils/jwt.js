import jwt from 'jsonwebtoken';

import { AppError } from './appError.js';

const TOKEN_TTL = '7d';

export function signToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError('JWT_SECRET nao configurado', 500, 'JWT_SECRET_MISSING');
  }

  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
    },
    secret,
    { expiresIn: TOKEN_TTL },
  );
}

export function verifyToken(token) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AppError('JWT_SECRET nao configurado', 500, 'JWT_SECRET_MISSING');
  }

  return jwt.verify(token, secret);
}

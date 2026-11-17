import { createHash, randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';

export interface AuthUser {
  id: number;
  role: 'customer' | 'owner';
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: String(user.id),
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof payload === 'string' || !payload.sub) return null;
    if (payload.role !== 'customer' && payload.role !== 'owner') return null;
    return { id: Number(payload.sub), role: payload.role };
  } catch {
    return null;
  }
}

/** Refresh tokens are opaque random strings; the database only keeps their hash. */
export function createRefreshToken() {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

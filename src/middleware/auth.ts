import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken, type AuthUser } from '../modules/auth/tokens.js';
import { forbidden, unauthorized } from '../lib/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(unauthorized());
  }

  const user = verifyAccessToken(header.slice(7));
  if (!user) {
    return next(unauthorized('Access token is invalid or expired'));
  }

  req.user = user;
  next();
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(forbidden());
    }
    next();
  };
}

/** For handlers behind `authenticate`: returns the user or fails loudly if the middleware is missing. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

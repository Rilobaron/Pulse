import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';

interface TokenPayload {
  sub: string;
  email: string;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or malformed Authorization header'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    if (!payload.sub) {
      next(new UnauthorizedError('Invalid token payload'));
      return;
    }
    req.userId = payload.sub;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: 'Route not found' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  // Mongoose invalid ObjectId / cast errors
  if (err instanceof Error && err.name === 'CastError') {
    res.status(400).json({ message: 'Invalid identifier' });
    return;
  }

  console.error('[error]', err);
  res.status(500).json({
    message: env.isProduction ? 'Internal server error' : (err as Error)?.message ?? 'Internal server error',
  });
}

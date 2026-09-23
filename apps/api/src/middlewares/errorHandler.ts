import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { NotificationProviderError } from '../providers/types.js';
import { logger, sanitizeError } from '../utils/logger.js';

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

  // Invalid notification target (e.g. malformed Discord webhook) — a user
  // mistake in create/update, not a server failure.
  if (err instanceof NotificationProviderError) {
    res.status(400).json({ message: err.message });
    return;
  }

  // Mongoose invalid ObjectId / cast errors
  if (err instanceof Error && err.name === 'CastError') {
    res.status(400).json({ message: 'Invalid identifier' });
    return;
  }

  // body-parser (malformed JSON, oversized body) sets `status` + `type`.
  const parseErr = err as { status?: number; type?: string };
  if (parseErr?.status === 400) {
    res.status(400).json({
      message:
        parseErr.type === 'entity.parse.failed'
          ? 'Invalid JSON in request body'
          : 'Invalid request body',
    });
    return;
  }

  // Unique-index race that beat the pre-check (duplicate email / slug).
  if (err instanceof Error && (err as { code?: number }).code === 11000) {
    res.status(409).json({ message: 'This record already exists' });
    return;
  }

  // Through the redacting logger — raw console.error would bypass it and
  // could echo connection URIs or provider URLs from error messages.
  logger.error('unhandled_error', {
    name: err instanceof Error ? err.name : typeof err,
    message: sanitizeError(err),
  });
  const fallback = 'Something went wrong. Please try again.';
  res.status(500).json({
    message: env.isProduction ? fallback : ((err as Error)?.message ?? fallback),
  });
}

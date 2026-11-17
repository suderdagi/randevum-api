import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// PostgreSQL error codes we translate into meaningful HTTP responses
const PG_UNIQUE_VIOLATION = '23505';
const PG_EXCLUSION_VIOLATION = '23P01';
const PG_FOREIGN_KEY_VIOLATION = '23503';

function isPgError(error: unknown): error is { code: string; constraint?: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string';
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

// Express recognises error handlers by their four arguments
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
  }

  if (isPgError(error)) {
    if (error.code === PG_EXCLUSION_VIOLATION && error.constraint === 'appointments_no_overlap') {
      return res.status(409).json({ error: { code: 'SLOT_TAKEN', message: 'This time slot is no longer available' } });
    }
    if (error.code === PG_UNIQUE_VIOLATION) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these values already exists' } });
    }
    if (error.code === PG_FOREIGN_KEY_VIOLATION) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'A referenced record does not exist' } });
    }
  }

  logger.error({ err: error, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}

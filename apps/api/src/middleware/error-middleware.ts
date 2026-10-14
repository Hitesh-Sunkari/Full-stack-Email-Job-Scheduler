import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || undefined;

  // Zod validation errors
  if (err instanceof ZodError) {
    const formatted = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request input parameters.',
        details: formatted,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
    return;
  }

  // Standard Error
  const errorObj = err as Error;
  logger.error({ err: errorObj, url: req.url, method: req.method }, 'Unhandled Express API Error');

  const statusCode =
    errorObj.message.includes('not found') ? 404 :
    errorObj.message.includes('unauthorized') || errorObj.message.includes('Unauthorized') ? 401 :
    errorObj.message.includes('already') || errorObj.message.includes('Cannot cancel') ? 400 : 500;

  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
      message: errorObj.message || 'An unexpected error occurred.',
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  });
}

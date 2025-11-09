/**
 * Global Error Handler Middleware
 *
 * Catches all errors and formats them consistently
 */

import { Request, Response, NextFunction } from 'express';
import { APIError, createErrorResponse, ErrorCode } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(
  err: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error
  logger.error('Request error', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
    userId: req.user?.id,
  });

  // Determine status code
  const statusCode = err instanceof APIError ? err.statusCode : 500;

  // Track error metrics
  const errorCode = err instanceof APIError ? err.code : ErrorCode.INTERNAL_SERVER_ERROR;
  req.metricsTracker?.finish(statusCode, errorCode);

  // Include stack trace only in development
  const includeStack = process.env.NODE_ENV === 'development';

  // Create error response
  const errorResponse = createErrorResponse(err, req.requestId, includeStack);

  res.status(statusCode).json(errorResponse);
}

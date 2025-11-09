/**
 * Request Logger Middleware
 *
 * Logs all HTTP requests with structured logging
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Capture the original end function
  const originalEnd = res.end;

  // Override res.end to log when response is sent
  res.end = function (chunk?: any, encoding?: any, callback?: any): Response {
    const duration = Date.now() - req.startTime;

    // Log the request
    logger.logRequest({
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
      statusCode: res.statusCode,
      duration,
    });

    // Finish metrics tracking
    req.metricsTracker?.finish(res.statusCode);

    // Call the original end function
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
}

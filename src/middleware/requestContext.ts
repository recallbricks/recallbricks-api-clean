/**
 * Request Context Middleware
 *
 * Adds request ID and metrics tracking to all requests
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { MetricsTracker } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
      metricsTracker: MetricsTracker;
    }
  }
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate unique request ID
  req.requestId = req.headers['x-request-id'] as string || randomUUID();
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);

  // Create metrics tracker
  const route = req.route?.path || req.path;
  req.metricsTracker = new MetricsTracker(req.method, route);

  // Log incoming request
  logger.debug('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  next();
}

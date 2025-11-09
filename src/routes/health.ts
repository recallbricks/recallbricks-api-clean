/**
 * Health Check Routes
 *
 * Production-grade health endpoints for monitoring and load balancers
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { dbCircuitBreaker } from '../utils/circuitBreaker.js';
import { register } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /health
 * Basic liveness check - is the service running?
 * Returns 200 if the service is alive
 */
router.get('/health', async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    service: 'recallbricks-api',
  });
});

/**
 * GET /health/ready
 * Readiness check - is the service ready to accept traffic?
 * Checks database connection and circuit breaker state
 * Returns 200 if ready, 503 if not ready
 */
router.get('/health/ready', async (req: Request, res: Response): Promise<void> => {
  const checks: {
    database: { status: string; latency?: number; error?: string };
    circuitBreaker: { state: string; failures: number };
    overall: string;
  } = {
    database: { status: 'unknown' },
    circuitBreaker: { state: 'unknown', failures: 0 },
    overall: 'unknown',
  };

  try {
    // Check database connection
    const dbStart = Date.now();
    try {
      const { error } = await supabase
        .from('memories')
        .select('id', { head: true, count: 'exact' });

      const latency = Date.now() - dbStart;

      if (error) {
        checks.database = {
          status: 'unhealthy',
          latency,
          error: error.message,
        };
      } else {
        checks.database = {
          status: 'healthy',
          latency,
        };
      }
    } catch (dbError: any) {
      checks.database = {
        status: 'unhealthy',
        error: dbError.message,
      };
    }

    // Check circuit breaker state
    const cbStats = dbCircuitBreaker.getStats();
    checks.circuitBreaker = {
      state: cbStats.state,
      failures: cbStats.failures,
    };

    // Determine overall health
    const isHealthy =
      checks.database.status === 'healthy' &&
      cbStats.state !== 'OPEN';

    checks.overall = isHealthy ? 'ready' : 'not_ready';

    const statusCode = isHealthy ? 200 : 503;

    logger.info('Readiness check completed', {
      requestId: req.requestId,
      status: checks.overall,
      dbStatus: checks.database.status,
      cbState: cbStats.state,
    });

    res.status(statusCode).json({
      status: checks.overall,
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      checks,
    });
  } catch (error: any) {
    logger.error('Readiness check failed', {
      requestId: req.requestId,
      error: error.message,
    });

    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      error: error.message,
      checks,
    });
  }
});

/**
 * GET /health/metrics
 * Prometheus metrics endpoint
 * Returns metrics in Prometheus format
 */
router.get('/health/metrics', async (req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.status(200).send(metrics);
  } catch (error: any) {
    logger.error('Failed to generate metrics', {
      requestId: req.requestId,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to generate metrics',
      message: error.message,
    });
  }
});

export default router;

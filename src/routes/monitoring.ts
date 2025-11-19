/**
 * Monitoring Routes
 * Health checks, metrics, and SLA endpoints
 */

import { Router, Request, Response } from 'express';
import { healthCheckService } from '../services/healthCheck.js';
import { metricsCollector } from '../services/metricsCollector.js';
import { auditLogger } from '../services/auditLogger.js';

const router = Router();

/**
 * GET /api/v1/monitoring/health
 * Comprehensive health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await healthCheckService.performHealthCheck();

    // Set appropriate HTTP status based on health
    const statusCode =
      health.status === 'healthy' ? 200 :
      health.status === 'degraded' ? 200 : // Still operational
      503; // Service unavailable

    res.status(statusCode).json(health);
  } catch (error: any) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/monitoring/health/simple
 * Simple health check for load balancers
 */
router.get('/health/simple', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/monitoring/metrics
 * Prometheus-compatible metrics endpoint
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const prometheusFormat = await metricsCollector.exportPrometheusMetrics();

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(prometheusFormat);
  } catch (error: any) {
    console.error('Metrics collection error:', error);
    res.status(500).json({
      error: 'Failed to collect metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/monitoring/metrics/json
 * JSON format metrics for easier consumption
 */
router.get('/metrics/json', async (req: Request, res: Response) => {
  try {
    const metrics = await metricsCollector.collectMetrics();
    res.json(metrics);
  } catch (error: any) {
    console.error('Metrics collection error:', error);
    res.status(500).json({
      error: 'Failed to collect metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/monitoring/sla
 * SLA metrics endpoint
 * Query params: period (1h, 24h, 7d, 30d)
 */
router.get('/sla', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as '1h' | '24h' | '7d' | '30d') || '1h';

    // Validate period
    if (!['1h', '24h', '7d', '30d'].includes(period)) {
      return res.status(400).json({
        error: 'Invalid period',
        message: 'Period must be one of: 1h, 24h, 7d, 30d',
      });
    }

    const sla = await healthCheckService.calculateSLA(period);
    res.json(sla);
  } catch (error: any) {
    console.error('SLA calculation error:', error);
    res.status(500).json({
      error: 'Failed to calculate SLA',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/monitoring/audit/logs
 * Query audit logs
 * Query params: event_type, category, severity, limit, success
 */
router.get('/audit/logs', async (req: Request, res: Response) => {
  try {
    const logs = await auditLogger.queryLogs({
      event_type: req.query.event_type as any,
      event_category: req.query.event_category as any,
      severity: req.query.severity as any,
      success: req.query.success === 'true' ? true : req.query.success === 'false' ? false : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
    });

    res.json({
      total: logs.length,
      logs,
    });
  } catch (error: any) {
    console.error('Audit log query error:', error);
    res.status(500).json({
      error: 'Failed to query audit logs',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/monitoring/audit/stats
 * Audit log statistics
 */
router.get('/audit/stats', async (req: Request, res: Response) => {
  try {
    const period = req.query.period || '24h';
    const hoursMap: Record<string, number> = {
      '1h': 1,
      '24h': 24,
      '7d': 168,
      '30d': 720,
    };

    const hoursBack = hoursMap[period as string] || 24;
    const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [
      totalEvents,
      errorEvents,
      collaborationEvents,
      learningEvents,
      performanceEvents,
    ] = await Promise.all([
      auditLogger.queryLogs({ start_time: startTime, limit: 10000 }),
      auditLogger.queryLogs({ start_time: startTime, success: false, limit: 1000 }),
      auditLogger.queryLogs({ start_time: startTime, event_category: 'collaboration', limit: 1000 }),
      auditLogger.queryLogs({ start_time: startTime, event_category: 'learning', limit: 1000 }),
      auditLogger.queryLogs({ start_time: startTime, event_category: 'performance', limit: 1000 }),
    ]);

    res.json({
      period,
      stats: {
        total_events: totalEvents.length,
        error_events: errorEvents.length,
        error_rate: totalEvents.length > 0 ? (errorEvents.length / totalEvents.length) * 100 : 0,
        events_by_category: {
          collaboration: collaborationEvents.length,
          learning: learningEvents.length,
          performance: performanceEvents.length,
        },
      },
    });
  } catch (error: any) {
    console.error('Audit stats error:', error);
    res.status(500).json({
      error: 'Failed to get audit stats',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/monitoring/test/audit
 * Test audit logging (development only)
 */
router.post('/test/audit', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Test endpoint not available in production',
    });
  }

  try {
    const auditId = await auditLogger.logEvent({
      event_type: 'health_check',
      event_category: 'performance',
      severity: 'info',
      event_data: {
        test: true,
        message: 'Test audit event',
      },
      success: true,
    });

    res.json({
      success: true,
      audit_id: auditId,
      message: 'Test audit event created',
    });
  } catch (error: any) {
    console.error('Test audit error:', error);
    res.status(500).json({
      error: 'Failed to create test audit event',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/monitoring/components
 * Individual component health checks
 */
router.get('/components/:component', async (req: Request, res: Response) => {
  try {
    const { component } = req.params;

    let result: any;

    switch (component) {
      case 'database':
        result = await healthCheckService['checkDatabase']();
        break;
      case 'learning':
        result = await healthCheckService['checkLearningSystem']();
        break;
      case 'collaboration':
        result = await healthCheckService['checkCollaborationSystem']();
        break;
      case 'graph':
        result = await healthCheckService['checkMemoryGraph']();
        break;
      default:
        return res.status(404).json({
          error: 'Component not found',
          available_components: ['database', 'learning', 'collaboration', 'graph'],
        });
    }

    const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(result);
  } catch (error: any) {
    console.error('Component health check error:', error);
    res.status(500).json({
      error: 'Failed to check component health',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/monitoring/ready
 * Readiness probe for Kubernetes
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const health = await healthCheckService.performHealthCheck();

    if (health.status === 'unhealthy') {
      return res.status(503).json({
        ready: false,
        reason: 'System unhealthy',
      });
    }

    res.status(200).json({
      ready: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      ready: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/monitoring/live
 * Liveness probe for Kubernetes
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
  });
});

export default router;

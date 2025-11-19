/**
 * Enterprise Monitoring & Alerting Service
 * Prometheus metrics + custom alerting
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from '../utils/logger.js';

// Create registry
export const register = new Registry();

// ============================================================================
// PROMETHEUS METRICS
// ============================================================================

/**
 * HTTP Request metrics
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Phase 2 endpoint metrics
 */
export const predictionDuration = new Histogram({
  name: 'prediction_duration_seconds',
  help: 'Duration of prediction requests',
  buckets: [0.1, 0.2, 0.3, 0.5, 0.7, 1],
  registers: [register],
});

export const suggestionDuration = new Histogram({
  name: 'suggestion_duration_seconds',
  help: 'Duration of suggestion requests',
  buckets: [0.1, 0.2, 0.3, 0.5, 0.7, 1],
  registers: [register],
});

export const maintenanceDuration = new Histogram({
  name: 'maintenance_duration_seconds',
  help: 'Duration of maintenance requests',
  buckets: [0.5, 1, 2, 3, 5, 10],
  registers: [register],
});

/**
 * Cache metrics
 */
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['tier'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['tier'],
  registers: [register],
});

export const cacheSize = new Gauge({
  name: 'cache_size',
  help: 'Current cache size',
  labelNames: ['tier'],
  registers: [register],
});

/**
 * Database metrics
 */
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['query_type'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2],
  registers: [register],
});

export const dbConnectionsActive = new Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

export const dbQueryErrors = new Counter({
  name: 'db_query_errors_total',
  help: 'Total database query errors',
  labelNames: ['error_type'],
  registers: [register],
});

/**
 * Circuit breaker metrics
 */
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['breaker_name'],
  registers: [register],
});

export const circuitBreakerFailures = new Counter({
  name: 'circuit_breaker_failures_total',
  help: 'Total circuit breaker failures',
  labelNames: ['breaker_name'],
  registers: [register],
});

/**
 * Rate limiter metrics
 */
export const rateLimitRejects = new Counter({
  name: 'rate_limit_rejects_total',
  help: 'Total rate limit rejections',
  labelNames: ['limiter_type'],
  registers: [register],
});

/**
 * Learning system metrics
 */
export const temporalPatternsDetected = new Counter({
  name: 'temporal_patterns_detected_total',
  help: 'Total temporal patterns detected',
  labelNames: ['pattern_type'],
  registers: [register],
});

export const userWeightAdjustments = new Counter({
  name: 'user_weight_adjustments_total',
  help: 'Total user weight adjustments',
  registers: [register],
});

export const predictionAccuracy = new Gauge({
  name: 'prediction_accuracy',
  help: 'Prediction accuracy score (0-1)',
  registers: [register],
});

// ============================================================================
// CUSTOM ALERTING
// ============================================================================

export interface Alert {
  name: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  labels: Record<string, string>;
}

export class AlertManager {
  private static alerts: Alert[] = [];
  private static readonly MAX_ALERTS = 1000;
  private static readonly ALERT_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Trigger alert
   */
  static trigger(alert: Omit<Alert, 'timestamp'>): void {
    const fullAlert: Alert = {
      ...alert,
      timestamp: new Date(),
    };

    this.alerts.push(fullAlert);

    // Log alert
    const logLevel = alert.severity === 'critical' ? 'error' :
                     alert.severity === 'warning' ? 'warn' : 'info';

    logger[logLevel](`ALERT [${alert.severity.toUpperCase()}]: ${alert.name} - ${alert.message}`, alert.labels);

    // Trim old alerts
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS);
    }

    // Clean old alerts
    this.cleanOldAlerts();
  }

  /**
   * Get recent alerts
   */
  static getRecent(limit: number = 100): Alert[] {
    return this.alerts.slice(-limit).reverse();
  }

  /**
   * Get alerts by severity
   */
  static getBySeverity(severity: 'info' | 'warning' | 'critical'): Alert[] {
    return this.alerts.filter(a => a.severity === severity);
  }

  /**
   * Clean old alerts
   */
  private static cleanOldAlerts(): void {
    const now = Date.now();
    this.alerts = this.alerts.filter(
      a => now - a.timestamp.getTime() < this.ALERT_TTL
    );
  }
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastCheck: Date;
  responseTime?: number;
}

export class HealthMonitor {
  private static checks = new Map<string, HealthCheck>();

  /**
   * Register health check
   */
  static async registerCheck(
    name: string,
    checkFn: () => Promise<{ healthy: boolean; message?: string }>
  ): Promise<void> {
    const start = Date.now();

    try {
      const result = await checkFn();
      const responseTime = Date.now() - start;

      this.checks.set(name, {
        name,
        status: result.healthy ? 'healthy' : 'unhealthy',
        message: result.message,
        lastCheck: new Date(),
        responseTime,
      });

      // Alert if unhealthy
      if (!result.healthy) {
        AlertManager.trigger({
          name: `Health Check Failed: ${name}`,
          severity: 'critical',
          message: result.message || 'Health check failed',
          labels: { check: name },
        });
      }
    } catch (error) {
      this.checks.set(name, {
        name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date(),
      });

      AlertManager.trigger({
        name: `Health Check Error: ${name}`,
        severity: 'critical',
        message: error instanceof Error ? error.message : 'Unknown error',
        labels: { check: name },
      });
    }
  }

  /**
   * Get all health checks
   */
  static getAll(): HealthCheck[] {
    return Array.from(this.checks.values());
  }

  /**
   * Get overall health status
   */
  static getOverallStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const checks = Array.from(this.checks.values());

    if (checks.some(c => c.status === 'unhealthy')) {
      return 'unhealthy';
    }

    if (checks.some(c => c.status === 'degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }
}

// ============================================================================
// SLA MONITORING
// ============================================================================

export class SLAMonitor {
  private static readonly SLA_TARGETS = {
    availability: 0.999,           // 99.9% uptime
    latencyP95: 500,               // 500ms p95
    latencyP99: 1000,              // 1s p99
    errorRate: 0.01,               // 1% error rate
  };

  private static metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    totalLatency: 0,
    latencies: [] as number[],
  };

  /**
   * Record request
   */
  static recordRequest(success: boolean, latencyMs: number): void {
    this.metrics.totalRequests++;

    if (success) {
      this.metrics.successfulRequests++;
    }

    this.metrics.totalLatency += latencyMs;
    this.metrics.latencies.push(latencyMs);

    // Keep only last 10000 latencies
    if (this.metrics.latencies.length > 10000) {
      this.metrics.latencies = this.metrics.latencies.slice(-10000);
    }

    // Check SLA violations
    this.checkSLAViolations();
  }

  /**
   * Check for SLA violations
   */
  private static checkSLAViolations(): void {
    // Availability
    const availability = this.metrics.successfulRequests / this.metrics.totalRequests;
    if (availability < this.SLA_TARGETS.availability) {
      AlertManager.trigger({
        name: 'SLA Violation: Availability',
        severity: 'critical',
        message: `Availability ${(availability * 100).toFixed(2)}% below target ${(this.SLA_TARGETS.availability * 100).toFixed(2)}%`,
        labels: { metric: 'availability' },
      });
    }

    // Error rate
    const errorRate = 1 - availability;
    if (errorRate > this.SLA_TARGETS.errorRate) {
      AlertManager.trigger({
        name: 'SLA Violation: Error Rate',
        severity: 'critical',
        message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds target ${(this.SLA_TARGETS.errorRate * 100).toFixed(2)}%`,
        labels: { metric: 'error_rate' },
      });
    }

    // Latency p95
    const p95 = this.calculatePercentile(0.95);
    if (p95 > this.SLA_TARGETS.latencyP95) {
      AlertManager.trigger({
        name: 'SLA Violation: Latency P95',
        severity: 'warning',
        message: `P95 latency ${p95.toFixed(0)}ms exceeds target ${this.SLA_TARGETS.latencyP95}ms`,
        labels: { metric: 'latency_p95' },
      });
    }

    // Latency p99
    const p99 = this.calculatePercentile(0.99);
    if (p99 > this.SLA_TARGETS.latencyP99) {
      AlertManager.trigger({
        name: 'SLA Violation: Latency P99',
        severity: 'warning',
        message: `P99 latency ${p99.toFixed(0)}ms exceeds target ${this.SLA_TARGETS.latencyP99}ms`,
        labels: { metric: 'latency_p99' },
      });
    }
  }

  /**
   * Calculate percentile
   */
  private static calculatePercentile(p: number): number {
    if (this.metrics.latencies.length === 0) return 0;

    const sorted = [...this.metrics.latencies].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * p);
    return sorted[index];
  }

  /**
   * Get SLA metrics
   */
  static getMetrics() {
    const availability = this.metrics.totalRequests > 0
      ? this.metrics.successfulRequests / this.metrics.totalRequests
      : 1;

    const avgLatency = this.metrics.totalRequests > 0
      ? this.metrics.totalLatency / this.metrics.totalRequests
      : 0;

    return {
      availability,
      errorRate: 1 - availability,
      avgLatency,
      p95: this.calculatePercentile(0.95),
      p99: this.calculatePercentile(0.99),
      totalRequests: this.metrics.totalRequests,
      targets: this.SLA_TARGETS,
      violations: {
        availability: availability < this.SLA_TARGETS.availability,
        latencyP95: this.calculatePercentile(0.95) > this.SLA_TARGETS.latencyP95,
        latencyP99: this.calculatePercentile(0.99) > this.SLA_TARGETS.latencyP99,
        errorRate: (1 - availability) > this.SLA_TARGETS.errorRate,
      },
    };
  }
}

// ============================================================================
// MONITORING ROUTES
// ============================================================================

import { Router } from 'express';

export const monitoringRouter = Router();

/**
 * GET /metrics - Prometheus metrics
 */
monitoringRouter.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

/**
 * GET /health - Health check
 */
monitoringRouter.get('/health', (req, res) => {
  const status = HealthMonitor.getOverallStatus();

  res.status(status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503).json({
    status,
    checks: HealthMonitor.getAll(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /alerts - Recent alerts
 */
monitoringRouter.get('/alerts', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const severity = req.query.severity as 'info' | 'warning' | 'critical' | undefined;

  const alerts = severity
    ? AlertManager.getBySeverity(severity)
    : AlertManager.getRecent(limit);

  res.json({
    alerts,
    count: alerts.length,
  });
});

/**
 * GET /sla - SLA metrics
 */
monitoringRouter.get('/sla', (req, res) => {
  res.json(SLAMonitor.getMetrics());
});

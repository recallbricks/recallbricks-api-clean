/**
 * Metrics and Observability
 *
 * Track request performance, database queries, and error rates
 */

import { register, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from './logger.js';

// Enable default metrics (CPU, memory, event loop, etc.)
import { collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics({ prefix: 'recallbricks_' });

// HTTP Request Metrics
export const httpRequestDuration = new Histogram({
  name: 'recallbricks_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

export const httpRequestTotal = new Counter({
  name: 'recallbricks_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestErrors = new Counter({
  name: 'recallbricks_http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_code'],
});

// Database Metrics
export const dbQueryDuration = new Histogram({
  name: 'recallbricks_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const dbQueryTotal = new Counter({
  name: 'recallbricks_db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
});

export const dbConnectionsActive = new Gauge({
  name: 'recallbricks_db_connections_active',
  help: 'Number of active database connections',
});

// Circuit Breaker Metrics
export const circuitBreakerState = new Gauge({
  name: 'recallbricks_circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  labelNames: ['name'],
});

export const circuitBreakerFailures = new Counter({
  name: 'recallbricks_circuit_breaker_failures_total',
  help: 'Total number of circuit breaker failures',
  labelNames: ['name'],
});

// Rate Limit Metrics
export const rateLimitHits = new Counter({
  name: 'recallbricks_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['type'],
});

// Memory Metrics
export const memoriesCreated = new Counter({
  name: 'recallbricks_memories_created_total',
  help: 'Total number of memories created',
});

export const memoriesQueried = new Counter({
  name: 'recallbricks_memories_queried_total',
  help: 'Total number of memory queries',
});

// Metrics helper class
export class MetricsTracker {
  private startTime: number;
  private method: string;
  private route: string;

  constructor(method: string, route: string) {
    this.method = method;
    this.route = route;
    this.startTime = Date.now();
  }

  finish(statusCode: number, errorCode?: string): void {
    const duration = (Date.now() - this.startTime) / 1000;

    // Record duration
    httpRequestDuration.observe(
      { method: this.method, route: this.route, status_code: statusCode.toString() },
      duration
    );

    // Count request
    httpRequestTotal.inc({
      method: this.method,
      route: this.route,
      status_code: statusCode.toString(),
    });

    // Count error if applicable
    if (errorCode) {
      httpRequestErrors.inc({
        method: this.method,
        route: this.route,
        error_code: errorCode,
      });
    }
  }
}

export class DBMetricsTracker {
  private startTime: number;
  private operation: string;
  private table: string;

  constructor(operation: string, table: string) {
    this.operation = operation;
    this.table = table;
    this.startTime = Date.now();
  }

  finish(success: boolean): void {
    const duration = (Date.now() - this.startTime) / 1000;

    dbQueryDuration.observe(
      { operation: this.operation, table: this.table },
      duration
    );

    dbQueryTotal.inc({
      operation: this.operation,
      table: this.table,
      status: success ? 'success' : 'error',
    });

    logger.debug('Database query completed', {
      operation: this.operation,
      table: this.table,
      duration,
      success,
    });
  }
}

// Export the registry for the /metrics endpoint
export { register };

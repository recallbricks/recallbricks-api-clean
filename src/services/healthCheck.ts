/**
 * Health Check Service
 * Comprehensive system health monitoring
 */

import { supabase } from '../config/supabase.js';
import { auditLogger } from './auditLogger.js';

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  last_check: string;
  response_time_ms: number;
  error_count_24h: number;
  message?: string;
  details?: Record<string, any>;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime_seconds: number;
  version: string;
  components: {
    database: ComponentHealth;
    learning_system: ComponentHealth;
    collaboration_system: ComponentHealth;
    memory_graph: ComponentHealth;
  };
  metrics: {
    requests_per_second: number;
    avg_response_time_ms: number;
    error_rate: number;
  };
  sla: {
    availability_percent: number;
    p95_latency_ms: number;
    target_met: boolean;
  };
}

export interface SLAMetrics {
  period: '1h' | '24h' | '7d' | '30d';
  availability: {
    target: number;
    actual: number;
    met: boolean;
    downtime_minutes: number;
  };
  latency: {
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    target_p95_ms: number;
    met: boolean;
  };
  error_rate: {
    target: number;
    actual: number;
    met: boolean;
    total_errors: number;
    total_requests: number;
  };
  overall_sla_met: boolean;
}

class HealthCheckService {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResponse> {
    const checkStart = Date.now();

    // Run all component checks in parallel
    const [database, learning, collaboration, memoryGraph] = await Promise.all([
      this.checkDatabase(),
      this.checkLearningSystem(),
      this.checkCollaborationSystem(),
      this.checkMemoryGraph(),
    ]);

    // Get overall metrics
    const metrics = await this.getSystemMetrics();
    const sla = await this.calculateSLA('1h');

    // Determine overall status
    const componentStatuses = [database, learning, collaboration, memoryGraph].map(
      (c) => c.status
    );
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

    if (componentStatuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (componentStatuses.includes('degraded')) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '2.0.0',
      components: {
        database,
        learning_system: learning,
        collaboration_system: collaboration,
        memory_graph: memoryGraph,
      },
      metrics,
      sla: {
        availability_percent: sla.availability.actual,
        p95_latency_ms: sla.latency.p95_ms,
        target_met: sla.overall_sla_met,
      },
    };

    // Log health check
    await auditLogger.logHealthCheck({
      status: overallStatus,
      response_time_ms: Date.now() - checkStart,
      details: response,
    });

    return response;
  }

  /**
   * Check database health
   */
  async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const { data, error } = await supabase.from('memories').select('id').limit(1);

      if (error) throw error;

      const responseTime = Date.now() - start;
      const errorCount = await auditLogger.getErrorCount24h('performance');

      return {
        status: responseTime < 100 ? 'healthy' : responseTime < 500 ? 'degraded' : 'unhealthy',
        last_check: new Date().toISOString(),
        response_time_ms: responseTime,
        error_count_24h: errorCount,
        message: `Query time: ${responseTime}ms`,
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        last_check: new Date().toISOString(),
        response_time_ms: Date.now() - start,
        error_count_24h: await auditLogger.getErrorCount24h('performance'),
        message: `Database error: ${err.message}`,
      };
    }
  }

  /**
   * Check learning system health
   */
  async checkLearningSystem(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const { data: patterns, error } = await supabase
        .from('temporal_patterns')
        .select('id, last_seen, occurrences')
        .gte('last_seen', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(10);

      if (error) throw error;

      const isLearning = patterns && patterns.length > 0;
      const responseTime = Date.now() - start;
      const totalOccurrences = patterns?.reduce((sum: number, p: any) => sum + (p.occurrences || 0), 0) || 0;

      return {
        status: isLearning ? 'healthy' : 'degraded',
        last_check: new Date().toISOString(),
        response_time_ms: responseTime,
        error_count_24h: 0,
        message: isLearning
          ? `${patterns.length} patterns active, ${totalOccurrences} occurrences`
          : 'No recent pattern learning',
        details: {
          active_patterns_24h: patterns?.length || 0,
          total_occurrences: totalOccurrences,
        },
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        last_check: new Date().toISOString(),
        response_time_ms: Date.now() - start,
        error_count_24h: 0,
        message: `Learning system error: ${err.message}`,
      };
    }
  }

  /**
   * Check collaboration system health
   */
  async checkCollaborationSystem(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const { data: agents, error } = await supabase
        .from('agent_profiles')
        .select('id, reputation_score, total_contributions');

      if (error) throw error;

      const responseTime = Date.now() - start;
      const avgReputation =
        agents?.reduce((sum: number, a: any) => sum + (a.reputation_score || 0), 0) / (agents?.length || 1) || 0;
      const totalContributions = agents?.reduce(
        (sum: number, a: any) => sum + (a.total_contributions || 0),
        0
      ) || 0;

      return {
        status: agents && agents.length > 0 ? 'healthy' : 'degraded',
        last_check: new Date().toISOString(),
        response_time_ms: responseTime,
        error_count_24h: 0,
        message: `${agents?.length || 0} agents, avg reputation: ${avgReputation.toFixed(2)}`,
        details: {
          total_agents: agents?.length || 0,
          avg_reputation: avgReputation,
          total_contributions: totalContributions,
        },
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        last_check: new Date().toISOString(),
        response_time_ms: Date.now() - start,
        error_count_24h: 0,
        message: `Collaboration system error: ${err.message}`,
      };
    }
  }

  /**
   * Check memory graph health
   */
  async checkMemoryGraph(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const { data: relationships, error } = await supabase
        .from('memory_relationships')
        .select('id, relationship_type')
        .limit(100);

      if (error) throw error;

      // Check for orphaned relationships
      const { data: orphaned } = await supabase.rpc('find_orphaned_relationships');

      const responseTime = Date.now() - start;
      const hasOrphans = orphaned && orphaned.length > 0;

      return {
        status: hasOrphans ? 'degraded' : 'healthy',
        last_check: new Date().toISOString(),
        response_time_ms: responseTime,
        error_count_24h: 0,
        message: hasOrphans
          ? `${orphaned.length} orphaned relationships found`
          : 'Graph integrity verified',
        details: {
          total_relationships: relationships?.length || 0,
          orphaned_relationships: orphaned?.length || 0,
        },
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        last_check: new Date().toISOString(),
        response_time_ms: Date.now() - start,
        error_count_24h: 0,
        message: `Memory graph error: ${err.message}`,
      };
    }
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(): Promise<{
    requests_per_second: number;
    avg_response_time_ms: number;
    error_rate: number;
  }> {
    try {
      // Get metrics from audit log for last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const { data: events } = await supabase
        .from('system_audit_log')
        .select('duration_ms, success')
        .gte('timestamp', oneHourAgo.toISOString());

      if (!events || events.length === 0) {
        return {
          requests_per_second: 0,
          avg_response_time_ms: 0,
          error_rate: 0,
        };
      }

      const totalRequests = events.length;
      const failedRequests = events.filter((e: any) => !e.success).length;
      const avgDuration =
        events
          .filter((e: any) => e.duration_ms)
          .reduce((sum: number, e: any) => sum + (e.duration_ms || 0), 0) / totalRequests || 0;

      return {
        requests_per_second: totalRequests / 3600,
        avg_response_time_ms: avgDuration,
        error_rate: (failedRequests / totalRequests) * 100,
      };
    } catch (err) {
      console.error('Failed to get system metrics:', err);
      return {
        requests_per_second: 0,
        avg_response_time_ms: 0,
        error_rate: 0,
      };
    }
  }

  /**
   * Calculate SLA metrics
   */
  async calculateSLA(period: '1h' | '24h' | '7d' | '30d'): Promise<SLAMetrics> {
    try {
      const hoursMap: Record<string, number> = {
        '1h': 1,
        '24h': 24,
        '7d': 168,
        '30d': 720,
      };

      const hoursBack = hoursMap[period];

      const { data, error } = await supabase.rpc('calculate_sla_metrics', {
        p_period_type: period,
        p_hours_back: hoursBack,
      });

      if (error || !data || data.length === 0) {
        // Return default values if no data
        return {
          period,
          availability: {
            target: 99.9,
            actual: 100,
            met: true,
            downtime_minutes: 0,
          },
          latency: {
            p50_ms: 0,
            p95_ms: 0,
            p99_ms: 0,
            target_p95_ms: 500,
            met: true,
          },
          error_rate: {
            target: 1.0,
            actual: 0,
            met: true,
            total_errors: 0,
            total_requests: 0,
          },
          overall_sla_met: true,
        };
      }

      const metrics = data[0];

      // Calculate downtime minutes (assuming 100% - availability as downtime percentage)
      const downtimePercent = 100 - Number(metrics.availability_percent);
      const downtimeMinutes = (downtimePercent / 100) * hoursBack * 60;

      // Get latency percentiles from audit log
      const latencies = await this.getLatencyPercentiles(hoursBack);

      const slaMetrics: SLAMetrics = {
        period,
        availability: {
          target: 99.9,
          actual: Number(metrics.availability_percent),
          met: Number(metrics.availability_percent) >= 99.9,
          downtime_minutes: downtimeMinutes,
        },
        latency: {
          p50_ms: latencies.p50,
          p95_ms: latencies.p95,
          p99_ms: latencies.p99,
          target_p95_ms: 500,
          met: latencies.p95 < 500,
        },
        error_rate: {
          target: 1.0,
          actual: Number(metrics.error_rate_percent),
          met: Number(metrics.error_rate_percent) < 1.0,
          total_errors: Number(metrics.failed_requests),
          total_requests: Number(metrics.total_requests),
        },
        overall_sla_met: Boolean(metrics.sla_met),
      };

      // Log SLA violation if not met
      if (!slaMetrics.overall_sla_met) {
        if (!slaMetrics.availability.met) {
          await auditLogger.logSLAViolation({
            violation_type: 'availability',
            target_value: 99.9,
            actual_value: slaMetrics.availability.actual,
            period,
          });
        }
        if (!slaMetrics.latency.met) {
          await auditLogger.logSLAViolation({
            violation_type: 'latency',
            target_value: 500,
            actual_value: slaMetrics.latency.p95_ms,
            period,
          });
        }
        if (!slaMetrics.error_rate.met) {
          await auditLogger.logSLAViolation({
            violation_type: 'error_rate',
            target_value: 1.0,
            actual_value: slaMetrics.error_rate.actual,
            period,
          });
        }
      }

      return slaMetrics;
    } catch (err) {
      console.error('Failed to calculate SLA:', err);
      return {
        period,
        availability: { target: 99.9, actual: 0, met: false, downtime_minutes: 0 },
        latency: { p50_ms: 0, p95_ms: 0, p99_ms: 0, target_p95_ms: 500, met: false },
        error_rate: { target: 1.0, actual: 0, met: true, total_errors: 0, total_requests: 0 },
        overall_sla_met: false,
      };
    }
  }

  /**
   * Get latency percentiles from audit log
   */
  private async getLatencyPercentiles(hoursBack: number): Promise<{
    p50: number;
    p95: number;
    p99: number;
  }> {
    try {
      const { data: events } = await supabase
        .from('system_audit_log')
        .select('duration_ms')
        .gte('timestamp', new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString())
        .not('duration_ms', 'is', null)
        .order('duration_ms', { ascending: true });

      if (!events || events.length === 0) {
        return { p50: 0, p95: 0, p99: 0 };
      }

      const latencies = events.map((e: any) => e.duration_ms || 0);
      const p50Index = Math.floor(latencies.length * 0.5);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p99Index = Math.floor(latencies.length * 0.99);

      return {
        p50: latencies[p50Index] || 0,
        p95: latencies[p95Index] || 0,
        p99: latencies[p99Index] || 0,
      };
    } catch (err) {
      console.error('Failed to calculate latency percentiles:', err);
      return { p50: 0, p95: 0, p99: 0 };
    }
  }
}

export const healthCheckService = new HealthCheckService();

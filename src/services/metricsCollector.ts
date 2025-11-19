/**
 * Metrics Collector Service
 * Prometheus-compatible metrics collection and export
 */

import { supabase } from '../config/supabase.js';

export interface SystemMetrics {
  // Request metrics
  get_requests: number;
  post_requests: number;
  put_requests: number;
  delete_requests: number;

  // Latency buckets (histogram)
  latency_100ms: number;
  latency_500ms: number;
  latency_1s: number;
  latency_5s: number;

  // System gauges
  total_memories: number;
  total_users: number;
  total_agents: number;

  // Agent metrics
  agents: Array<{
    id: string;
    name: string;
    reputation: number;
    contributions: number;
  }>;

  // Learning metrics
  active_patterns: number;
  total_patterns: number;

  // Collaboration metrics
  conflicts_detected: number;
  conflicts_resolved: number;
  contributions_24h: number;

  // Performance metrics
  avg_response_time_ms: number;
  error_count_24h: number;

  // Graph metrics
  total_relationships: number;
  orphaned_relationships: number;
}

class MetricsCollector {
  /**
   * Collect all system metrics
   */
  async collectMetrics(): Promise<SystemMetrics> {
    const [
      requestMetrics,
      latencyMetrics,
      systemGauges,
      agentMetrics,
      learningMetrics,
      collaborationMetrics,
      performanceMetrics,
      graphMetrics,
    ] = await Promise.all([
      this.getRequestMetrics(),
      this.getLatencyMetrics(),
      this.getSystemGauges(),
      this.getAgentMetrics(),
      this.getLearningMetrics(),
      this.getCollaborationMetrics(),
      this.getPerformanceMetrics(),
      this.getGraphMetrics(),
    ]);

    return {
      ...requestMetrics,
      ...latencyMetrics,
      ...systemGauges,
      ...agentMetrics,
      ...learningMetrics,
      ...collaborationMetrics,
      ...performanceMetrics,
      ...graphMetrics,
    };
  }

  /**
   * Get request counts by method
   */
  private async getRequestMetrics(): Promise<{
    get_requests: number;
    post_requests: number;
    put_requests: number;
    delete_requests: number;
  }> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const { data: events } = await supabase
        .from('system_audit_log')
        .select('metadata')
        .gte('timestamp', oneHourAgo.toISOString());

      let get = 0,
        post = 0,
        put = 0,
        del = 0;

      events?.forEach((event: any) => {
        const method = event.metadata?.method;
        if (method === 'GET') get++;
        else if (method === 'POST') post++;
        else if (method === 'PUT') put++;
        else if (method === 'DELETE') del++;
      });

      return {
        get_requests: get,
        post_requests: post,
        put_requests: put,
        delete_requests: del,
      };
    } catch (err) {
      console.error('Failed to get request metrics:', err);
      return {
        get_requests: 0,
        post_requests: 0,
        put_requests: 0,
        delete_requests: 0,
      };
    }
  }

  /**
   * Get latency histogram buckets
   */
  private async getLatencyMetrics(): Promise<{
    latency_100ms: number;
    latency_500ms: number;
    latency_1s: number;
    latency_5s: number;
  }> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const { data: events } = await supabase
        .from('system_audit_log')
        .select('duration_ms')
        .gte('timestamp', oneHourAgo.toISOString())
        .not('duration_ms', 'is', null);

      let under100 = 0,
        under500 = 0,
        under1000 = 0,
        under5000 = 0;

      events?.forEach((event: any) => {
        const duration = event.duration_ms || 0;
        if (duration <= 100) under100++;
        if (duration <= 500) under500++;
        if (duration <= 1000) under1000++;
        if (duration <= 5000) under5000++;
      });

      return {
        latency_100ms: under100,
        latency_500ms: under500,
        latency_1s: under1000,
        latency_5s: under5000,
      };
    } catch (err) {
      console.error('Failed to get latency metrics:', err);
      return {
        latency_100ms: 0,
        latency_500ms: 0,
        latency_1s: 0,
        latency_5s: 0,
      };
    }
  }

  /**
   * Get system-wide gauges
   */
  private async getSystemGauges(): Promise<{
    total_memories: number;
    total_users: number;
    total_agents: number;
  }> {
    try {
      const [{ count: memories }, { count: users }, { count: agents }] = await Promise.all([
        supabase.from('memories').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('agent_profiles').select('*', { count: 'exact', head: true }),
      ]);

      return {
        total_memories: memories || 0,
        total_users: users || 0,
        total_agents: agents || 0,
      };
    } catch (err) {
      console.error('Failed to get system gauges:', err);
      return {
        total_memories: 0,
        total_users: 0,
        total_agents: 0,
      };
    }
  }

  /**
   * Get agent-specific metrics
   */
  private async getAgentMetrics(): Promise<{
    agents: Array<{
      id: string;
      name: string;
      reputation: number;
      contributions: number;
    }>;
  }> {
    try {
      const { data: agents } = await supabase
        .from('agent_profiles')
        .select('id, agent_name, reputation_score, total_contributions')
        .order('reputation_score', { ascending: false })
        .limit(50);

      return {
        agents: (agents || []).map((agent: any) => ({
          id: agent.id,
          name: agent.agent_name,
          reputation: agent.reputation_score || 0,
          contributions: agent.total_contributions || 0,
        })),
      };
    } catch (err) {
      console.error('Failed to get agent metrics:', err);
      return {
        agents: [],
      };
    }
  }

  /**
   * Get learning system metrics
   */
  private async getLearningMetrics(): Promise<{
    active_patterns: number;
    total_patterns: number;
  }> {
    try {
      const [{ count: active }, { count: total }] = await Promise.all([
        supabase
          .from('temporal_patterns')
          .select('*', { count: 'exact', head: true })
          .gte('last_seen', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('temporal_patterns').select('*', { count: 'exact', head: true }),
      ]);

      return {
        active_patterns: active || 0,
        total_patterns: total || 0,
      };
    } catch (err) {
      console.error('Failed to get learning metrics:', err);
      return {
        active_patterns: 0,
        total_patterns: 0,
      };
    }
  }

  /**
   * Get collaboration metrics
   */
  private async getCollaborationMetrics(): Promise<{
    conflicts_detected: number;
    conflicts_resolved: number;
    contributions_24h: number;
  }> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [{ count: detected }, { count: resolved }, { count: contributions }] =
        await Promise.all([
          supabase
            .from('system_audit_log')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'conflict_detected')
            .gte('timestamp', oneDayAgo.toISOString()),
          supabase
            .from('system_audit_log')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'conflict_resolved')
            .gte('timestamp', oneDayAgo.toISOString()),
          supabase
            .from('agent_contributions')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', oneDayAgo.toISOString()),
        ]);

      return {
        conflicts_detected: detected || 0,
        conflicts_resolved: resolved || 0,
        contributions_24h: contributions || 0,
      };
    } catch (err) {
      console.error('Failed to get collaboration metrics:', err);
      return {
        conflicts_detected: 0,
        conflicts_resolved: 0,
        contributions_24h: 0,
      };
    }
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(): Promise<{
    avg_response_time_ms: number;
    error_count_24h: number;
  }> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const { data: events } = await supabase
        .from('system_audit_log')
        .select('duration_ms, success')
        .gte('timestamp', oneDayAgo.toISOString());

      if (!events || events.length === 0) {
        return {
          avg_response_time_ms: 0,
          error_count_24h: 0,
        };
      }

      const avgDuration =
        events
          .filter((e: any) => e.duration_ms)
          .reduce((sum: number, e: any) => sum + (e.duration_ms || 0), 0) / events.length || 0;

      const errorCount = events.filter((e: any) => !e.success).length;

      return {
        avg_response_time_ms: avgDuration,
        error_count_24h: errorCount,
      };
    } catch (err) {
      console.error('Failed to get performance metrics:', err);
      return {
        avg_response_time_ms: 0,
        error_count_24h: 0,
      };
    }
  }

  /**
   * Get graph metrics
   */
  private async getGraphMetrics(): Promise<{
    total_relationships: number;
    orphaned_relationships: number;
  }> {
    try {
      const [{ count: total }, { data: orphaned }] = await Promise.all([
        supabase.from('memory_relationships').select('*', { count: 'exact', head: true }),
        supabase.rpc('find_orphaned_relationships'),
      ]);

      return {
        total_relationships: total || 0,
        orphaned_relationships: orphaned?.length || 0,
      };
    } catch (err) {
      console.error('Failed to get graph metrics:', err);
      return {
        total_relationships: 0,
        orphaned_relationships: 0,
      };
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  async exportPrometheusMetrics(): Promise<string> {
    const metrics = await this.collectMetrics();

    const lines: string[] = [];

    // Request counters
    lines.push('# HELP recallbricks_requests_total Total number of requests by method');
    lines.push('# TYPE recallbricks_requests_total counter');
    lines.push(`recallbricks_requests_total{method="GET"} ${metrics.get_requests}`);
    lines.push(`recallbricks_requests_total{method="POST"} ${metrics.post_requests}`);
    lines.push(`recallbricks_requests_total{method="PUT"} ${metrics.put_requests}`);
    lines.push(`recallbricks_requests_total{method="DELETE"} ${metrics.delete_requests}`);
    lines.push('');

    // Latency histogram
    lines.push('# HELP recallbricks_request_duration_seconds Request duration in seconds');
    lines.push('# TYPE recallbricks_request_duration_seconds histogram');
    lines.push(`recallbricks_request_duration_seconds_bucket{le="0.1"} ${metrics.latency_100ms}`);
    lines.push(`recallbricks_request_duration_seconds_bucket{le="0.5"} ${metrics.latency_500ms}`);
    lines.push(`recallbricks_request_duration_seconds_bucket{le="1.0"} ${metrics.latency_1s}`);
    lines.push(`recallbricks_request_duration_seconds_bucket{le="5.0"} ${metrics.latency_5s}`);
    lines.push('');

    // System gauges
    lines.push('# HELP recallbricks_memory_total Total memories in system');
    lines.push('# TYPE recallbricks_memory_total gauge');
    lines.push(`recallbricks_memory_total ${metrics.total_memories}`);
    lines.push('');

    lines.push('# HELP recallbricks_users_total Total users in system');
    lines.push('# TYPE recallbricks_users_total gauge');
    lines.push(`recallbricks_users_total ${metrics.total_users}`);
    lines.push('');

    lines.push('# HELP recallbricks_agents_total Total agents in system');
    lines.push('# TYPE recallbricks_agents_total gauge');
    lines.push(`recallbricks_agents_total ${metrics.total_agents}`);
    lines.push('');

    // Agent reputation
    lines.push('# HELP recallbricks_agent_reputation_score Agent reputation scores');
    lines.push('# TYPE recallbricks_agent_reputation_score gauge');
    metrics.agents.forEach((agent) => {
      // Sanitize agent name for Prometheus label
      const sanitizedName = agent.name.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(
        `recallbricks_agent_reputation_score{agent_id="${agent.id}",agent_name="${sanitizedName}"} ${agent.reputation}`
      );
    });
    lines.push('');

    // Agent contributions
    lines.push('# HELP recallbricks_agent_contributions_total Total contributions by agent');
    lines.push('# TYPE recallbricks_agent_contributions_total counter');
    metrics.agents.forEach((agent) => {
      const sanitizedName = agent.name.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(
        `recallbricks_agent_contributions_total{agent_id="${agent.id}",agent_name="${sanitizedName}"} ${agent.contributions}`
      );
    });
    lines.push('');

    // Learning patterns
    lines.push('# HELP recallbricks_learning_patterns_active Active learning patterns (24h)');
    lines.push('# TYPE recallbricks_learning_patterns_active gauge');
    lines.push(`recallbricks_learning_patterns_active ${metrics.active_patterns}`);
    lines.push('');

    lines.push('# HELP recallbricks_learning_patterns_total Total learning patterns');
    lines.push('# TYPE recallbricks_learning_patterns_total gauge');
    lines.push(`recallbricks_learning_patterns_total ${metrics.total_patterns}`);
    lines.push('');

    // Collaboration metrics
    lines.push('# HELP recallbricks_conflicts_detected_total Conflicts detected (24h)');
    lines.push('# TYPE recallbricks_conflicts_detected_total counter');
    lines.push(`recallbricks_conflicts_detected_total ${metrics.conflicts_detected}`);
    lines.push('');

    lines.push('# HELP recallbricks_conflicts_resolved_total Conflicts resolved (24h)');
    lines.push('# TYPE recallbricks_conflicts_resolved_total counter');
    lines.push(`recallbricks_conflicts_resolved_total ${metrics.conflicts_resolved}`);
    lines.push('');

    lines.push('# HELP recallbricks_contributions_24h Agent contributions in last 24h');
    lines.push('# TYPE recallbricks_contributions_24h gauge');
    lines.push(`recallbricks_contributions_24h ${metrics.contributions_24h}`);
    lines.push('');

    // Performance metrics
    lines.push('# HELP recallbricks_avg_response_time_ms Average response time in milliseconds');
    lines.push('# TYPE recallbricks_avg_response_time_ms gauge');
    lines.push(`recallbricks_avg_response_time_ms ${metrics.avg_response_time_ms}`);
    lines.push('');

    lines.push('# HELP recallbricks_errors_24h Errors in last 24 hours');
    lines.push('# TYPE recallbricks_errors_24h gauge');
    lines.push(`recallbricks_errors_24h ${metrics.error_count_24h}`);
    lines.push('');

    // Graph metrics
    lines.push('# HELP recallbricks_relationships_total Total memory relationships');
    lines.push('# TYPE recallbricks_relationships_total gauge');
    lines.push(`recallbricks_relationships_total ${metrics.total_relationships}`);
    lines.push('');

    lines.push('# HELP recallbricks_orphaned_relationships Orphaned memory relationships');
    lines.push('# TYPE recallbricks_orphaned_relationships gauge');
    lines.push(`recallbricks_orphaned_relationships ${metrics.orphaned_relationships}`);
    lines.push('');

    return lines.join('\n');
  }
}

export const metricsCollector = new MetricsCollector();

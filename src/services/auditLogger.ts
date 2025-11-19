/**
 * Audit Logger Service
 * Centralized audit logging for transparency, compliance, and debugging
 */

import { supabase } from '../config/supabase.js';

export type EventType =
  | 'contribution'
  | 'reputation_update'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'pattern_learned'
  | 'prediction_made'
  | 'synthesis_created'
  | 'health_check'
  | 'sla_violation'
  | 'memory_created'
  | 'memory_updated'
  | 'memory_deleted'
  | 'agent_created'
  | 'relationship_created';

export type EventCategory = 'collaboration' | 'learning' | 'performance' | 'security';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

export interface AuditEventData {
  event_type: EventType;
  event_category: EventCategory;
  severity?: Severity;
  user_id?: string;
  agent_id?: string;
  memory_id?: string;
  event_data?: Record<string, any>;
  metadata?: Record<string, any>;
  duration_ms?: number;
  success?: boolean;
  error_message?: string;
  stack_trace?: string;
}

export interface AuditEvent extends AuditEventData {
  id: string;
  timestamp: string;
  created_at: string;
}

class AuditLogger {
  /**
   * Log an audit event
   */
  async logEvent(data: AuditEventData): Promise<string | null> {
    try {
      const { data: result, error } = await supabase.rpc('log_audit_event', {
        p_event_type: data.event_type,
        p_event_category: data.event_category,
        p_severity: data.severity || 'info',
        p_user_id: data.user_id || null,
        p_agent_id: data.agent_id || null,
        p_memory_id: data.memory_id || null,
        p_event_data: data.event_data || {},
        p_metadata: data.metadata || {},
        p_duration_ms: data.duration_ms || null,
        p_success: data.success !== undefined ? data.success : true,
        p_error_message: data.error_message || null,
        p_stack_trace: data.stack_trace || null,
      });

      if (error) {
        console.error('Failed to log audit event:', error);
        return null;
      }

      return result as string;
    } catch (err) {
      console.error('Audit logging exception:', err);
      return null;
    }
  }

  /**
   * Log a contribution event
   */
  async logContribution(params: {
    agent_id: string;
    memory_id: string;
    contribution_type: 'created' | 'updated' | 'verified';
    confidence?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.logEvent({
      event_type: 'contribution',
      event_category: 'collaboration',
      severity: 'info',
      agent_id: params.agent_id,
      memory_id: params.memory_id,
      event_data: {
        contribution_type: params.contribution_type,
        confidence: params.confidence,
      },
      metadata: params.metadata,
      success: true,
    });
  }

  /**
   * Log a reputation update
   */
  async logReputationUpdate(params: {
    agent_id: string;
    old_score: number;
    new_score: number;
    reason: string;
    delta: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.logEvent({
      event_type: 'reputation_update',
      event_category: 'collaboration',
      severity: 'info',
      agent_id: params.agent_id,
      event_data: {
        old_score: params.old_score,
        new_score: params.new_score,
        reason: params.reason,
        delta: params.delta,
      },
      metadata: params.metadata,
      success: true,
    });
  }

  /**
   * Log a conflict detection
   */
  async logConflictDetected(params: {
    memory_ids: string[];
    conflict_type: string;
    agent_ids?: string[];
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.logEvent({
      event_type: 'conflict_detected',
      event_category: 'collaboration',
      severity: 'warning',
      event_data: {
        memory_ids: params.memory_ids,
        conflict_type: params.conflict_type,
        agent_ids: params.agent_ids,
      },
      metadata: params.metadata,
      success: true,
    });
  }

  /**
   * Log a conflict resolution
   */
  async logConflictResolved(params: {
    conflict_id: string;
    memory_ids: string[];
    resolution_strategy: string;
    winner_agent?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.logEvent({
      event_type: 'conflict_resolved',
      event_category: 'collaboration',
      severity: 'info',
      agent_id: params.winner_agent,
      event_data: {
        conflict_id: params.conflict_id,
        memory_ids: params.memory_ids,
        resolution_strategy: params.resolution_strategy,
      },
      metadata: params.metadata,
      success: true,
    });
  }

  /**
   * Log a pattern learning event
   */
  async logPatternLearned(params: {
    pattern_type: string;
    confidence: number;
    occurrence_count: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.logEvent({
      event_type: 'pattern_learned',
      event_category: 'learning',
      severity: 'info',
      event_data: {
        pattern_type: params.pattern_type,
        confidence: params.confidence,
        occurrence_count: params.occurrence_count,
      },
      metadata: params.metadata,
      success: true,
    });
  }

  /**
   * Log a prediction
   */
  async logPrediction(params: {
    prediction_type: string;
    confidence: number;
    actual_outcome?: any;
    was_correct?: boolean;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.logEvent({
      event_type: 'prediction_made',
      event_category: 'learning',
      severity: 'info',
      event_data: {
        prediction_type: params.prediction_type,
        confidence: params.confidence,
        actual_outcome: params.actual_outcome,
        was_correct: params.was_correct,
      },
      metadata: params.metadata,
      success: true,
    });
  }

  /**
   * Log a health check
   */
  async logHealthCheck(params: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    component?: string;
    response_time_ms: number;
    details?: Record<string, any>;
  }): Promise<void> {
    await this.logEvent({
      event_type: 'health_check',
      event_category: 'performance',
      severity: params.status === 'healthy' ? 'info' : 'warning',
      event_data: {
        status: params.status,
        component: params.component,
      },
      metadata: params.details,
      duration_ms: params.response_time_ms,
      success: params.status === 'healthy',
    });
  }

  /**
   * Log an SLA violation
   */
  async logSLAViolation(params: {
    violation_type: 'availability' | 'latency' | 'error_rate';
    target_value: number;
    actual_value: number;
    period: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.logEvent({
      event_type: 'sla_violation',
      event_category: 'performance',
      severity: 'warning',
      event_data: {
        violation_type: params.violation_type,
        target_value: params.target_value,
        actual_value: params.actual_value,
        period: params.period,
      },
      metadata: params.metadata,
      success: false,
    });
  }

  /**
   * Query audit logs
   */
  async queryLogs(params: {
    event_type?: EventType;
    event_category?: EventCategory;
    severity?: Severity;
    user_id?: string;
    agent_id?: string;
    memory_id?: string;
    success?: boolean;
    start_time?: Date;
    end_time?: Date;
    limit?: number;
  }): Promise<AuditEvent[]> {
    try {
      let query = supabase
        .from('system_audit_log')
        .select('*')
        .order('timestamp', { ascending: false });

      if (params.event_type) {
        query = query.eq('event_type', params.event_type);
      }
      if (params.event_category) {
        query = query.eq('event_category', params.event_category);
      }
      if (params.severity) {
        query = query.eq('severity', params.severity);
      }
      if (params.user_id) {
        query = query.eq('user_id', params.user_id);
      }
      if (params.agent_id) {
        query = query.eq('agent_id', params.agent_id);
      }
      if (params.memory_id) {
        query = query.eq('memory_id', params.memory_id);
      }
      if (params.success !== undefined) {
        query = query.eq('success', params.success);
      }
      if (params.start_time) {
        query = query.gte('timestamp', params.start_time.toISOString());
      }
      if (params.end_time) {
        query = query.lte('timestamp', params.end_time.toISOString());
      }

      query = query.limit(params.limit || 100);

      const { data, error } = await query;

      if (error) {
        console.error('Failed to query audit logs:', error);
        return [];
      }

      return (data as AuditEvent[]) || [];
    } catch (err) {
      console.error('Audit log query exception:', err);
      return [];
    }
  }

  /**
   * Get error count in last 24 hours
   */
  async getErrorCount24h(category?: EventCategory): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('get_error_count_24h', {
        p_category: category || null,
      });

      if (error) {
        console.error('Failed to get error count:', error);
        return 0;
      }

      return (data as number) || 0;
    } catch (err) {
      console.error('Error count query exception:', err);
      return 0;
    }
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();

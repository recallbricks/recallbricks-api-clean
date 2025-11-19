-- =====================================================
-- Migration: Audit & Telemetry System
-- Description: Comprehensive audit trail for transparency, compliance, and debugging
-- Date: 2025-11-19
-- =====================================================

-- 1. Create system_audit_log table
CREATE TABLE IF NOT EXISTS system_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  event_type TEXT NOT NULL, -- 'contribution', 'reputation_update', 'conflict_detected', 'conflict_resolved', 'pattern_learned', 'prediction_made', 'synthesis_created', 'health_check', 'sla_violation'
  event_category TEXT NOT NULL, -- 'collaboration', 'learning', 'performance', 'security'
  severity TEXT NOT NULL, -- 'info', 'warning', 'error', 'critical'
  user_id UUID REFERENCES users(id),
  agent_id UUID REFERENCES agent_profiles(id),
  memory_id UUID REFERENCES memories(id),
  event_data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  duration_ms INTEGER, -- for performance events
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  stack_trace TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE system_audit_log IS 'Comprehensive audit trail for transparency, compliance, and debugging';

-- 2. Create indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON system_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON system_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_category ON system_audit_log(event_category);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON system_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON system_audit_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_agent_id ON system_audit_log(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_memory_id ON system_audit_log(memory_id) WHERE memory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_success ON system_audit_log(success) WHERE success = false;

-- 3. Create audit logging function
CREATE OR REPLACE FUNCTION log_audit_event(
  p_event_type TEXT,
  p_event_category TEXT,
  p_severity TEXT DEFAULT 'info',
  p_user_id UUID DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL,
  p_memory_id UUID DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}',
  p_metadata JSONB DEFAULT '{}',
  p_duration_ms INTEGER DEFAULT NULL,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO system_audit_log (
    event_type, event_category, severity, user_id, agent_id, memory_id,
    event_data, metadata, duration_ms, success, error_message, stack_trace
  ) VALUES (
    p_event_type, p_event_category, p_severity, p_user_id, p_agent_id, p_memory_id,
    p_event_data, p_metadata, p_duration_ms, p_success, p_error_message, p_stack_trace
  ) RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_audit_event IS 'Centralized function for logging audit events with full context';

-- 4. Create function to get error count in last 24h
CREATE OR REPLACE FUNCTION get_error_count_24h(p_category TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_category IS NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM system_audit_log
    WHERE timestamp > NOW() - INTERVAL '24 hours'
      AND success = false;
  ELSE
    SELECT COUNT(*) INTO v_count
    FROM system_audit_log
    WHERE timestamp > NOW() - INTERVAL '24 hours'
      AND success = false
      AND event_category = p_category;
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;

-- 5. Create function to find orphaned relationships
CREATE OR REPLACE FUNCTION find_orphaned_relationships()
RETURNS TABLE(
  relationship_id UUID,
  memory_id UUID,
  related_memory_id UUID,
  relationship_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mr.id as relationship_id,
    mr.memory_id,
    mr.related_memory_id,
    mr.relationship_type
  FROM memory_relationships mr
  LEFT JOIN memories m1 ON mr.memory_id = m1.id
  LEFT JOIN memories m2 ON mr.related_memory_id = m2.id
  WHERE m1.id IS NULL OR m2.id IS NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_orphaned_relationships IS 'Finds relationships pointing to deleted memories';

-- 6. Create helper functions to safely query tables that may not exist yet

-- Helper function to safely count active patterns (returns 0 if table doesn't exist)
CREATE OR REPLACE FUNCTION safe_count_active_patterns()
RETURNS BIGINT AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- Check if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'temporal_patterns'
  ) THEN
    SELECT COUNT(*) INTO v_count
    FROM temporal_patterns
    WHERE last_seen > NOW() - INTERVAL '24 hours';
    RETURN COALESCE(v_count, 0);
  ELSE
    RETURN 0;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION safe_count_active_patterns IS 'Safely counts active patterns in last 24h, returns 0 if table does not exist';

-- Helper function to safely count contributions (returns 0 if table doesn't exist)
CREATE OR REPLACE FUNCTION safe_count_contributions()
RETURNS BIGINT AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- Check if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'agent_contributions'
  ) THEN
    SELECT COUNT(*) INTO v_count
    FROM agent_contributions
    WHERE created_at > NOW() - INTERVAL '24 hours';
    RETURN COALESCE(v_count, 0);
  ELSE
    RETURN 0;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION safe_count_contributions IS 'Safely counts contributions in last 24h, returns 0 if table does not exist';

-- Helper function to safely count conflict resolutions (returns 0 if table doesn't exist)
CREATE OR REPLACE FUNCTION safe_count_conflict_resolutions()
RETURNS BIGINT AS $$
DECLARE
  v_count BIGINT;
BEGIN
  -- Check if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'conflict_resolutions'
  ) THEN
    SELECT COUNT(*) INTO v_count
    FROM conflict_resolutions
    WHERE created_at > NOW() - INTERVAL '24 hours';
    RETURN COALESCE(v_count, 0);
  ELSE
    RETURN 0;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION safe_count_conflict_resolutions IS 'Safely counts conflict resolutions in last 24h, returns 0 if table does not exist';

-- 7. Create materialized view for system metrics (refreshed every 5 min)
CREATE MATERIALIZED VIEW IF NOT EXISTS system_metrics_5min AS
SELECT
  NOW() as snapshot_time,
  (SELECT COUNT(*) FROM memories) as total_memories,
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM agent_profiles) as total_agents,
  safe_count_active_patterns() as active_patterns_24h,
  safe_count_contributions() as contributions_24h,
  safe_count_conflict_resolutions() as conflicts_resolved_24h,
  (SELECT COALESCE(AVG(reputation_score), 0) FROM agent_profiles) as avg_agent_reputation,
  (SELECT COUNT(*) FROM system_audit_log WHERE timestamp > NOW() - INTERVAL '1 hour' AND success = false) as errors_1h,
  (SELECT COUNT(*) FROM system_audit_log WHERE timestamp > NOW() - INTERVAL '1 hour') as total_events_1h;

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_metrics_snapshot ON system_metrics_5min(snapshot_time);

COMMENT ON MATERIALIZED VIEW system_metrics_5min IS 'System-wide metrics snapshot, refresh every 5 minutes';

-- 8. Create function to refresh metrics
CREATE OR REPLACE FUNCTION refresh_system_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY system_metrics_5min;
END;
$$ LANGUAGE plpgsql;

-- 9. Create SLA metrics table
CREATE TABLE IF NOT EXISTS sla_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  period_type TEXT NOT NULL, -- '1h', '24h', '7d', '30d'
  total_requests INTEGER NOT NULL DEFAULT 0,
  successful_requests INTEGER NOT NULL DEFAULT 0,
  failed_requests INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms NUMERIC(10, 2),
  p50_latency_ms NUMERIC(10, 2),
  p95_latency_ms NUMERIC(10, 2),
  p99_latency_ms NUMERIC(10, 2),
  availability_percent NUMERIC(5, 2),
  error_rate_percent NUMERIC(5, 2),
  sla_met BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_period ON sla_metrics(period_type, period_end DESC);

COMMENT ON TABLE sla_metrics IS 'SLA tracking metrics calculated periodically';

-- 10. Create function to calculate SLA for a period
CREATE OR REPLACE FUNCTION calculate_sla_metrics(
  p_period_type TEXT,
  p_hours_back INTEGER DEFAULT 1
)
RETURNS TABLE(
  total_requests BIGINT,
  successful_requests BIGINT,
  failed_requests BIGINT,
  availability_percent NUMERIC,
  error_rate_percent NUMERIC,
  sla_met BOOLEAN
) AS $$
DECLARE
  v_total BIGINT;
  v_success BIGINT;
  v_failed BIGINT;
  v_availability NUMERIC;
  v_error_rate NUMERIC;
  v_sla_met BOOLEAN;
BEGIN
  -- Count requests from audit log
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE success = true),
    COUNT(*) FILTER (WHERE success = false)
  INTO v_total, v_success, v_failed
  FROM system_audit_log
  WHERE timestamp > NOW() - (p_hours_back || ' hours')::INTERVAL
    AND event_category IN ('collaboration', 'learning', 'performance');

  -- Calculate metrics
  v_total := COALESCE(v_total, 0);
  v_success := COALESCE(v_success, 0);
  v_failed := COALESCE(v_failed, 0);

  IF v_total > 0 THEN
    v_availability := (v_success::NUMERIC / v_total::NUMERIC) * 100;
    v_error_rate := (v_failed::NUMERIC / v_total::NUMERIC) * 100;
  ELSE
    v_availability := 100;
    v_error_rate := 0;
  END IF;

  -- Check SLA (99.9% availability, <1% error rate)
  v_sla_met := v_availability >= 99.9 AND v_error_rate < 1.0;

  RETURN QUERY SELECT v_total, v_success, v_failed, v_availability, v_error_rate, v_sla_met;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_sla_metrics IS 'Calculate SLA metrics for a given time period';

-- 11. Grant permissions (adjust as needed)
-- GRANT SELECT ON system_audit_log TO authenticated;
-- GRANT SELECT ON system_metrics_5min TO authenticated;
-- GRANT SELECT ON sla_metrics TO authenticated;

-- 12. Create trigger to auto-log certain events (optional)
-- Example: Auto-log failed operations
-- CREATE OR REPLACE FUNCTION auto_log_failures()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF TG_TABLE_NAME = 'memories' AND TG_OP = 'DELETE' THEN
--     PERFORM log_audit_event(
--       'memory_deleted',
--       'security',
--       'warning',
--       NULL,
--       NULL,
--       OLD.id,
--       jsonb_build_object('text', OLD.text, 'tags', OLD.tags)
--     );
--   END IF;
--   RETURN NULL;
-- END;
-- $$ LANGUAGE plpgsql;

-- Summary of changes
DO $$
BEGIN
  RAISE NOTICE '✅ Audit & Telemetry System Migration Complete';
  RAISE NOTICE '  - system_audit_log table created';
  RAISE NOTICE '  - Audit logging function created';
  RAISE NOTICE '  - Safe helper functions for Phase 2A/3 tables created';
  RAISE NOTICE '  - System metrics materialized view created (works without Phase 2A/3)';
  RAISE NOTICE '  - SLA metrics table created';
  RAISE NOTICE '  - Helper functions for monitoring created';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Metrics view gracefully handles missing tables:';
  RAISE NOTICE '  - temporal_patterns (Phase 2A)';
  RAISE NOTICE '  - agent_contributions (Phase 3)';
  RAISE NOTICE '  - conflict_resolutions (Phase 3)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Integrate audit logging in application code';
  RAISE NOTICE '  2. Set up cron job to refresh metrics every 5 min';
  RAISE NOTICE '  3. Configure monitoring dashboards';
END $$;

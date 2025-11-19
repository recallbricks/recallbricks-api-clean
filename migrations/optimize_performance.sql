-- ============================================================================
-- Performance Optimization for Enterprise Scale (150% Load)
-- ============================================================================

-- Run ANALYZE to update statistics
ANALYZE;

-- ============================================================================
-- 1. CONNECTION POOLING CONFIGURATION
-- ============================================================================

-- Increase connection limits (adjust based on available resources)
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '4GB';
ALTER SYSTEM SET effective_cache_size = '12GB';
ALTER SYSTEM SET maintenance_work_mem = '1GB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET min_wal_size = '2GB';
ALTER SYSTEM SET max_wal_size = '8GB';

-- Reload configuration
SELECT pg_reload_conf();

-- ============================================================================
-- 2. ADDITIONAL INDEXES FOR PHASE 2
-- ============================================================================

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_user_last_accessed
ON memories(user_id, last_accessed DESC)
WHERE last_accessed IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_user_usage_helpfulness
ON memories(user_id, usage_count DESC, helpfulness_score DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_temporal_patterns_user_type_confidence
ON temporal_patterns(user_id, pattern_type, confidence DESC)
WHERE confidence >= 0.5;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prediction_cache_user_expires
ON prediction_cache(user_id, expires_at DESC)
WHERE expires_at > NOW();

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learning_metrics_user_type_recorded
ON learning_metrics(user_id, metric_type, recorded_at DESC);

-- Partial indexes for active data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_active_recent
ON memories(user_id, id, last_accessed DESC)
WHERE last_accessed > NOW() - INTERVAL '90 days';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patterns_active
ON temporal_patterns(user_id, pattern_type, pattern_data)
WHERE last_seen > NOW() - INTERVAL '30 days';

-- ============================================================================
-- 3. MATERIALIZED VIEWS FOR EXPENSIVE QUERIES
-- ============================================================================

-- Materialized view for user statistics (refreshed periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS user_stats_cache AS
SELECT
    user_id,
    COUNT(*) as total_memories,
    AVG(helpfulness_score) as avg_helpfulness,
    SUM(usage_count) as total_usage,
    COUNT(*) FILTER (WHERE last_accessed > NOW() - INTERVAL '30 days') as active_memories,
    MAX(last_accessed) as last_activity,
    NOW() as refreshed_at
FROM memories
GROUP BY user_id;

CREATE UNIQUE INDEX ON user_stats_cache(user_id);

-- Materialized view for pattern effectiveness
CREATE MATERIALIZED VIEW IF NOT EXISTS pattern_effectiveness_cache AS
SELECT
    tp.user_id,
    tp.pattern_type,
    COUNT(*) as pattern_count,
    AVG(tp.confidence) as avg_confidence,
    SUM(tp.occurrences) as total_occurrences,
    MAX(tp.last_seen) as most_recent,
    NOW() as refreshed_at
FROM temporal_patterns tp
WHERE tp.confidence >= 0.5
  AND tp.last_seen > NOW() - INTERVAL '90 days'
GROUP BY tp.user_id, tp.pattern_type;

CREATE INDEX ON pattern_effectiveness_cache(user_id, pattern_type);

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_stats_caches()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats_cache;
    REFRESH MATERIALIZED VIEW CONCURRENTLY pattern_effectiveness_cache;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. QUERY OPTIMIZATION FUNCTIONS
-- ============================================================================

-- Optimized function for fetching user memories with analytics
CREATE OR REPLACE FUNCTION get_user_memories_optimized(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    text TEXT,
    usage_count INTEGER,
    helpfulness_score FLOAT,
    recency_score FLOAT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.text,
        m.usage_count,
        m.helpfulness_score,
        CASE
            WHEN m.last_accessed IS NULL THEN 0
            WHEN m.last_accessed > NOW() - INTERVAL '7 days' THEN 1.0
            WHEN m.last_accessed > NOW() - INTERVAL '30 days' THEN 0.8
            WHEN m.last_accessed > NOW() - INTERVAL '90 days' THEN 0.5
            ELSE 0.3
        END as recency_score,
        m.created_at
    FROM memories m
    WHERE m.user_id = p_user_id
    ORDER BY m.last_accessed DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- Optimized function for prediction cache lookup with hit tracking
CREATE OR REPLACE FUNCTION get_prediction_from_cache(
    p_user_id UUID,
    p_cache_key TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_predictions JSONB;
    v_id UUID;
BEGIN
    -- Try to get from cache
    SELECT id, predictions INTO v_id, v_predictions
    FROM prediction_cache
    WHERE user_id = p_user_id
      AND cache_key = p_cache_key
      AND expires_at > NOW()
    FOR UPDATE SKIP LOCKED;  -- Prevent lock contention

    IF FOUND THEN
        -- Increment hit count asynchronously
        UPDATE prediction_cache
        SET hit_count = hit_count + 1,
            last_accessed = NOW()
        WHERE id = v_id;

        RETURN v_predictions;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. PARTITIONING FOR LARGE TABLES
-- ============================================================================

-- Partition learning_metrics by month (for high-volume data)
-- Note: This requires recreating the table if it already has data

-- Create partitioned table (run only if table is empty or as migration)
/*
CREATE TABLE learning_metrics_partitioned (
    id UUID DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    metric_value FLOAT NOT NULL,
    context JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (recorded_at);

-- Create partitions for next 6 months
CREATE TABLE learning_metrics_2025_11 PARTITION OF learning_metrics_partitioned
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE learning_metrics_2025_12 PARTITION OF learning_metrics_partitioned
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Add indexes to each partition
CREATE INDEX ON learning_metrics_2025_11(user_id, metric_type, recorded_at DESC);
CREATE INDEX ON learning_metrics_2025_12(user_id, metric_type, recorded_at DESC);
*/

-- ============================================================================
-- 6. AUTOMATED MAINTENANCE
-- ============================================================================

-- Function to clean old cache entries
CREATE OR REPLACE FUNCTION cleanup_old_caches()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Delete expired prediction cache
    DELETE FROM prediction_cache
    WHERE expires_at < NOW() - INTERVAL '1 hour';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Delete very old learning metrics (keep 1 year)
    DELETE FROM learning_metrics
    WHERE recorded_at < NOW() - INTERVAL '1 year';

    -- Delete stale temporal patterns (not seen in 6 months)
    DELETE FROM temporal_patterns
    WHERE last_seen < NOW() - INTERVAL '6 months';

    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to vacuum and analyze tables
CREATE OR REPLACE FUNCTION maintenance_vacuum_analyze()
RETURNS void AS $$
BEGIN
    -- Vacuum and analyze main tables
    VACUUM ANALYZE memories;
    VACUUM ANALYZE temporal_patterns;
    VACUUM ANALYZE user_learning_params;
    VACUUM ANALYZE prediction_cache;
    VACUUM ANALYZE learning_metrics;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. MONITORING QUERIES
-- ============================================================================

-- View for query performance monitoring
CREATE OR REPLACE VIEW slow_queries AS
SELECT
    query,
    calls,
    total_time,
    mean_time,
    max_time,
    stddev_time
FROM pg_stat_statements
WHERE mean_time > 100  -- Queries averaging > 100ms
ORDER BY mean_time DESC
LIMIT 50;

-- View for index usage
CREATE OR REPLACE VIEW index_usage AS
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- View for table bloat
CREATE OR REPLACE VIEW table_bloat AS
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) -
                   pg_relation_size(schemaname||'.'||tablename)) AS index_size,
    n_live_tup,
    n_dead_tup,
    ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_tuple_percent
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;

-- ============================================================================
-- 8. CONNECTION POOL STATS
-- ============================================================================

CREATE OR REPLACE VIEW connection_stats AS
SELECT
    state,
    COUNT(*) as count,
    MAX(EXTRACT(EPOCH FROM (NOW() - state_change))) as max_duration_seconds
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state;

-- ============================================================================
-- 9. SCHEDULED MAINTENANCE
-- ============================================================================

-- Note: These should be scheduled via cron or pg_cron extension

-- Example pg_cron jobs (requires pg_cron extension):
/*
-- Cleanup old caches every hour
SELECT cron.schedule('cleanup-caches', '0 * * * *', 'SELECT cleanup_old_caches()');

-- Refresh materialized views every 15 minutes
SELECT cron.schedule('refresh-stats', '*/15 * * * *', 'SELECT refresh_stats_caches()');

-- Vacuum and analyze daily at 2 AM
SELECT cron.schedule('maintenance', '0 2 * * *', 'SELECT maintenance_vacuum_analyze()');
*/

-- ============================================================================
-- 10. EXPLAIN ANALYZE FOR KEY QUERIES
-- ============================================================================

-- Test prediction query performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT m.id, m.text, m.access_pattern
FROM memories m
WHERE m.user_id = '00000000-0000-0000-0000-000000000000'
  AND m.last_accessed > NOW() - INTERVAL '30 days'
ORDER BY m.last_accessed DESC
LIMIT 10;

-- Test temporal pattern query performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT *
FROM temporal_patterns
WHERE user_id = '00000000-0000-0000-0000-000000000000'
  AND pattern_type = 'hourly'
  AND confidence >= 0.5
ORDER BY confidence DESC
LIMIT 20;

-- Test cache lookup performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT predictions
FROM prediction_cache
WHERE user_id = '00000000-0000-0000-0000-000000000000'
  AND cache_key = 'test-key'
  AND expires_at > NOW();

-- ============================================================================
-- PERFORMANCE VERIFICATION
-- ============================================================================

-- Check index usage
SELECT
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('memories', 'temporal_patterns', 'prediction_cache', 'learning_metrics')
ORDER BY tablename, idx_scan DESC;

-- Check cache hit ratio
SELECT
    SUM(heap_blks_read) as heap_read,
    SUM(heap_blks_hit) as heap_hit,
    ROUND(SUM(heap_blks_hit) * 100.0 / NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0), 2) as cache_hit_ratio
FROM pg_statio_user_tables;

-- Check table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

COMMENT ON FUNCTION cleanup_old_caches IS 'Removes expired cache entries and old data';
COMMENT ON FUNCTION maintenance_vacuum_analyze IS 'Runs VACUUM ANALYZE on main tables';
COMMENT ON FUNCTION refresh_stats_caches IS 'Refreshes materialized views for statistics';
COMMENT ON FUNCTION get_user_memories_optimized IS 'Optimized function for fetching user memories with analytics';
COMMENT ON FUNCTION get_prediction_from_cache IS 'Optimized cache lookup with hit tracking';

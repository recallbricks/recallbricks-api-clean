-- Migration: Phase 2 - Predictive Recall & Temporal Pattern Learning
-- Date: 2025-11-18
-- Phase 2: Predictive patterns, temporal learning, adaptive weighting

-- ============================================================================
-- 1. TEMPORAL PATTERNS TABLE
-- ============================================================================
-- Stores time-based access patterns for predictive recall

CREATE TABLE IF NOT EXISTS temporal_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('hourly', 'daily', 'weekly', 'sequence', 'co_access')),
  pattern_data JSONB NOT NULL DEFAULT '{}',
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  occurrences INTEGER DEFAULT 1,
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient pattern lookups
CREATE INDEX IF NOT EXISTS idx_temporal_patterns_user ON temporal_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_temporal_patterns_type ON temporal_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_temporal_patterns_confidence ON temporal_patterns(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_temporal_patterns_last_seen ON temporal_patterns(last_seen DESC);

-- GIN index for JSONB pattern_data queries
CREATE INDEX IF NOT EXISTS idx_temporal_patterns_data ON temporal_patterns USING GIN(pattern_data);

COMMENT ON TABLE temporal_patterns IS 'Stores temporal access patterns for predictive memory prefetching';
COMMENT ON COLUMN temporal_patterns.pattern_type IS 'Type of pattern: hourly, daily, weekly, sequence, co_access';
COMMENT ON COLUMN temporal_patterns.pattern_data IS 'JSON data describing the pattern (e.g., {"hour": 9, "memories": ["id1", "id2"]})';
COMMENT ON COLUMN temporal_patterns.confidence IS 'Confidence score (0.0-1.0) based on pattern reliability';
COMMENT ON COLUMN temporal_patterns.occurrences IS 'Number of times this pattern has been observed';

-- ============================================================================
-- 2. USER LEARNING PARAMETERS TABLE
-- ============================================================================
-- Stores per-user adaptive weights for personalized search

CREATE TABLE IF NOT EXISTS user_learning_params (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  usage_weight FLOAT DEFAULT 0.3 CHECK (usage_weight >= 0.0 AND usage_weight <= 1.0),
  recency_weight FLOAT DEFAULT 0.2 CHECK (recency_weight >= 0.0 AND recency_weight <= 1.0),
  helpfulness_weight FLOAT DEFAULT 0.5 CHECK (helpfulness_weight >= 0.0 AND helpfulness_weight <= 1.0),
  relationship_weight FLOAT DEFAULT 0.2 CHECK (relationship_weight >= 0.0 AND relationship_weight <= 1.0),
  -- Tracking for adaptive learning
  total_searches INTEGER DEFAULT 0,
  positive_feedback_count INTEGER DEFAULT 0,
  negative_feedback_count INTEGER DEFAULT 0,
  avg_search_satisfaction FLOAT DEFAULT 0.5,
  last_weight_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for active users
CREATE INDEX IF NOT EXISTS idx_user_learning_params_last_update ON user_learning_params(last_weight_update DESC);

COMMENT ON TABLE user_learning_params IS 'Per-user adaptive weights learned from search behavior and feedback';
COMMENT ON COLUMN user_learning_params.usage_weight IS 'Weight for usage count in search ranking (0.0-1.0)';
COMMENT ON COLUMN user_learning_params.avg_search_satisfaction IS 'Running average of user satisfaction with search results';

-- ============================================================================
-- 3. PREDICTION CACHE TABLE
-- ============================================================================
-- Caches prediction results for performance

CREATE TABLE IF NOT EXISTS prediction_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  predictions JSONB NOT NULL DEFAULT '[]',
  context_hash TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour'),
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique index on user_id + cache_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_cache_key ON prediction_cache(user_id, cache_key);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_prediction_cache_expires ON prediction_cache(expires_at);

-- Index for frequently hit predictions
CREATE INDEX IF NOT EXISTS idx_prediction_cache_hits ON prediction_cache(hit_count DESC);

COMMENT ON TABLE prediction_cache IS 'Caches prediction results for performance optimization';
COMMENT ON COLUMN prediction_cache.cache_key IS 'Unique key identifying the prediction context';
COMMENT ON COLUMN prediction_cache.context_hash IS 'Hash of the context used to detect cache invalidation';
COMMENT ON COLUMN prediction_cache.hit_count IS 'Number of times this cached prediction was used';

-- ============================================================================
-- 4. LEARNING METRICS TABLE
-- ============================================================================
-- Time-series data tracking system improvement over time

CREATE TABLE IF NOT EXISTS learning_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('search_accuracy', 'prediction_accuracy', 'avg_helpfulness', 'user_satisfaction', 'relationship_quality')),
  metric_value FLOAT NOT NULL,
  context JSONB DEFAULT '{}',
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for time-series queries
CREATE INDEX IF NOT EXISTS idx_learning_metrics_user ON learning_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_metrics_type ON learning_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_learning_metrics_recorded ON learning_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_metrics_user_type_time ON learning_metrics(user_id, metric_type, recorded_at DESC);

COMMENT ON TABLE learning_metrics IS 'Time-series metrics tracking system learning and improvement';
COMMENT ON COLUMN learning_metrics.metric_type IS 'Type of metric being tracked';
COMMENT ON COLUMN learning_metrics.metric_value IS 'Numeric value of the metric';
COMMENT ON COLUMN learning_metrics.context IS 'Additional context about the metric (e.g., query, memory_id)';

-- ============================================================================
-- FUNCTIONS FOR PHASE 2
-- ============================================================================

-- Function to record a temporal pattern
CREATE OR REPLACE FUNCTION record_temporal_pattern(
    p_user_id UUID,
    p_pattern_type TEXT,
    p_pattern_data JSONB,
    p_confidence FLOAT DEFAULT 0.5
) RETURNS UUID AS $$
DECLARE
    v_pattern_id UUID;
    v_existing_pattern UUID;
BEGIN
    -- Check if similar pattern already exists
    SELECT id INTO v_existing_pattern
    FROM temporal_patterns
    WHERE user_id = p_user_id
      AND pattern_type = p_pattern_type
      AND pattern_data @> p_pattern_data
    LIMIT 1;

    IF v_existing_pattern IS NOT NULL THEN
        -- Update existing pattern
        UPDATE temporal_patterns
        SET occurrences = occurrences + 1,
            last_seen = NOW(),
            confidence = LEAST(1.0, confidence + 0.05),
            updated_at = NOW()
        WHERE id = v_existing_pattern;

        RETURN v_existing_pattern;
    ELSE
        -- Insert new pattern
        INSERT INTO temporal_patterns (user_id, pattern_type, pattern_data, confidence)
        VALUES (p_user_id, p_pattern_type, p_pattern_data, p_confidence)
        RETURNING id INTO v_pattern_id;

        RETURN v_pattern_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update user learning parameters
CREATE OR REPLACE FUNCTION update_learning_params(
    p_user_id UUID,
    p_search_satisfaction FLOAT DEFAULT NULL,
    p_helpful_feedback BOOLEAN DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_alpha FLOAT := 0.1; -- Learning rate
BEGIN
    -- Ensure user params exist
    INSERT INTO user_learning_params (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Update based on feedback
    UPDATE user_learning_params
    SET
        total_searches = total_searches + 1,
        positive_feedback_count = CASE
            WHEN p_helpful_feedback = TRUE THEN positive_feedback_count + 1
            ELSE positive_feedback_count
        END,
        negative_feedback_count = CASE
            WHEN p_helpful_feedback = FALSE THEN negative_feedback_count + 1
            ELSE negative_feedback_count
        END,
        avg_search_satisfaction = CASE
            WHEN p_search_satisfaction IS NOT NULL THEN
                v_alpha * p_search_satisfaction + (1 - v_alpha) * avg_search_satisfaction
            ELSE avg_search_satisfaction
        END,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Adaptive weight adjustment based on feedback patterns
    -- If user gives negative feedback frequently, increase helpfulness weight
    UPDATE user_learning_params
    SET
        helpfulness_weight = CASE
            WHEN negative_feedback_count::FLOAT / GREATEST(total_searches, 1) > 0.3 THEN
                LEAST(0.8, helpfulness_weight + 0.05)
            ELSE helpfulness_weight
        END,
        usage_weight = CASE
            WHEN positive_feedback_count::FLOAT / GREATEST(total_searches, 1) > 0.7 THEN
                GREATEST(0.2, usage_weight - 0.05)
            ELSE usage_weight
        END,
        last_weight_update = NOW()
    WHERE user_id = p_user_id
      AND total_searches % 10 = 0; -- Update weights every 10 searches
END;
$$ LANGUAGE plpgsql;

-- Function to record learning metrics
CREATE OR REPLACE FUNCTION record_learning_metric(
    p_user_id UUID,
    p_metric_type TEXT,
    p_metric_value FLOAT,
    p_context JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_metric_id UUID;
BEGIN
    INSERT INTO learning_metrics (user_id, metric_type, metric_value, context)
    VALUES (p_user_id, p_metric_type, p_metric_value, p_context)
    RETURNING id INTO v_metric_id;

    RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired prediction cache
CREATE OR REPLACE FUNCTION cleanup_expired_predictions() RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM prediction_cache
    WHERE expires_at < NOW();

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ENHANCED VIEWS FOR PHASE 2
-- ============================================================================

-- View: User learning health dashboard
CREATE OR REPLACE VIEW user_learning_health AS
SELECT
    u.id AS user_id,
    u.email,
    ulp.total_searches,
    ulp.avg_search_satisfaction,
    ulp.positive_feedback_count,
    ulp.negative_feedback_count,
    ROUND(
        ulp.positive_feedback_count::NUMERIC /
        NULLIF(ulp.total_searches, 0),
        2
    ) AS positive_feedback_ratio,
    ulp.usage_weight,
    ulp.recency_weight,
    ulp.helpfulness_weight,
    ulp.last_weight_update,
    -- Count of active patterns
    (SELECT COUNT(*) FROM temporal_patterns tp
     WHERE tp.user_id = u.id AND tp.last_seen > NOW() - INTERVAL '30 days') AS active_patterns,
    -- Average memory helpfulness
    (SELECT AVG(helpfulness_score) FROM memories m WHERE m.user_id = u.id) AS avg_memory_helpfulness
FROM users u
LEFT JOIN user_learning_params ulp ON u.id = ulp.user_id;

COMMENT ON VIEW user_learning_health IS 'Dashboard view showing learning system health per user';

-- View: Pattern effectiveness
CREATE OR REPLACE VIEW pattern_effectiveness AS
SELECT
    tp.id,
    tp.user_id,
    tp.pattern_type,
    tp.pattern_data,
    tp.confidence,
    tp.occurrences,
    tp.last_seen,
    DATE_PART('day', NOW() - tp.last_seen) AS days_since_last_seen,
    CASE
        WHEN tp.last_seen > NOW() - INTERVAL '7 days' THEN 'active'
        WHEN tp.last_seen > NOW() - INTERVAL '30 days' THEN 'recent'
        ELSE 'stale'
    END AS pattern_status
FROM temporal_patterns tp;

COMMENT ON VIEW pattern_effectiveness IS 'Shows effectiveness and recency of learned patterns';

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC MAINTENANCE
-- ============================================================================

-- Trigger to update updated_at timestamp on user_learning_params
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_learning_params_updated_at ON user_learning_params;
CREATE TRIGGER trigger_user_learning_params_updated_at
    BEFORE UPDATE ON user_learning_params
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_temporal_patterns_updated_at ON temporal_patterns;
CREATE TRIGGER trigger_temporal_patterns_updated_at
    BEFORE UPDATE ON temporal_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GRANTS (Adjust based on your authentication setup)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE ON temporal_patterns TO authenticated;
-- GRANT SELECT, UPDATE ON user_learning_params TO authenticated;
-- GRANT SELECT ON prediction_cache TO authenticated;
-- GRANT SELECT ON learning_metrics TO authenticated;
-- GRANT SELECT ON user_learning_health TO authenticated;
-- GRANT SELECT ON pattern_effectiveness TO authenticated;

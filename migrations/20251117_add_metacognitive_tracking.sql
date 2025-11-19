-- Migration: Add Metacognitive Tracking to Memories Table
-- Date: 2025-11-17
-- Phase 1: Self-Optimizing Memory - Usage Tracking

-- Add usage tracking columns to memories table
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS helpfulness_score FLOAT DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS access_pattern JSONB DEFAULT '{}';

-- Add comments to document the new columns
COMMENT ON COLUMN memories.usage_count IS 'Number of times this memory has been accessed via GET or search endpoints';
COMMENT ON COLUMN memories.last_accessed IS 'Timestamp of the most recent access to this memory';
COMMENT ON COLUMN memories.helpfulness_score IS 'Learning score (0.0-1.0) based on user feedback and usage patterns';
COMMENT ON COLUMN memories.access_pattern IS 'JSON object tracking access contexts, co-accessed memories, and usage patterns';

-- Create index on last_accessed for efficient time-based queries
CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed DESC);

-- Create index on helpfulness_score for weighted search optimization
CREATE INDEX IF NOT EXISTS idx_memories_helpfulness_score ON memories(helpfulness_score DESC);

-- Create index on usage_count for frequently-accessed queries
CREATE INDEX IF NOT EXISTS idx_memories_usage_count ON memories(usage_count DESC);

-- Create composite index for weighted search (combines score and recency)
CREATE INDEX IF NOT EXISTS idx_memories_weighted_search ON memories(helpfulness_score DESC, last_accessed DESC);

-- Add constraint to ensure helpfulness_score stays in valid range [0.0, 1.0]
ALTER TABLE memories
ADD CONSTRAINT check_helpfulness_score_range
CHECK (helpfulness_score >= 0.0 AND helpfulness_score <= 1.0);

-- Add constraint to ensure usage_count is non-negative
ALTER TABLE memories
ADD CONSTRAINT check_usage_count_non_negative
CHECK (usage_count >= 0);

-- Create function to increment usage tracking (atomic update)
CREATE OR REPLACE FUNCTION increment_memory_usage(
    p_memory_id UUID,
    p_context TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
    UPDATE memories
    SET
        usage_count = usage_count + 1,
        last_accessed = NOW(),
        access_pattern = CASE
            WHEN p_context IS NOT NULL THEN
                jsonb_set(
                    access_pattern,
                    ARRAY['contexts', p_context],
                    to_jsonb(COALESCE((access_pattern->'contexts'->p_context)::INTEGER, 0) + 1)
                )
            ELSE access_pattern
        END
    WHERE id = p_memory_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to update helpfulness score with exponential moving average
CREATE OR REPLACE FUNCTION update_helpfulness_score(
    p_memory_id UUID,
    p_helpful BOOLEAN,
    p_user_satisfaction FLOAT DEFAULT NULL
) RETURNS FLOAT AS $$
DECLARE
    v_current_score FLOAT;
    v_adjustment FLOAT;
    v_new_score FLOAT;
    v_alpha FLOAT := 0.3; -- EMA smoothing factor
BEGIN
    -- Get current score
    SELECT helpfulness_score INTO v_current_score
    FROM memories
    WHERE id = p_memory_id;

    -- Calculate adjustment based on feedback
    IF p_helpful THEN
        v_adjustment := 0.1;
    ELSE
        v_adjustment := -0.05;
    END IF;

    -- Apply user satisfaction if provided (exponential moving average)
    IF p_user_satisfaction IS NOT NULL THEN
        v_new_score := v_alpha * p_user_satisfaction + (1 - v_alpha) * v_current_score;
    ELSE
        v_new_score := LEAST(1.0, GREATEST(0.0, v_current_score + v_adjustment));
    END IF;

    -- Update the score
    UPDATE memories
    SET helpfulness_score = v_new_score
    WHERE id = p_memory_id;

    RETURN v_new_score;
END;
$$ LANGUAGE plpgsql;

-- Create view for memory analytics
CREATE OR REPLACE VIEW memory_analytics AS
SELECT
    m.id,
    m.user_id,
    m.project_id,
    m.text,
    m.usage_count,
    m.last_accessed,
    m.helpfulness_score,
    m.created_at,
    m.tags,
    -- Calculate access frequency category
    CASE
        WHEN m.usage_count > 50 THEN 'very_high'
        WHEN m.usage_count > 20 THEN 'high'
        WHEN m.usage_count > 5 THEN 'medium'
        WHEN m.usage_count > 0 THEN 'low'
        ELSE 'unused'
    END AS access_frequency,
    -- Calculate recency score
    CASE
        WHEN m.last_accessed IS NULL THEN 0
        WHEN m.last_accessed > NOW() - INTERVAL '7 days' THEN 1.0
        WHEN m.last_accessed > NOW() - INTERVAL '30 days' THEN 0.8
        WHEN m.last_accessed > NOW() - INTERVAL '90 days' THEN 0.5
        ELSE 0.3
    END AS recency_score,
    -- Calculate days since last access
    CASE
        WHEN m.last_accessed IS NULL THEN NULL
        ELSE EXTRACT(DAY FROM NOW() - m.last_accessed)
    END AS days_since_access,
    -- Count relationships
    (SELECT COUNT(*) FROM memory_relationships WHERE memory_id = m.id) AS relationship_count
FROM memories m;

COMMENT ON VIEW memory_analytics IS 'Analytics view providing usage insights and computed metrics for memories';

-- Grant appropriate permissions (adjust as needed for your setup)
-- GRANT SELECT ON memory_analytics TO authenticated;
-- GRANT EXECUTE ON FUNCTION increment_memory_usage(UUID, TEXT) TO authenticated;
-- GRANT EXECUTE ON FUNCTION update_helpfulness_score(UUID, BOOLEAN, FLOAT) TO authenticated;

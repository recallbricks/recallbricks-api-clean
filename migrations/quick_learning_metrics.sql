-- Quick Migration: Create learning_metrics table if not exists
-- Run this in Supabase SQL Editor if the learning_metrics table is missing

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

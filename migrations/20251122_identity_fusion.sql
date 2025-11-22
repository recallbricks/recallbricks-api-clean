-- Migration: Identity Fusion Protocol - Agent Identity Schema
-- Date: 2025-11-22
-- Purpose: Add identity schema storage for agent persistent identity

-- ============================================================================
-- 1. ADD IDENTITY_SCHEMA COLUMN TO AGENT_PROFILES
-- ============================================================================
-- Stores the complete identity schema for each agent

ALTER TABLE agent_profiles
ADD COLUMN IF NOT EXISTS identity_schema JSONB DEFAULT NULL;

COMMENT ON COLUMN agent_profiles.identity_schema IS 'Complete identity schema for agent (name, purpose, traits, context_rules, origin_model)';

-- ============================================================================
-- 2. CREATE AGENT_IDENTITY_SNAPSHOTS TABLE
-- ============================================================================
-- Tracks history of identity changes for agents

CREATE TABLE IF NOT EXISTS agent_identity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agent_profiles(id) ON DELETE CASCADE,
  identity_schema JSONB NOT NULL,
  snapshot_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_identity_snapshots_agent ON agent_identity_snapshots(agent_id, created_at DESC);

COMMENT ON TABLE agent_identity_snapshots IS 'History of agent identity schema changes';

-- ============================================================================
-- 3. CREATE AGENT_CONTEXT_LOADS TABLE
-- ============================================================================
-- Tracks when agents load their context (for analytics)

CREATE TABLE IF NOT EXISTS agent_context_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agent_profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  depth_level TEXT CHECK (depth_level IN ('quick', 'standard', 'comprehensive')),
  memories_loaded INTEGER DEFAULT 0,
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_context_loads_agent ON agent_context_loads(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_context_loads_user ON agent_context_loads(user_id, created_at DESC);

COMMENT ON TABLE agent_context_loads IS 'Tracks agent context injection events for analytics';

-- ============================================================================
-- 4. CREATE AGENT_IDENTITY_VIOLATIONS TABLE
-- ============================================================================
-- Tracks identity leakage incidents

CREATE TABLE IF NOT EXISTS agent_identity_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agent_profiles(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL,
  violation_text TEXT NOT NULL,
  response_location TEXT,
  auto_corrected BOOLEAN DEFAULT false,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_violations_agent ON agent_identity_violations(agent_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_violations_type ON agent_identity_violations(violation_type);

COMMENT ON TABLE agent_identity_violations IS 'Tracks identity leakage incidents for monitoring';

-- ============================================================================
-- 5. CREATE MEMORY_IMPORTANCE_CLASSIFICATIONS TABLE
-- ============================================================================
-- Stores classification results for auto-save feature

CREATE TABLE IF NOT EXISTS memory_importance_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category TEXT CHECK (category IN ('decision', 'fact', 'preference', 'outcome', 'brainstorming')),
  should_save BOOLEAN NOT NULL,
  confidence FLOAT CHECK (confidence >= 0.0 AND confidence <= 1.0),
  reasoning TEXT,
  classification_time_ms INTEGER,
  force_saved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_classifications_memory ON memory_importance_classifications(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_classifications_user ON memory_importance_classifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_classifications_category ON memory_importance_classifications(category);

COMMENT ON TABLE memory_importance_classifications IS 'Stores AI classification results for auto-save feature';

-- ============================================================================
-- 6. DEFAULT IDENTITY SCHEMA FUNCTION
-- ============================================================================
-- Creates a minimal default identity schema for agents without one
-- RecallBricks is identity-agnostic - developers define their own agent identities

CREATE OR REPLACE FUNCTION get_default_identity_schema(agent_id_param TEXT)
RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_build_object(
    'agent_id', agent_id_param,
    'created_at', NOW(),
    'schema_version', '1.0',
    'metadata', jsonb_build_object(
      'note', 'Default identity - customize via API'
    )
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_default_identity_schema IS 'Generates minimal default identity schema - developers customize via API';

-- Migration: Phase 3 - Multi-Agent Collaboration
-- Date: 2025-11-18
-- Phase 3: Agent profiles, multi-agent contributions, conflict resolution, knowledge synthesis

-- ============================================================================
-- 1. AGENT PROFILES TABLE
-- ============================================================================
-- Stores identity and metadata for each agent participating in the system

CREATE TABLE IF NOT EXISTS agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  agent_type TEXT CHECK (agent_type IN ('code', 'research', 'documentation', 'test', 'general', 'specialized')),
  agent_metadata JSONB DEFAULT '{}',
  -- Reputation tracking
  reputation_score FLOAT DEFAULT 0.5 CHECK (reputation_score >= 0.0 AND reputation_score <= 1.0),
  total_contributions INTEGER DEFAULT 0,
  accepted_contributions INTEGER DEFAULT 0,
  rejected_contributions INTEGER DEFAULT 0,
  -- Specialization tracking
  expertise_domains TEXT[] DEFAULT '{}',
  confidence_threshold FLOAT DEFAULT 0.7,
  -- Activity tracking
  first_contribution TIMESTAMP WITH TIME ZONE,
  last_contribution TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, agent_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_user ON agent_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_type ON agent_profiles(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_reputation ON agent_profiles(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_active ON agent_profiles(is_active, last_contribution DESC);

COMMENT ON TABLE agent_profiles IS 'Stores identity and reputation for agents contributing to memory system';
COMMENT ON COLUMN agent_profiles.reputation_score IS 'Agent reputation from 0.0 (untrusted) to 1.0 (highly trusted)';
COMMENT ON COLUMN agent_profiles.expertise_domains IS 'Array of domains this agent specializes in';

-- ============================================================================
-- 2. AGENT MEMORY CONTRIBUTIONS TABLE
-- ============================================================================
-- Tracks which agent contributed each memory

CREATE TABLE IF NOT EXISTS agent_memory_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agent_profiles(id) ON DELETE CASCADE,
  contribution_type TEXT CHECK (contribution_type IN ('create', 'update', 'validate', 'synthesize', 'enrich')),
  confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'accepted', 'rejected', 'disputed')),
  validation_notes TEXT,
  contribution_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_contributions_memory ON agent_memory_contributions(memory_id);
CREATE INDEX IF NOT EXISTS idx_agent_contributions_agent ON agent_memory_contributions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_contributions_type ON agent_memory_contributions(contribution_type);
CREATE INDEX IF NOT EXISTS idx_agent_contributions_status ON agent_memory_contributions(validation_status);

COMMENT ON TABLE agent_memory_contributions IS 'Tracks which agent contributed or modified each memory';
COMMENT ON COLUMN agent_memory_contributions.contribution_type IS 'Type of contribution made by the agent';
COMMENT ON COLUMN agent_memory_contributions.confidence IS 'Agent confidence in this contribution';

-- ============================================================================
-- 3. MEMORY CONFLICTS TABLE
-- ============================================================================
-- Detects and tracks conflicts between memories from different agents

CREATE TABLE IF NOT EXISTS memory_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_a_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  memory_b_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  conflict_type TEXT CHECK (conflict_type IN ('contradiction', 'outdated', 'duplicate', 'inconsistent')),
  severity FLOAT DEFAULT 0.5 CHECK (severity >= 0.0 AND severity <= 1.0),
  detection_method TEXT,
  conflict_details JSONB DEFAULT '{}',
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_strategy TEXT,
  resolution_outcome JSONB DEFAULT '{}',
  resolved_by UUID REFERENCES agent_profiles(id),
  CHECK (memory_a_id < memory_b_id) -- Ensure consistent ordering
);

CREATE INDEX IF NOT EXISTS idx_memory_conflicts_memory_a ON memory_conflicts(memory_a_id);
CREATE INDEX IF NOT EXISTS idx_memory_conflicts_memory_b ON memory_conflicts(memory_b_id);
CREATE INDEX IF NOT EXISTS idx_memory_conflicts_type ON memory_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS idx_memory_conflicts_unresolved ON memory_conflicts(resolved_at) WHERE resolved_at IS NULL;

COMMENT ON TABLE memory_conflicts IS 'Tracks conflicts between memories from different agents';
COMMENT ON COLUMN memory_conflicts.severity IS 'Conflict severity from 0.0 (minor) to 1.0 (critical)';
COMMENT ON COLUMN memory_conflicts.resolution_strategy IS 'How the conflict was resolved (trust_higher_rep, merge, keep_both, manual)';

-- ============================================================================
-- 4. SYNTHESIS HISTORY TABLE
-- ============================================================================
-- Tracks when multiple memories are synthesized into consolidated knowledge

CREATE TABLE IF NOT EXISTS synthesis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesized_memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  source_memory_ids UUID[] NOT NULL,
  synthesizing_agent_id UUID REFERENCES agent_profiles(id),
  synthesis_method TEXT,
  synthesis_confidence FLOAT DEFAULT 0.7 CHECK (synthesis_confidence >= 0.0 AND synthesis_confidence <= 1.0),
  synthesis_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_synthesis_history_synthesized ON synthesis_history(synthesized_memory_id);
CREATE INDEX IF NOT EXISTS idx_synthesis_history_agent ON synthesis_history(synthesizing_agent_id);
CREATE INDEX IF NOT EXISTS idx_synthesis_history_created ON synthesis_history(created_at DESC);

COMMENT ON TABLE synthesis_history IS 'Tracks synthesis of multiple memories into consolidated knowledge';
COMMENT ON COLUMN synthesis_history.source_memory_ids IS 'Array of memory IDs that were synthesized';

-- ============================================================================
-- 5. AGENT TRUST NETWORK TABLE
-- ============================================================================
-- Tracks trust relationships between agents

CREATE TABLE IF NOT EXISTS agent_trust_network (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agent_profiles(id) ON DELETE CASCADE,
  trusted_agent_id UUID REFERENCES agent_profiles(id) ON DELETE CASCADE,
  trust_score FLOAT DEFAULT 0.5 CHECK (trust_score >= 0.0 AND trust_score <= 1.0),
  trust_reason TEXT,
  collaboration_count INTEGER DEFAULT 0,
  successful_collaborations INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (agent_id != trusted_agent_id), -- Can't trust yourself
  UNIQUE(agent_id, trusted_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_trust_agent ON agent_trust_network(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_trust_trusted_agent ON agent_trust_network(trusted_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_trust_score ON agent_trust_network(trust_score DESC);

COMMENT ON TABLE agent_trust_network IS 'Tracks trust relationships between agents';
COMMENT ON COLUMN agent_trust_network.trust_score IS 'Trust level from 0.0 (no trust) to 1.0 (full trust)';

-- ============================================================================
-- 6. MEMORY POOLS TABLE (OPTIONAL)
-- ============================================================================
-- Shared memory pools for multi-agent collaboration

CREATE TABLE IF NOT EXISTS memory_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pool_name TEXT NOT NULL,
  pool_description TEXT,
  pool_type TEXT CHECK (pool_type IN ('shared', 'private', 'team', 'public')),
  access_control JSONB DEFAULT '{}',
  pool_metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES agent_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, pool_name)
);

CREATE INDEX IF NOT EXISTS idx_memory_pools_user ON memory_pools(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_pools_type ON memory_pools(pool_type);

COMMENT ON TABLE memory_pools IS 'Shared memory pools for organizing collaborative memories';

-- ============================================================================
-- 7. MEMORY POOL MEMBERSHIPS TABLE
-- ============================================================================
-- Maps memories to pools

CREATE TABLE IF NOT EXISTS memory_pool_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  pool_id UUID REFERENCES memory_pools(id) ON DELETE CASCADE,
  added_by UUID REFERENCES agent_profiles(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(memory_id, pool_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_memberships_memory ON memory_pool_memberships(memory_id);
CREATE INDEX IF NOT EXISTS idx_pool_memberships_pool ON memory_pool_memberships(pool_id);

-- ============================================================================
-- FUNCTIONS FOR PHASE 3
-- ============================================================================

-- Function to calculate agent reputation score
CREATE OR REPLACE FUNCTION calculate_agent_reputation(p_agent_id UUID)
RETURNS FLOAT AS $$
DECLARE
  v_total_contributions INTEGER;
  v_accepted_contributions INTEGER;
  v_rejected_contributions INTEGER;
  v_acceptance_rate FLOAT;
  v_avg_contribution_helpfulness FLOAT;
  v_reputation_score FLOAT;
BEGIN
  -- Get contribution stats
  SELECT
    total_contributions,
    accepted_contributions,
    rejected_contributions
  INTO
    v_total_contributions,
    v_accepted_contributions,
    v_rejected_contributions
  FROM agent_profiles
  WHERE id = p_agent_id;

  -- Calculate acceptance rate
  IF v_total_contributions > 0 THEN
    v_acceptance_rate := v_accepted_contributions::FLOAT / v_total_contributions::FLOAT;
  ELSE
    v_acceptance_rate := 0.5; -- Default for new agents
  END IF;

  -- Get average helpfulness of agent's contributions
  SELECT AVG(m.helpfulness_score)
  INTO v_avg_contribution_helpfulness
  FROM memories m
  INNER JOIN agent_memory_contributions amc ON m.id = amc.memory_id
  WHERE amc.agent_id = p_agent_id
    AND amc.validation_status = 'accepted';

  IF v_avg_contribution_helpfulness IS NULL THEN
    v_avg_contribution_helpfulness := 0.5;
  END IF;

  -- Calculate reputation: weighted combination of acceptance rate and helpfulness
  v_reputation_score := (v_acceptance_rate * 0.6) + (v_avg_contribution_helpfulness * 0.4);

  -- Apply experience bonus (caps at 20% bonus for 100+ contributions)
  IF v_total_contributions > 0 THEN
    v_reputation_score := v_reputation_score * (1.0 + LEAST(v_total_contributions / 500.0, 0.2));
  END IF;

  -- Ensure within bounds
  v_reputation_score := GREATEST(0.0, LEAST(1.0, v_reputation_score));

  -- Update agent profile
  UPDATE agent_profiles
  SET reputation_score = v_reputation_score,
      updated_at = NOW()
  WHERE id = p_agent_id;

  RETURN v_reputation_score;
END;
$$ LANGUAGE plpgsql;

-- Function to detect memory conflicts
CREATE OR REPLACE FUNCTION detect_memory_conflicts(
  p_memory_id UUID,
  p_conflict_threshold FLOAT DEFAULT 0.8
) RETURNS TABLE (
  conflict_id UUID,
  conflicting_memory_id UUID,
  conflict_type TEXT,
  severity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH memory_data AS (
    SELECT id, text, user_id, created_at, helpfulness_score
    FROM memories
    WHERE id = p_memory_id
  ),
  potential_conflicts AS (
    -- Find contradictions using text similarity
    SELECT
      m2.id AS conflicting_memory_id,
      'contradiction' AS conflict_type,
      0.8 AS severity
    FROM memories m2, memory_data md
    WHERE m2.user_id = md.user_id
      AND m2.id != md.id
      AND m2.text ILIKE '%NOT%' || md.text || '%'
      OR m2.text ILIKE '%INCORRECT%' || md.text || '%'

    UNION ALL

    -- Find duplicates (handled by Jaccard similarity in app layer)
    SELECT
      m2.id AS conflicting_memory_id,
      'duplicate' AS conflict_type,
      0.5 AS severity
    FROM memories m2, memory_data md
    WHERE m2.user_id = md.user_id
      AND m2.id != md.id
      AND m2.text = md.text

    UNION ALL

    -- Find outdated info (newer memory with similar content)
    SELECT
      m2.id AS conflicting_memory_id,
      'outdated' AS conflict_type,
      0.6 AS severity
    FROM memories m2, memory_data md
    WHERE m2.user_id = md.user_id
      AND m2.id != md.id
      AND m2.created_at > md.created_at
      AND m2.helpfulness_score > md.helpfulness_score
      AND similarity(m2.text, md.text) > 0.7
  )
  SELECT
    gen_random_uuid() AS conflict_id,
    pc.conflicting_memory_id,
    pc.conflict_type,
    pc.severity
  FROM potential_conflicts pc;
END;
$$ LANGUAGE plpgsql;

-- Function to synthesize knowledge from multiple memories
CREATE OR REPLACE FUNCTION synthesize_knowledge(
  p_source_memory_ids UUID[],
  p_agent_id UUID,
  p_synthesized_text TEXT,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_synthesized_memory_id UUID;
BEGIN
  -- Create synthesized memory
  INSERT INTO memories (user_id, text, source, metadata)
  VALUES (
    p_user_id,
    p_synthesized_text,
    'synthesis',
    jsonb_build_object(
      'synthesized_from', p_source_memory_ids,
      'synthesized_by', p_agent_id,
      'source_count', array_length(p_source_memory_ids, 1)
    )
  )
  RETURNING id INTO v_synthesized_memory_id;

  -- Record synthesis history
  INSERT INTO synthesis_history (
    synthesized_memory_id,
    source_memory_ids,
    synthesizing_agent_id,
    synthesis_method
  ) VALUES (
    v_synthesized_memory_id,
    p_source_memory_ids,
    p_agent_id,
    'multi_source_synthesis'
  );

  -- Record agent contribution
  INSERT INTO agent_memory_contributions (
    memory_id,
    agent_id,
    contribution_type,
    confidence
  ) VALUES (
    v_synthesized_memory_id,
    p_agent_id,
    'synthesize',
    0.8
  );

  -- Create relationships to source memories
  INSERT INTO memory_relationships (memory_id, related_memory_id, relationship_type, strength, explanation)
  SELECT
    v_synthesized_memory_id,
    unnest(p_source_memory_ids),
    'synthesized_from',
    0.9,
    'This memory synthesizes information from multiple sources'
  ON CONFLICT DO NOTHING;

  RETURN v_synthesized_memory_id;
END;
$$ LANGUAGE plpgsql;

-- Function to resolve conflicts
CREATE OR REPLACE FUNCTION resolve_conflict(
  p_conflict_id UUID,
  p_resolution_strategy TEXT,
  p_resolved_by UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_memory_a_id UUID;
  v_memory_b_id UUID;
  v_agent_a_reputation FLOAT;
  v_agent_b_reputation FLOAT;
BEGIN
  -- Get conflict details
  SELECT memory_a_id, memory_b_id
  INTO v_memory_a_id, v_memory_b_id
  FROM memory_conflicts
  WHERE id = p_conflict_id;

  -- Get agent reputations
  SELECT COALESCE(MAX(ap.reputation_score), 0.5)
  INTO v_agent_a_reputation
  FROM agent_memory_contributions amc
  JOIN agent_profiles ap ON amc.agent_id = ap.id
  WHERE amc.memory_id = v_memory_a_id;

  SELECT COALESCE(MAX(ap.reputation_score), 0.5)
  INTO v_agent_b_reputation
  FROM agent_memory_contributions amc
  JOIN agent_profiles ap ON amc.agent_id = ap.id
  WHERE amc.memory_id = v_memory_b_id;

  -- Apply resolution strategy
  IF p_resolution_strategy = 'trust_higher_rep' THEN
    IF v_agent_a_reputation > v_agent_b_reputation THEN
      -- Mark memory B as less helpful
      UPDATE memories SET helpfulness_score = helpfulness_score * 0.7 WHERE id = v_memory_b_id;
    ELSE
      UPDATE memories SET helpfulness_score = helpfulness_score * 0.7 WHERE id = v_memory_a_id;
    END IF;
  ELSIF p_resolution_strategy = 'merge' THEN
    -- This would trigger synthesis (handled in application layer)
    NULL;
  ELSIF p_resolution_strategy = 'keep_both' THEN
    -- Just mark as resolved, keep both memories
    NULL;
  END IF;

  -- Mark conflict as resolved
  UPDATE memory_conflicts
  SET resolved_at = NOW(),
      resolution_strategy = p_resolution_strategy,
      resolved_by = p_resolved_by
  WHERE id = p_conflict_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to update agent contribution stats
CREATE OR REPLACE FUNCTION update_agent_contribution_stats(
  p_agent_id UUID,
  p_contribution_accepted BOOLEAN
) RETURNS void AS $$
BEGIN
  UPDATE agent_profiles
  SET
    total_contributions = total_contributions + 1,
    accepted_contributions = CASE
      WHEN p_contribution_accepted THEN accepted_contributions + 1
      ELSE accepted_contributions
    END,
    rejected_contributions = CASE
      WHEN NOT p_contribution_accepted THEN rejected_contributions + 1
      ELSE rejected_contributions
    END,
    last_contribution = NOW(),
    first_contribution = COALESCE(first_contribution, NOW()),
    updated_at = NOW()
  WHERE id = p_agent_id;

  -- Recalculate reputation
  PERFORM calculate_agent_reputation(p_agent_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR PHASE 3
-- ============================================================================

-- View: Collaborative memory health
CREATE OR REPLACE VIEW collaborative_memory_health AS
SELECT
  u.id AS user_id,
  u.email,
  COUNT(DISTINCT ap.id) AS total_agents,
  COUNT(DISTINCT CASE WHEN ap.last_contribution > NOW() - INTERVAL '24 hours' THEN ap.id END) AS active_agents_24h,
  COUNT(DISTINCT m.id) AS total_memories,
  COUNT(DISTINCT amc.id) AS total_contributions,
  COUNT(DISTINCT sh.id) AS total_syntheses,
  COUNT(DISTINCT mc.id) AS total_conflicts,
  COUNT(DISTINCT CASE WHEN mc.resolved_at IS NULL THEN mc.id END) AS unresolved_conflicts,
  ROUND(AVG(ap.reputation_score)::NUMERIC, 2) AS avg_agent_reputation,
  ROUND(
    COUNT(DISTINCT CASE WHEN mc.resolved_at IS NOT NULL THEN mc.id END)::NUMERIC /
    NULLIF(COUNT(DISTINCT mc.id), 0),
    2
  ) AS conflict_resolution_rate
FROM users u
LEFT JOIN agent_profiles ap ON u.id = ap.user_id
LEFT JOIN memories m ON u.id = m.user_id
LEFT JOIN agent_memory_contributions amc ON m.id = amc.memory_id
LEFT JOIN synthesis_history sh ON sh.synthesizing_agent_id = ap.id
LEFT JOIN memory_conflicts mc ON m.id IN (mc.memory_a_id, mc.memory_b_id)
GROUP BY u.id, u.email;

COMMENT ON VIEW collaborative_memory_health IS 'Shows collaboration health metrics per user';

-- View: Agent performance dashboard
CREATE OR REPLACE VIEW agent_performance_dashboard AS
SELECT
  ap.id AS agent_id,
  ap.agent_name,
  ap.agent_type,
  ap.user_id,
  ap.reputation_score,
  ap.total_contributions,
  ap.accepted_contributions,
  ap.rejected_contributions,
  ROUND(
    ap.accepted_contributions::NUMERIC /
    NULLIF(ap.total_contributions, 0),
    2
  ) AS acceptance_rate,
  COUNT(DISTINCT sh.id) AS syntheses_created,
  COUNT(DISTINCT mc.id) AS conflicts_resolved,
  ap.last_contribution,
  DATE_PART('day', NOW() - ap.last_contribution) AS days_since_contribution,
  CASE
    WHEN ap.last_contribution > NOW() - INTERVAL '24 hours' THEN 'active'
    WHEN ap.last_contribution > NOW() - INTERVAL '7 days' THEN 'recent'
    WHEN ap.last_contribution > NOW() - INTERVAL '30 days' THEN 'inactive'
    ELSE 'dormant'
  END AS activity_status
FROM agent_profiles ap
LEFT JOIN synthesis_history sh ON ap.id = sh.synthesizing_agent_id
LEFT JOIN memory_conflicts mc ON ap.id = mc.resolved_by
GROUP BY ap.id;

COMMENT ON VIEW agent_performance_dashboard IS 'Dashboard showing performance metrics for each agent';

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC MAINTENANCE
-- ============================================================================

-- Trigger to update agent stats when contribution validation changes
CREATE OR REPLACE FUNCTION trigger_update_agent_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.validation_status = 'accepted' AND OLD.validation_status != 'accepted' THEN
    PERFORM update_agent_contribution_stats(NEW.agent_id, true);
  ELSIF NEW.validation_status = 'rejected' AND OLD.validation_status != 'rejected' THEN
    PERFORM update_agent_contribution_stats(NEW.agent_id, false);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_agent_contribution_validation ON agent_memory_contributions;
CREATE TRIGGER trigger_agent_contribution_validation
  AFTER UPDATE ON agent_memory_contributions
  FOR EACH ROW
  WHEN (OLD.validation_status IS DISTINCT FROM NEW.validation_status)
  EXECUTE FUNCTION trigger_update_agent_stats();

-- Trigger to auto-detect conflicts on new memory creation
CREATE OR REPLACE FUNCTION trigger_auto_detect_conflicts()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert detected conflicts
  INSERT INTO memory_conflicts (
    memory_a_id,
    memory_b_id,
    conflict_type,
    severity,
    detection_method
  )
  SELECT
    LEAST(NEW.id, conflict_id),
    GREATEST(NEW.id, conflict_id),
    conflict_type,
    severity,
    'auto_detect'
  FROM detect_memory_conflicts(NEW.id, 0.7)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only enable auto-detection if desired (can be expensive)
-- CREATE TRIGGER trigger_memory_conflict_detection
--   AFTER INSERT ON memories
--   FOR EACH ROW
--   EXECUTE FUNCTION trigger_auto_detect_conflicts();

-- Update triggers for timestamps
DROP TRIGGER IF EXISTS trigger_agent_profiles_updated_at ON agent_profiles;
CREATE TRIGGER trigger_agent_profiles_updated_at
  BEFORE UPDATE ON agent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_memory_pools_updated_at ON memory_pools;
CREATE TRIGGER trigger_memory_pools_updated_at
  BEFORE UPDATE ON memory_pools
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_agent_trust_network_updated_at ON agent_trust_network;
CREATE TRIGGER trigger_agent_trust_network_updated_at
  BEFORE UPDATE ON agent_trust_network
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Additional indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_agent_contributions_created ON agent_memory_contributions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_synthesis_history_source_ids ON synthesis_history USING GIN(source_memory_ids);

-- Index for conflict queries
CREATE INDEX IF NOT EXISTS idx_memory_conflicts_detected ON memory_conflicts(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_conflicts_severity ON memory_conflicts(severity DESC);

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Insert a default "system" agent for auto-synthesis
-- INSERT INTO agent_profiles (agent_name, agent_type, user_id, reputation_score, is_active)
-- SELECT 'system_synthesizer', 'general', id, 0.9, true
-- FROM users
-- LIMIT 1
-- ON CONFLICT DO NOTHING;

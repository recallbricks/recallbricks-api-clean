/**
 * Collaboration Service
 *
 * Core business logic for Phase 3 multi-agent collaboration features
 */

import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { auditLogger } from './auditLogger.js';
import type {
  AgentProfile,
  AgentMemoryContribution,
  MemoryConflict,
  SynthesisHistory,
  CreateAgentRequest,
  ContributeMemoryRequest,
  SynthesizeRequest,
  CollaborationDashboard,
  CrossAgentLearningRequest,
  LearningPattern,
  AgentPerformanceMetrics
} from '../types/recallbricks.js';

/**
 * Create a new agent profile
 */
export async function createAgentProfile(
  userId: string,
  agentData: CreateAgentRequest
): Promise<AgentProfile> {
  const { data, error } = await supabase
    .from('agent_profiles')
    .insert({
      user_id: userId,
      agent_name: agentData.agent_name,
      agent_type: agentData.agent_type,
      expertise_domains: agentData.expertise_domains || [],
      confidence_threshold: agentData.confidence_threshold || 0.7,
      agent_metadata: agentData.agent_metadata || {}
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create agent profile', { error, userId, agentData });
    throw new Error(`Failed to create agent profile: ${error.message}`);
  }

  logger.info('Agent profile created', { agentId: data.id, agentName: data.agent_name });

  // Audit log
  await auditLogger.logEvent({
    event_type: 'agent_created',
    event_category: 'collaboration',
    severity: 'info',
    user_id: userId,
    agent_id: data.id,
    event_data: {
      agent_name: data.agent_name,
      agent_type: data.agent_type,
      expertise_domains: data.expertise_domains,
    },
    success: true,
  });

  return data;
}

/**
 * Get agent profile by ID
 */
export async function getAgentProfile(agentId: string): Promise<AgentProfile | null> {
  const { data, error } = await supabase
    .from('agent_profiles')
    .select('*')
    .eq('id', agentId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to get agent profile', { error, agentId });
    throw new Error(`Failed to get agent profile: ${error.message}`);
  }

  return data || null;
}

/**
 * List all agents for a user
 */
export async function listUserAgents(userId: string): Promise<AgentProfile[]> {
  const { data, error } = await supabase
    .from('agent_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('last_contribution', { ascending: false, nullsFirst: false });

  if (error) {
    logger.error('Failed to list agents', { error, userId });
    throw new Error(`Failed to list agents: ${error.message}`);
  }

  return data || [];
}

/**
 * Update agent reputation score
 */
export async function updateAgentReputation(agentId: string): Promise<number> {
  // Get old reputation for audit
  const agent = await getAgentProfile(agentId);
  const oldScore = agent?.reputation_score || 0.5;

  const { data, error } = await supabase
    .rpc('calculate_agent_reputation', { p_agent_id: agentId });

  if (error) {
    logger.error('Failed to calculate reputation', { error, agentId });
    throw new Error(`Failed to calculate reputation: ${error.message}`);
  }

  const newScore = data || 0.5;

  // Audit log reputation update
  await auditLogger.logReputationUpdate({
    agent_id: agentId,
    old_score: oldScore,
    new_score: newScore,
    reason: 'recalculated',
    delta: newScore - oldScore,
  });

  return newScore;
}

/**
 * Record an agent's memory contribution
 */
export async function recordContribution(
  memoryId: string,
  agentId: string,
  contributionType: 'create' | 'update' | 'validate' | 'synthesize' | 'enrich',
  confidence: number = 0.8
): Promise<AgentMemoryContribution> {
  const { data, error } = await supabase
    .from('agent_memory_contributions')
    .insert({
      memory_id: memoryId,
      agent_id: agentId,
      contribution_type: contributionType,
      confidence,
      validation_status: 'accepted' // Auto-accept for now
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to record contribution', { error, memoryId, agentId });
    throw new Error(`Failed to record contribution: ${error.message}`);
  }

  // Update agent stats
  await supabase.rpc('update_agent_contribution_stats', {
    p_agent_id: agentId,
    p_contribution_accepted: true
  });

  // Audit log contribution (map contribution types to audit types)
  const auditTypeMap: Record<string, 'created' | 'updated' | 'verified'> = {
    'create': 'created',
    'update': 'updated',
    'validate': 'verified',
    'synthesize': 'created',
    'enrich': 'updated'
  };

  await auditLogger.logContribution({
    agent_id: agentId,
    memory_id: memoryId,
    contribution_type: auditTypeMap[contributionType],
    confidence,
  });

  return data;
}

/**
 * Agent contributes a memory
 */
export async function agentContributeMemory(
  userId: string,
  contributionData: ContributeMemoryRequest
): Promise<{ memory: any; contribution: AgentMemoryContribution }> {
  const { agent_id, text, contribution_type, confidence, source, project_id, tags, metadata } = contributionData;

  // Verify agent belongs to user
  const agent = await getAgentProfile(agent_id);
  if (!agent || agent.user_id !== userId) {
    throw new Error('Agent not found or does not belong to user');
  }

  // Create memory
  const { data: memory, error: memoryError } = await supabase
    .from('memories')
    .insert({
      user_id: userId,
      text,
      source: source || 'agent',
      project_id: project_id || 'default',
      tags: tags || [],
      metadata: {
        ...(metadata || {}),
        contributed_by_agent: agent_id,
        agent_type: agent.agent_type
      }
    })
    .select()
    .single();

  if (memoryError) {
    throw new Error(`Failed to create memory: ${memoryError.message}`);
  }

  // Record contribution
  const contribution = await recordContribution(
    memory.id,
    agent_id,
    contribution_type || 'create',
    confidence || 0.8
  );

  logger.info('Agent contributed memory', {
    agentId: agent_id,
    memoryId: memory.id,
    contributionType: contribution_type
  });

  return { memory, contribution };
}

/**
 * Detect conflicts for a memory
 */
export async function detectConflicts(
  memoryId: string,
  conflictThreshold: number = 0.7
): Promise<MemoryConflict[]> {
  const { data, error } = await supabase
    .rpc('detect_memory_conflicts', {
      p_memory_id: memoryId,
      p_conflict_threshold: conflictThreshold
    });

  if (error) {
    logger.error('Failed to detect conflicts', { error, memoryId });
    return [];
  }

  // Store detected conflicts
  if (data && data.length > 0) {
    const conflicts = data.map((conflict: any) => ({
      memory_a_id: memoryId < conflict.conflicting_memory_id ? memoryId : conflict.conflicting_memory_id,
      memory_b_id: memoryId < conflict.conflicting_memory_id ? conflict.conflicting_memory_id : memoryId,
      conflict_type: conflict.conflict_type,
      severity: conflict.severity,
      detection_method: 'auto_detect',
      conflict_details: {}
    }));

    const { error: insertError } = await supabase
      .from('memory_conflicts')
      .insert(conflicts)
      .select();

    if (insertError && insertError.code !== '23505') { // Ignore duplicates
      logger.error('Failed to store conflicts', { error: insertError });
    }
  }

  return data || [];
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(
  conflictId: string,
  resolutionStrategy: 'trust_higher_rep' | 'merge' | 'keep_both' | 'manual',
  resolvedBy: string
): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('resolve_conflict', {
      p_conflict_id: conflictId,
      p_resolution_strategy: resolutionStrategy,
      p_resolved_by: resolvedBy
    });

  if (error) {
    logger.error('Failed to resolve conflict', { error, conflictId });
    return false;
  }

  logger.info('Conflict resolved', { conflictId, strategy: resolutionStrategy });
  return data || false;
}

/**
 * Synthesize knowledge from multiple memories
 */
export async function synthesizeKnowledge(
  userId: string,
  synthesisData: SynthesizeRequest
): Promise<{ synthesized_memory: any; synthesis_history: SynthesisHistory }> {
  const { agent_id, source_memory_ids, synthesis_method } = synthesisData;

  // Verify agent
  const agent = await getAgentProfile(agent_id);
  if (!agent || agent.user_id !== userId) {
    throw new Error('Agent not found or does not belong to user');
  }

  // Fetch source memories
  const { data: sourceMemories, error: fetchError } = await supabase
    .from('memories')
    .select('text, metadata')
    .in('id', source_memory_ids)
    .eq('user_id', userId);

  if (fetchError || !sourceMemories || sourceMemories.length === 0) {
    throw new Error('Failed to fetch source memories or no memories found');
  }

  // Create synthesized text (simple concatenation for now)
  const synthesizedText = `SYNTHESIZED KNOWLEDGE:\n\n${sourceMemories.map((m, i) =>
    `Source ${i + 1}: ${m.text}`
  ).join('\n\n')}\n\n[Synthesized by ${agent.agent_name}]`;

  // Create synthesized memory using database function
  const { data: synthesizedMemoryId, error: synthError } = await supabase
    .rpc('synthesize_knowledge', {
      p_source_memory_ids: source_memory_ids,
      p_agent_id: agent_id,
      p_synthesized_text: synthesizedText,
      p_user_id: userId
    });

  if (synthError) {
    throw new Error(`Failed to synthesize knowledge: ${synthError.message}`);
  }

  // Fetch the created memory
  const { data: synthesizedMemory } = await supabase
    .from('memories')
    .select('*')
    .eq('id', synthesizedMemoryId)
    .single();

  // Fetch synthesis history
  const { data: synthesisHistory } = await supabase
    .from('synthesis_history')
    .select('*')
    .eq('synthesized_memory_id', synthesizedMemoryId)
    .single();

  logger.info('Knowledge synthesized', {
    agentId: agent_id,
    synthesizedMemoryId,
    sourceCount: source_memory_ids.length
  });

  return {
    synthesized_memory: synthesizedMemory,
    synthesis_history: synthesisHistory
  };
}

/**
 * Get collaboration dashboard for a user
 */
export async function getCollaborationDashboard(userId: string): Promise<CollaborationDashboard> {
  // Get dashboard data from view
  const { data: dashboardData } = await supabase
    .from('collaborative_memory_health')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Get recent syntheses
  const { data: recentSyntheses } = await supabase
    .from('synthesis_history')
    .select(`
      *,
      agent_profiles!synthesis_history_synthesizing_agent_id_fkey(agent_name)
    `)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get top contributors
  const { data: topContributors } = await supabase
    .from('agent_performance_dashboard')
    .select('agent_name, reputation_score, total_contributions')
    .eq('user_id', userId)
    .order('reputation_score', { ascending: false })
    .limit(5);

  // Get memory pools stats
  const { data: pools } = await supabase
    .from('memory_pools')
    .select(`
      pool_name,
      id,
      memory_pool_memberships(count)
    `)
    .eq('user_id', userId);

  const memoryPools = (pools || []).map((pool: any) => ({
    name: pool.pool_name,
    memories: pool.memory_pool_memberships?.[0]?.count || 0,
    contributors: 0, // Would need to join with contributions
    synthesis_count: 0 // Would need to join with synthesis
  }));

  return {
    total_agents: dashboardData?.total_agents || 0,
    active_agents_24h: dashboardData?.active_agents_24h || 0,
    memory_pools: memoryPools,
    recent_syntheses: recentSyntheses || [],
    top_contributors: topContributors || [],
    conflict_resolution_rate: dashboardData?.conflict_resolution_rate || 0,
    unresolved_conflicts: dashboardData?.unresolved_conflicts || 0
  };
}

/**
 * Transfer learning patterns from one agent to another
 */
export async function transferLearning(
  transferData: CrossAgentLearningRequest
): Promise<{ transferred_patterns: LearningPattern[]; count: number }> {
  const { source_agent_id, target_agent_id, pattern_types, min_confidence } = transferData;

  // Verify agents exist
  const sourceAgent = await getAgentProfile(source_agent_id);
  const targetAgent = await getAgentProfile(target_agent_id);

  if (!sourceAgent || !targetAgent) {
    throw new Error('Source or target agent not found');
  }

  if (sourceAgent.user_id !== targetAgent.user_id) {
    throw new Error('Agents must belong to the same user');
  }

  // Get temporal patterns from source agent's contributions
  const { data: sourcePatterns } = await supabase
    .from('temporal_patterns')
    .select('*')
    .eq('user_id', sourceAgent.user_id)
    .gte('confidence', min_confidence || 0.6)
    .order('confidence', { ascending: false });

  if (!sourcePatterns || sourcePatterns.length === 0) {
    return { transferred_patterns: [], count: 0 };
  }

  // Filter by pattern types if specified
  const filteredPatterns = pattern_types && pattern_types.length > 0
    ? sourcePatterns.filter(p => pattern_types.includes(p.pattern_type))
    : sourcePatterns;

  // Transfer patterns to target (store in metadata)
  const transferredPatterns: LearningPattern[] = filteredPatterns.map(pattern => ({
    pattern_type: pattern.pattern_type,
    pattern_data: pattern.pattern_data,
    confidence: pattern.confidence * 0.8, // Reduce confidence for transferred patterns
    source_agent: sourceAgent.agent_name
  }));

  // Update target agent metadata with transferred patterns
  const { error: updateError } = await supabase
    .from('agent_profiles')
    .update({
      agent_metadata: {
        ...targetAgent.agent_metadata,
        transferred_patterns: transferredPatterns,
        last_learning_transfer: new Date().toISOString(),
        transfer_source: sourceAgent.agent_name
      }
    })
    .eq('id', target_agent_id);

  if (updateError) {
    logger.error('Failed to transfer learning', { error: updateError });
    throw new Error('Failed to transfer learning patterns');
  }

  logger.info('Learning transferred', {
    sourceAgent: source_agent_id,
    targetAgent: target_agent_id,
    patternsCount: transferredPatterns.length
  });

  return {
    transferred_patterns: transferredPatterns,
    count: transferredPatterns.length
  };
}

/**
 * Get agent performance metrics
 */
export async function getAgentPerformance(agentId: string): Promise<AgentPerformanceMetrics | null> {
  const { data, error } = await supabase
    .from('agent_performance_dashboard')
    .select('*')
    .eq('agent_id', agentId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to get agent performance', { error, agentId });
    return null;
  }

  return data || null;
}

/**
 * List unresolved conflicts for a user
 */
export async function listUnresolvedConflicts(userId: string): Promise<MemoryConflict[]> {
  const { data, error } = await supabase
    .from('memory_conflicts')
    .select(`
      *,
      memories!memory_conflicts_memory_a_id_fkey(text, user_id),
      memories_b:memories!memory_conflicts_memory_b_id_fkey(text)
    `)
    .is('resolved_at', null)
    .eq('memories.user_id', userId)
    .order('severity', { ascending: false })
    .limit(20);

  if (error) {
    logger.error('Failed to list conflicts', { error, userId });
    return [];
  }

  return data || [];
}

/**
 * Validate a contribution
 */
export async function validateContribution(
  contributionId: string,
  validationStatus: 'accepted' | 'rejected' | 'disputed',
  validationNotes?: string
): Promise<boolean> {
  const { error } = await supabase
    .from('agent_memory_contributions')
    .update({
      validation_status: validationStatus,
      validation_notes: validationNotes || null
    })
    .eq('id', contributionId);

  if (error) {
    logger.error('Failed to validate contribution', { error, contributionId });
    return false;
  }

  logger.info('Contribution validated', { contributionId, status: validationStatus });
  return true;
}

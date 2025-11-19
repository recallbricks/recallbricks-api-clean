/**
 * TypeScript Type Definitions for RecallBricks
 */

export interface User {
  id: string;
  email?: string;
  api_key: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  memory_count: number;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface Memory {
  id: string;
  user_id: string;
  text: string;
  source: 'claude' | 'chatgpt' | 'cursor' | 'manual' | 'api';
  project_id: string;
  tags: string[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Metacognitive tracking fields (Phase 1)
  usage_count?: number;
  last_accessed?: string;
  helpfulness_score?: number;
  access_pattern?: Record<string, any>;
  learning_metadata?: LearningMetadata;
}

export interface CreateMemoryRequest {
  text: string;
  source?: string;
  project_id?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface MemoryRelationship {
  id: string;
  memory_id: string;
  related_memory_id: string;
  relationship_type: 'related_to' | 'caused_by' | 'similar_to' | 'follows' | 'contradicts';
  strength: number;
  explanation: string;
  created_at: string;
}

export interface DetectedRelationship {
  memory_id: string;
  related_memory_id: string;
  relationship_type: 'related_to' | 'caused_by' | 'similar_to' | 'follows' | 'contradicts';
  strength: number;
  explanation: string;
}

export type RelationshipType = 'related_to' | 'caused_by' | 'similar_to' | 'follows' | 'contradicts';

export interface RelationshipDetectionResult {
  success: boolean;
  relationshipsFound: number;
  relationshipsStored: number;
  processingTimeMs: number;
  error?: string;
}

export interface ContextRequest {
  query: string;
  llm?: string;
  limit?: number;
  project_id?: string;
  conversation_history?: string[];
}

// ============================================================================
// METACOGNITIVE / SELF-LEARNING TYPES (Phase 1)
// ============================================================================

export interface LearningMetadata {
  access_frequency: 'unused' | 'low' | 'medium' | 'high' | 'very_high';
  typical_contexts?: string[];
  co_accessed_with?: string[];
  recency_score?: number;
  days_since_access?: number;
}

export interface MemoryFeedbackRequest {
  helpful: boolean;
  context?: string;
  user_satisfaction?: number; // 0.0 to 1.0
}

export interface MemorySearchOptions {
  query?: string;
  limit?: number;
  project_id?: string;
  source?: string;
  tags?: string[];
  // Metacognitive search options
  weight_by_usage?: boolean;
  decay_old_memories?: boolean;
  learning_mode?: boolean;
  min_helpfulness_score?: number;
}

export interface WeightedSearchResult {
  memory: Memory;
  base_similarity?: number;
  weighted_score?: number;
  boosted_by_usage?: boolean;
  boosted_by_recency?: boolean;
  penalized_by_age?: boolean;
}

export interface UsagePattern {
  memory_id_1: string;
  memory_id_2: string;
  co_access_count: number;
  last_co_accessed?: string;
}

export interface PatternAnalysisResponse {
  most_useful_tags: Array<{
    tag: string;
    avg_helpfulness: number;
    usage_count: number;
  }>;
  frequently_accessed_together: UsagePattern[];
  underutilized_memories: Array<{
    id: string;
    text: string;
    days_since_access: number;
    usage_count: number;
  }>;
  access_time_patterns: {
    hourly_distribution: Record<number, number>;
    daily_distribution: Record<string, number>;
  };
  optimal_relationship_types: Record<string, number>;
  summary: {
    total_memories: number;
    total_accesses: number;
    avg_helpfulness: number;
    active_memories: number;
    stale_memories: number;
  };
}

export interface RelationshipSuggestion {
  memory_id: string;
  related_memory_id: string;
  suggested_type: RelationshipType;
  confidence: number;
  reason: string;
  co_access_count: number;
}

export interface LearningJobResult {
  timestamp: string;
  clusters_detected: number;
  relationship_suggestions: RelationshipSuggestion[];
  weight_adjustments: Record<RelationshipType, number>;
  stale_memory_count: number;
  processing_time_ms: number;
}

// ============================================================================
// PHASE 2: PREDICTIVE RECALL & TEMPORAL PATTERNS
// ============================================================================

export interface MemoryPrediction {
  memory_id: string;
  text?: string;
  confidence: number;
  reasons: string[];
  related_to: string[];
  helpfulness_score?: number;
  usage_count?: number;
}

export interface PredictionRequest {
  current_context?: string;
  recent_memories?: string[];
  limit?: number;
}

export interface ContextSuggestionRequest {
  context: string;
  include_reasoning?: boolean;
  limit?: number;
  min_confidence?: number;
}

export interface MemorySuggestion {
  memory_id: string;
  text: string;
  similarity: number;
  suggestion_score: number;
  analytics: {
    usage_count: number;
    helpfulness_score: number;
    recency_score: number;
    access_frequency: string;
    days_since_access?: number;
  };
  reasoning?: {
    semantic_match: 'high' | 'medium' | 'low';
    frequently_used: boolean;
    recently_accessed: boolean;
    high_helpfulness: boolean;
    weights_applied: UserLearningWeights;
  };
  related_memories?: Array<{
    related_memory_id: string;
    relationship_type: RelationshipType;
    strength: number;
  }>;
}

export interface UserLearningWeights {
  usage_weight: number;
  recency_weight: number;
  helpfulness_weight: number;
  relationship_weight: number;
}

export interface TemporalPattern {
  id: string;
  user_id: string;
  pattern_type: 'hourly' | 'daily' | 'weekly' | 'sequence' | 'co_access';
  pattern_data: Record<string, any>;
  confidence: number;
  occurrences: number;
  first_seen: string;
  last_seen: string;
}

export interface MaintenanceSuggestions {
  duplicates: Array<{
    memory_ids: string[];
    similarity: number;
    suggestion: 'merge' | 'review';
    texts: string[];
  }>;
  outdated: Array<{
    id: string;
    text: string;
    helpfulness_score: number;
    days_since_access: number;
    suggestion: 'update_or_remove';
  }>;
  archive_candidates: Array<{
    id: string;
    text: string;
    days_since_access: number;
    usage_count: number;
    suggestion: 'archive';
  }>;
  broken_relationships: number;
  summary: {
    total_duplicates: number;
    total_outdated: number;
    total_archive_candidates: number;
    total_broken_relationships: number;
  };
}

export interface LearningMetric {
  id: string;
  user_id: string;
  metric_type: 'search_accuracy' | 'prediction_accuracy' | 'avg_helpfulness' | 'user_satisfaction' | 'relationship_quality';
  metric_value: number;
  context: Record<string, any>;
  recorded_at: string;
}

export interface MetricTrend {
  first_value: number;
  last_value: number;
  change: number;
  percent_change: number;
  trend: 'improving' | 'declining' | 'stable';
  data_points: number;
}

export interface LearningVelocityReport {
  time_series: Array<{
    metric_type: string;
    data: Array<{
      value: number;
      recorded_at: string;
    }>;
  }>;
  trends: Record<string, MetricTrend>;
  current_stats: {
    avg_helpfulness: number;
    total_usage: number;
    active_memories: number;
    total_memories: number;
  };
  learning_params: UserLearningWeights | null;
  active_patterns: number;
  time_range: {
    days: number;
    from: string;
    to: string;
  };
}

export interface EnhancedLearningResult {
  timestamp: string;
  phase1: LearningJobResult;
  phase2: {
    temporal_patterns_detected: number;
    temporal_patterns_stored: number;
    duplicate_groups_found: number;
    duplicates: Array<{
      memory_ids: string[];
      similarity: number;
      suggestion: 'merge' | 'keep_separate';
    }>;
  };
  processing_time_ms: number;
}

// ============================================================================
// PHASE 3: MULTI-AGENT COLLABORATION
// ============================================================================

export interface AgentProfile {
  id: string;
  user_id: string;
  agent_name: string;
  agent_type: 'code' | 'research' | 'documentation' | 'test' | 'general' | 'specialized';
  agent_metadata: Record<string, any>;
  reputation_score: number;
  total_contributions: number;
  accepted_contributions: number;
  rejected_contributions: number;
  expertise_domains: string[];
  confidence_threshold: number;
  first_contribution?: string;
  last_contribution?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentMemoryContribution {
  id: string;
  memory_id: string;
  agent_id: string;
  contribution_type: 'create' | 'update' | 'validate' | 'synthesize' | 'enrich';
  confidence: number;
  validation_status: 'pending' | 'accepted' | 'rejected' | 'disputed';
  validation_notes?: string;
  contribution_metadata: Record<string, any>;
  created_at: string;
}

export interface MemoryConflict {
  id: string;
  memory_a_id: string;
  memory_b_id: string;
  conflict_type: 'contradiction' | 'outdated' | 'duplicate' | 'inconsistent';
  severity: number;
  detection_method?: string;
  conflict_details: Record<string, any>;
  detected_at: string;
  resolved_at?: string;
  resolution_strategy?: string;
  resolution_outcome?: Record<string, any>;
  resolved_by?: string;
}

export interface SynthesisHistory {
  id: string;
  synthesized_memory_id: string;
  source_memory_ids: string[];
  synthesizing_agent_id?: string;
  synthesis_method?: string;
  synthesis_confidence: number;
  synthesis_metadata: Record<string, any>;
  created_at: string;
}

export interface AgentTrustRelationship {
  id: string;
  agent_id: string;
  trusted_agent_id: string;
  trust_score: number;
  trust_reason?: string;
  collaboration_count: number;
  successful_collaborations: number;
  created_at: string;
  updated_at: string;
}

export interface MemoryPool {
  id: string;
  user_id: string;
  pool_name: string;
  pool_description?: string;
  pool_type: 'shared' | 'private' | 'team' | 'public';
  access_control: Record<string, any>;
  pool_metadata: Record<string, any>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentRequest {
  agent_name: string;
  agent_type: 'code' | 'research' | 'documentation' | 'test' | 'general' | 'specialized';
  expertise_domains?: string[];
  confidence_threshold?: number;
  agent_metadata?: Record<string, any>;
}

export interface ContributeMemoryRequest {
  agent_id: string;
  text: string;
  contribution_type?: 'create' | 'update' | 'enrich';
  confidence?: number;
  source?: string;
  project_id?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface SynthesizeRequest {
  agent_id: string;
  source_memory_ids: string[];
  synthesis_method?: string;
  include_relationships?: boolean;
}

export interface ConflictDetectionRequest {
  memory_id?: string;
  user_id?: string;
  conflict_threshold?: number;
  auto_resolve?: boolean;
}

export interface CollaborationDashboard {
  total_agents: number;
  active_agents_24h: number;
  memory_pools: Array<{
    name: string;
    memories: number;
    contributors: number;
    synthesis_count: number;
  }>;
  recent_syntheses: SynthesisHistory[];
  top_contributors: Array<{
    agent_name: string;
    reputation_score: number;
    total_contributions: number;
  }>;
  conflict_resolution_rate: number;
  unresolved_conflicts: number;
}

export interface CrossAgentLearningRequest {
  source_agent_id: string;
  target_agent_id: string;
  pattern_types?: string[];
  min_confidence?: number;
}

export interface LearningPattern {
  pattern_type: string;
  pattern_data: Record<string, any>;
  confidence: number;
  source_agent: string;
}

export interface AgentPerformanceMetrics {
  agent_id: string;
  agent_name: string;
  reputation_score: number;
  acceptance_rate: number;
  total_contributions: number;
  syntheses_created: number;
  conflicts_resolved: number;
  activity_status: 'active' | 'recent' | 'inactive' | 'dormant';
  days_since_contribution: number;
}

// Extend Express Request to include user and authentication info
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
      userEmail?: string;
      authMethod?: 'jwt' | 'api-key';
    }
  }
}

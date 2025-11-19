/**
 * Learning Analyzer Service
 *
 * Self-learning background job that analyzes usage patterns,
 * suggests relationships, and optimizes memory retrieval
 */

import { supabase } from '../config/supabase.js';
import { RelationshipSuggestion, LearningJobResult, RelationshipType } from '../types/recallbricks.js';
import { logger } from '../utils/logger.js';
import { auditLogger } from './auditLogger.js';

interface CoAccessPair {
  memory_id_1: string;
  memory_id_2: string;
  co_access_count: number;
  user_id: string;
}

/**
 * Find memories that are frequently accessed together
 * @param threshold Minimum number of co-accesses to consider
 */
async function findFrequentlyPairedMemories(threshold: number = 5): Promise<CoAccessPair[]> {
  try {
    // Query all memories with their access patterns
    const { data: memories, error } = await supabase
      .from('memories')
      .select('id, user_id, access_pattern');

    if (error) throw error;

    const coAccessMap = new Map<string, { count: number; user_id: string }>();

    // Analyze access patterns for co-accessed memories
    (memories || []).forEach((memory: any) => {
      const accessPattern = memory.access_pattern || {};
      const coAccessed = accessPattern.co_accessed_with || [];

      coAccessed.forEach((otherId: string) => {
        const key = [memory.id, otherId].sort().join('|');
        if (!coAccessMap.has(key)) {
          coAccessMap.set(key, { count: 0, user_id: memory.user_id });
        }
        const existing = coAccessMap.get(key)!;
        existing.count++;
      });
    });

    // Filter by threshold and convert to array
    const pairs: CoAccessPair[] = [];
    coAccessMap.forEach((value, key) => {
      if (value.count >= threshold) {
        const [id1, id2] = key.split('|');
        pairs.push({
          memory_id_1: id1,
          memory_id_2: id2,
          co_access_count: value.count,
          user_id: value.user_id
        });
      }
    });

    return pairs.sort((a, b) => b.co_access_count - a.co_access_count);
  } catch (error: any) {
    logger.error('Error finding paired memories:', { error: error?.message || String(error) });
    return [];
  }
}

/**
 * Check if a relationship already exists between two memories
 */
async function hasRelationship(memoryId1: string, memoryId2: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('memory_relationships')
      .select('id')
      .or(`and(memory_id.eq.${memoryId1},related_memory_id.eq.${memoryId2}),and(memory_id.eq.${memoryId2},related_memory_id.eq.${memoryId1})`)
      .limit(1);

    if (error) throw error;
    return (data || []).length > 0;
  } catch (error: any) {
    logger.error('Error checking relationship:', { error: error?.message || String(error) });
    return false;
  }
}

/**
 * Suggest new relationships based on co-access patterns
 */
async function generateRelationshipSuggestions(
  pairs: CoAccessPair[]
): Promise<RelationshipSuggestion[]> {
  const suggestions: RelationshipSuggestion[] = [];

  for (const pair of pairs) {
    // Check if relationship already exists
    const exists = await hasRelationship(pair.memory_id_1, pair.memory_id_2);

    if (!exists) {
      // Fetch memory texts to determine relationship type
      const { data: memories } = await supabase
        .from('memories')
        .select('id, text, tags')
        .in('id', [pair.memory_id_1, pair.memory_id_2]);

      if (memories && memories.length === 2) {
        const mem1 = memories.find(m => m.id === pair.memory_id_1);
        const mem2 = memories.find(m => m.id === pair.memory_id_2);

        // Simple heuristic for relationship type
        let suggestedType: RelationshipType = 'related_to';
        let confidence = 0.6 + (pair.co_access_count / 100); // Higher co-access = higher confidence

        // Check for common tags
        const commonTags = (mem1?.tags || []).filter((tag: string) =>
          (mem2?.tags || []).includes(tag)
        );

        if (commonTags.length > 0) {
          confidence += 0.1;
        }

        // Heuristic: if texts contain similar keywords, suggest "similar_to"
        const text1Lower = (mem1?.text || '').toLowerCase();
        const text2Lower = (mem2?.text || '').toLowerCase();
        const commonWords = text1Lower.split(/\s+/).filter((word: string) =>
          word.length > 4 && text2Lower.includes(word)
        );

        if (commonWords.length > 3) {
          suggestedType = 'similar_to';
          confidence += 0.05;
        }

        suggestions.push({
          memory_id: pair.memory_id_1,
          related_memory_id: pair.memory_id_2,
          suggested_type: suggestedType,
          confidence: Math.min(confidence, 0.95),
          reason: `Co-accessed ${pair.co_access_count} times${commonTags.length > 0 ? `, ${commonTags.length} common tags` : ''}`,
          co_access_count: pair.co_access_count
        });
      }
    }
  }

  return suggestions;
}

/**
 * Calculate the average helpfulness of memories involved in each relationship type
 */
async function calculateRelationshipUsefulness(): Promise<Record<RelationshipType, number>> {
  try {
    const { data: relationships, error } = await supabase
      .from('memory_relationships')
      .select(`
        relationship_type,
        memories!memory_relationships_memory_id_fkey(helpfulness_score),
        related:memories!memory_relationships_related_memory_id_fkey(helpfulness_score)
      `);

    if (error) throw error;

    const typeStats = new Map<RelationshipType, { total: number; count: number }>();

    (relationships || []).forEach((rel: any) => {
      const type = rel.relationship_type as RelationshipType;
      const helpfulness1 = rel.memories?.helpfulness_score || 0.5;
      const helpfulness2 = rel.related?.helpfulness_score || 0.5;
      const avgHelpfulness = (helpfulness1 + helpfulness2) / 2;

      if (!typeStats.has(type)) {
        typeStats.set(type, { total: 0, count: 0 });
      }
      const stats = typeStats.get(type)!;
      stats.total += avgHelpfulness;
      stats.count++;
    });

    const result: Record<RelationshipType, number> = {
      'related_to': 0.5,
      'caused_by': 0.5,
      'similar_to': 0.5,
      'follows': 0.5,
      'contradicts': 0.5
    };

    typeStats.forEach((stats, type) => {
      result[type] = stats.total / stats.count;
    });

    return result;
  } catch (error: any) {
    logger.error('Error calculating relationship usefulness:', { error: error?.message || String(error) });
    return {
      'related_to': 0.5,
      'caused_by': 0.5,
      'similar_to': 0.5,
      'follows': 0.5,
      'contradicts': 0.5
    };
  }
}

/**
 * Find unused memories that might be candidates for archival
 */
async function findUnusedMemories(days: number = 180): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('memory_analytics')
      .select('id, user_id, text, usage_count, days_since_access')
      .or(`days_since_access.gte.${days},usage_count.eq.0`)
      .order('days_since_access', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    logger.error('Error finding unused memories:', { error: error?.message || String(error) });
    return [];
  }
}

/**
 * Main analysis function - runs all learning tasks
 */
export async function analyzeUsagePatterns(): Promise<LearningJobResult> {
  const startTime = Date.now();

  logger.info('Starting learning analysis job...');

  try {
    // 1. Find co-accessed memory pairs
    const coAccessPairs = await findFrequentlyPairedMemories(5);
    logger.info(`Found ${coAccessPairs.length} frequently paired memories`);

    // 2. Generate relationship suggestions
    const suggestions = await generateRelationshipSuggestions(coAccessPairs);
    logger.info(`Generated ${suggestions.length} relationship suggestions`);

    // 3. Calculate relationship type performance
    const relationshipPerformance = await calculateRelationshipUsefulness();
    logger.info('Calculated relationship type performance:', relationshipPerformance);

    // 4. Find stale memories
    const staleMemories = await findUnusedMemories(180);
    logger.info(`Found ${staleMemories.length} stale memories`);

    const processingTimeMs = Date.now() - startTime;

    const result: LearningJobResult = {
      timestamp: new Date().toISOString(),
      clusters_detected: coAccessPairs.length,
      relationship_suggestions: suggestions,
      weight_adjustments: relationshipPerformance,
      stale_memory_count: staleMemories.length,
      processing_time_ms: processingTimeMs
    };

    logger.info(`Learning analysis completed in ${processingTimeMs}ms`);

    // Audit log pattern learning
    await auditLogger.logPatternLearned({
      pattern_type: 'co_access_analysis',
      confidence: suggestions.length > 0 ? 0.8 : 0.5,
      occurrence_count: coAccessPairs.length,
      metadata: {
        suggestions_generated: suggestions.length,
        stale_memories: staleMemories.length,
        processing_time_ms: processingTimeMs,
      },
    });

    return result;

  } catch (error: any) {
    logger.error('Learning analysis failed:', { error: error?.message || String(error) });
    throw error;
  }
}

/**
 * Apply relationship suggestions automatically (with confidence threshold)
 */
export async function applyRelationshipSuggestions(
  suggestions: RelationshipSuggestion[],
  minConfidence: number = 0.75
): Promise<number> {
  let appliedCount = 0;

  for (const suggestion of suggestions) {
    if (suggestion.confidence >= minConfidence) {
      try {
        const { error } = await supabase
          .from('memory_relationships')
          .insert({
            memory_id: suggestion.memory_id,
            related_memory_id: suggestion.related_memory_id,
            relationship_type: suggestion.suggested_type,
            strength: suggestion.confidence,
            explanation: suggestion.reason
          });

        if (!error) {
          appliedCount++;
          logger.info(`Auto-applied relationship: ${suggestion.memory_id} -> ${suggestion.related_memory_id} (${suggestion.suggested_type})`);
        }
      } catch (error: any) {
        logger.error('Failed to apply suggestion:', { error: error?.message || String(error) });
      }
    }
  }

  return appliedCount;
}

/**
 * PHASE 2: Temporal Pattern Detection
 */

interface TemporalPattern {
  user_id: string;
  pattern_type: 'hourly' | 'daily' | 'weekly' | 'sequence' | 'co_access';
  pattern_data: any;
  confidence: number;
}

interface AccessTimestamp {
  memory_id: string;
  user_id: string;
  accessed_at: Date;
  hour: number;
  day: string;
}

/**
 * Analyze temporal access patterns
 * Detects time-of-day, day-of-week, and sequence patterns
 */
async function detectTemporalPatterns(): Promise<TemporalPattern[]> {
  try {
    const patterns: TemporalPattern[] = [];

    // Get all memories with their access patterns
    const { data: memories, error } = await supabase
      .from('memories')
      .select('id, user_id, access_pattern, last_accessed, created_at');

    if (error) throw error;

    // Group by user for per-user pattern detection
    const userMemories = new Map<string, any[]>();
    (memories || []).forEach((memory: any) => {
      if (!userMemories.has(memory.user_id)) {
        userMemories.set(memory.user_id, []);
      }
      userMemories.get(memory.user_id)!.push(memory);
    });

    // Detect patterns for each user
    for (const [userId, userMems] of userMemories) {
      // 1. Time-of-day patterns
      const hourlyPatterns = detectHourlyPatterns(userId, userMems);
      patterns.push(...hourlyPatterns);

      // 2. Day-of-week patterns
      const dailyPatterns = detectDailyPatterns(userId, userMems);
      patterns.push(...dailyPatterns);

      // 3. Access sequence patterns
      const sequencePatterns = detectSequencePatterns(userId, userMems);
      patterns.push(...sequencePatterns);
    }

    return patterns;
  } catch (error: any) {
    logger.error('Error detecting temporal patterns:', { error: error?.message || String(error) });
    return [];
  }
}

/**
 * Detect hourly access patterns (e.g., certain memories accessed at specific hours)
 */
function detectHourlyPatterns(userId: string, memories: any[]): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];
  const hourlyAccess = new Map<number, Set<string>>();

  // Analyze access patterns to extract hourly data
  memories.forEach((memory: any) => {
    const accessPattern = memory.access_pattern || {};
    const timestamps = accessPattern.access_timestamps || [];

    // Also consider last_accessed
    if (memory.last_accessed) {
      timestamps.push(memory.last_accessed);
    }

    timestamps.forEach((timestamp: string) => {
      const date = new Date(timestamp);
      const hour = date.getHours();

      if (!hourlyAccess.has(hour)) {
        hourlyAccess.set(hour, new Set());
      }
      hourlyAccess.get(hour)!.add(memory.id);
    });
  });

  // Find hours with significant patterns (at least 5 memories, accessed 3+ times)
  hourlyAccess.forEach((memoryIds, hour) => {
    if (memoryIds.size >= 3) {
      const confidence = Math.min(memoryIds.size / 10, 0.95);
      patterns.push({
        user_id: userId,
        pattern_type: 'hourly',
        pattern_data: {
          hour,
          memories: Array.from(memoryIds),
          description: `Memories frequently accessed at ${hour}:00`
        },
        confidence
      });
    }
  });

  return patterns;
}

/**
 * Detect daily patterns (e.g., memories accessed on specific days)
 */
function detectDailyPatterns(userId: string, memories: any[]): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];
  const dailyAccess = new Map<string, Set<string>>();

  memories.forEach((memory: any) => {
    const accessPattern = memory.access_pattern || {};
    const timestamps = accessPattern.access_timestamps || [];

    if (memory.last_accessed) {
      timestamps.push(memory.last_accessed);
    }

    timestamps.forEach((timestamp: string) => {
      const date = new Date(timestamp);
      const day = date.toLocaleDateString('en-US', { weekday: 'long' });

      if (!dailyAccess.has(day)) {
        dailyAccess.set(day, new Set());
      }
      dailyAccess.get(day)!.add(memory.id);
    });
  });

  // Find days with significant patterns
  dailyAccess.forEach((memoryIds, day) => {
    if (memoryIds.size >= 3) {
      const confidence = Math.min(memoryIds.size / 15, 0.95);
      patterns.push({
        user_id: userId,
        pattern_type: 'daily',
        pattern_data: {
          day,
          memories: Array.from(memoryIds),
          description: `Memories frequently accessed on ${day}s`
        },
        confidence
      });
    }
  });

  return patterns;
}

/**
 * Detect access sequence patterns (e.g., A → B → C)
 */
function detectSequencePatterns(userId: string, memories: any[]): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];
  const sequences = new Map<string, number>();

  // Build sequences from co-access patterns
  memories.forEach((memory: any) => {
    const accessPattern = memory.access_pattern || {};
    const coAccessed = accessPattern.co_accessed_with || [];

    // Look for sequential access (within 5 minutes)
    if (coAccessed.length > 0) {
      // Create a sequence key
      const sequenceKey = [memory.id, ...coAccessed.slice(0, 2)].sort().join('→');
      sequences.set(sequenceKey, (sequences.get(sequenceKey) || 0) + 1);
    }
  });

  // Find frequent sequences (accessed 5+ times)
  sequences.forEach((count, sequenceKey) => {
    if (count >= 5) {
      const memoryIds = sequenceKey.split('→');
      const confidence = Math.min(count / 20, 0.95);

      patterns.push({
        user_id: userId,
        pattern_type: 'sequence',
        pattern_data: {
          sequence: memoryIds,
          occurrences: count,
          description: `Sequence pattern: ${memoryIds.length} memories accessed together`
        },
        confidence
      });
    }
  });

  return patterns;
}

/**
 * Store detected patterns in the database
 */
async function storeTemporalPatterns(patterns: TemporalPattern[]): Promise<number> {
  let storedCount = 0;

  for (const pattern of patterns) {
    try {
      const { error } = await supabase.rpc('record_temporal_pattern', {
        p_user_id: pattern.user_id,
        p_pattern_type: pattern.pattern_type,
        p_pattern_data: pattern.pattern_data,
        p_confidence: pattern.confidence
      });

      if (!error) {
        storedCount++;
      }
    } catch (error: any) {
      logger.error('Failed to store pattern:', { error: error?.message || String(error) });
    }
  }

  return storedCount;
}

/**
 * PHASE 2: Duplicate Detection
 */

interface DuplicateGroup {
  memory_ids: string[];
  similarity: number;
  suggestion: 'merge' | 'keep_separate';
}

/**
 * Find duplicate or near-duplicate memories
 */
async function findDuplicateMemories(threshold: number = 0.85): Promise<DuplicateGroup[]> {
  try {
    const duplicateGroups: DuplicateGroup[] = [];

    // Get all memories for comparison
    const { data: memories, error } = await supabase
      .from('memories')
      .select('id, text, user_id, embedding');

    if (error) throw error;

    // Group by user
    const userMemories = new Map<string, any[]>();
    (memories || []).forEach((memory: any) => {
      if (!userMemories.has(memory.user_id)) {
        userMemories.set(memory.user_id, []);
      }
      userMemories.get(memory.user_id)!.push(memory);
    });

    // Check for duplicates within each user's memories
    for (const [userId, userMems] of userMemories) {
      for (let i = 0; i < userMems.length; i++) {
        for (let j = i + 1; j < userMems.length; j++) {
          const mem1 = userMems[i];
          const mem2 = userMems[j];

          // Calculate text similarity (simple approach)
          const similarity = calculateTextSimilarity(mem1.text, mem2.text);

          if (similarity >= threshold) {
            duplicateGroups.push({
              memory_ids: [mem1.id, mem2.id],
              similarity,
              suggestion: similarity > 0.95 ? 'merge' : 'keep_separate'
            });
          }
        }
      }
    }

    return duplicateGroups;
  } catch (error: any) {
    logger.error('Error finding duplicates:', { error: error?.message || String(error) });
    return [];
  }
}

/**
 * Simple text similarity calculation (Jaccard similarity)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Run the complete learning cycle with auto-apply
 */
export async function runLearningCycle(autoApply: boolean = false): Promise<LearningJobResult> {
  const result = await analyzeUsagePatterns();

  if (autoApply && result.relationship_suggestions.length > 0) {
    const appliedCount = await applyRelationshipSuggestions(result.relationship_suggestions, 0.75);
    logger.info(`Auto-applied ${appliedCount} relationship suggestions`);
  }

  return result;
}

/**
 * PHASE 2: Enhanced learning cycle with temporal patterns
 */
export async function runEnhancedLearningCycle(autoApply: boolean = false): Promise<any> {
  const startTime = Date.now();
  logger.info('Starting enhanced Phase 2 learning cycle...');

  // Run Phase 1 analysis
  const phase1Result = await analyzeUsagePatterns();

  // Run Phase 2 temporal pattern detection
  const temporalPatterns = await detectTemporalPatterns();
  logger.info(`Detected ${temporalPatterns.length} temporal patterns`);

  // Store temporal patterns
  const storedPatterns = await storeTemporalPatterns(temporalPatterns);
  logger.info(`Stored ${storedPatterns} temporal patterns`);

  // Find duplicate memories
  const duplicates = await findDuplicateMemories(0.85);
  logger.info(`Found ${duplicates.length} potential duplicate groups`);

  // Auto-apply suggestions if enabled
  if (autoApply && phase1Result.relationship_suggestions.length > 0) {
    const appliedCount = await applyRelationshipSuggestions(phase1Result.relationship_suggestions, 0.75);
    logger.info(`Auto-applied ${appliedCount} relationship suggestions`);
  }

  const processingTimeMs = Date.now() - startTime;

  return {
    timestamp: new Date().toISOString(),
    phase1: phase1Result,
    phase2: {
      temporal_patterns_detected: temporalPatterns.length,
      temporal_patterns_stored: storedPatterns,
      duplicate_groups_found: duplicates.length,
      duplicates: duplicates.slice(0, 10) // Return first 10
    },
    processing_time_ms: processingTimeMs
  };
}

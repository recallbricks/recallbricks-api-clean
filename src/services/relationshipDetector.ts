/**
 * Memory Relationship Detection Service
 *
 * Enterprise-grade service using Claude API to automatically detect
 * semantic relationships between memories with:
 * - Exponential backoff retry logic
 * - Circuit breaker pattern
 * - Comprehensive metrics and logging
 * - Input validation and sanitization
 * - Graceful error handling
 * - Idempotency guarantees
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/supabase.js';
import { relationshipConfig } from '../config/relationshipDetection.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { logger } from '../utils/logger.js';
import { DBMetricsTracker } from '../utils/metrics.js';
import { Counter, Histogram } from 'prom-client';
import {
  DetectedRelationship,
  RelationshipDetectionResult,
  RelationshipType
} from '../types/recallbricks.js';

// ============================================================================
// Metrics
// ============================================================================

const relationshipDetectionAttempts = new Counter({
  name: 'recallbricks_relationship_detection_attempts_total',
  help: 'Total number of relationship detection attempts',
  labelNames: ['status'],
});

const relationshipDetectionDuration = new Histogram({
  name: 'recallbricks_relationship_detection_duration_seconds',
  help: 'Duration of relationship detection operations',
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
});

const relationshipsDetected = new Counter({
  name: 'recallbricks_relationships_detected_total',
  help: 'Total number of relationships detected',
  labelNames: ['type'],
});

const claudeApiCalls = new Counter({
  name: 'recallbricks_claude_api_calls_total',
  help: 'Total number of Claude API calls',
  labelNames: ['model', 'status'],
});

const claudeApiLatency = new Histogram({
  name: 'recallbricks_claude_api_latency_seconds',
  help: 'Claude API response latency',
  labelNames: ['model'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
});

// ============================================================================
// Circuit Breaker
// ============================================================================

const claudeCircuitBreaker = new CircuitBreaker(
  relationshipConfig.circuitBreakerThreshold,
  relationshipConfig.circuitBreakerTimeout
);

// ============================================================================
// Anthropic Client
// ============================================================================

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient && relationshipConfig.claudeApiKey) {
    anthropicClient = new Anthropic({
      apiKey: relationshipConfig.claudeApiKey,
      timeout: relationshipConfig.requestTimeout,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  if (!anthropicClient) {
    throw new Error('Anthropic client not initialized - API key missing');
  }

  return anthropicClient;
}

// ============================================================================
// Validation
// ============================================================================

function validateMemoryText(text: string): void {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid memory text: must be a non-empty string');
  }

  if (text.length > 50000) {
    throw new Error('Memory text too long: maximum 50,000 characters');
  }

  if (text.trim().length === 0) {
    throw new Error('Memory text cannot be empty or whitespace only');
  }
}

function validateRelationship(rel: any): DetectedRelationship | null {
  try {
    // Validate required fields
    if (!rel.memory_id || typeof rel.memory_id !== 'string') {
      logger.warn('Invalid relationship: missing or invalid memory_id', { rel });
      return null;
    }

    if (!rel.relationship_type || !isValidRelationshipType(rel.relationship_type)) {
      logger.warn('Invalid relationship: invalid relationship_type', { rel });
      return null;
    }

    if (typeof rel.strength !== 'number' || rel.strength < 0 || rel.strength > 1) {
      logger.warn('Invalid relationship: strength must be between 0 and 1', { rel });
      return null;
    }

    if (rel.strength < relationshipConfig.minStrength) {
      logger.debug('Relationship below minimum strength threshold', {
        strength: rel.strength,
        threshold: relationshipConfig.minStrength,
      });
      return null;
    }

    return {
      memory_id: '', // Will be set by caller
      related_memory_id: rel.memory_id,
      relationship_type: rel.relationship_type,
      strength: Math.min(Math.max(rel.strength, 0), 1), // Clamp to [0, 1]
      explanation: sanitizeExplanation(rel.explanation || ''),
    };
  } catch (error) {
    logger.error('Error validating relationship', { error, rel });
    return null;
  }
}

function isValidRelationshipType(type: string): type is RelationshipType {
  return ['related_to', 'caused_by', 'similar_to', 'follows', 'contradicts'].includes(type);
}

function sanitizeExplanation(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove potential injection attempts and trim to max length
  return text
    .replace(/[<>]/g, '') // Remove potential HTML/XML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, relationshipConfig.explanationMaxLength)
    .trim();
}

// ============================================================================
// Prompt Engineering
// ============================================================================

function buildRelationshipPrompt(
  newMemory: string,
  recentMemories: Array<{ id: string; text: string; created_at: string }>
): string {
  const memoriesContext = recentMemories
    .map((m, idx) => `[${idx}] ID: ${m.id}\nText: ${m.text}\nCreated: ${m.created_at}`)
    .join('\n\n');

  return `You are an expert at analyzing semantic relationships between user memories in a personal knowledge management system.

NEW MEMORY:
${newMemory}

EXISTING MEMORIES (${recentMemories.length} most recent):
${memoriesContext}

TASK:
Analyze the NEW MEMORY and identify meaningful relationships with the EXISTING MEMORIES.

RELATIONSHIP TYPES:
- "related_to": General topical or contextual relationship (e.g., both about JavaScript)
- "caused_by": The new memory is a consequence, result, or outcome of an existing memory
- "similar_to": Very similar content, same concept explained differently, or near-duplicate
- "follows": The new memory is a continuation, next step, or sequential follow-up
- "contradicts": The new memory conflicts with or contradicts information in an existing memory

RULES:
1. Only include relationships with confidence >= ${relationshipConfig.minStrength}
2. Maximum ${relationshipConfig.maxRelationships} relationships
3. Strength must be between ${relationshipConfig.minStrength} and 1.0
4. Be precise and concise in explanations (max ${relationshipConfig.explanationMaxLength} chars)
5. Focus on meaningful semantic connections, not superficial word matches
6. Avoid weak relationships - quality over quantity

OUTPUT FORMAT (JSON only, no other text):
[
  {
    "memory_index": 0,
    "memory_id": "uuid-from-above",
    "relationship_type": "related_to",
    "strength": 0.85,
    "explanation": "Brief, clear explanation of the relationship"
  }
]

If no meaningful relationships found, return: []

Return ONLY the JSON array. No markdown, no code blocks, no explanations.`;
}

// ============================================================================
// Claude API Interaction
// ============================================================================

async function callClaudeAPI(prompt: string): Promise<string> {
  const startTime = Date.now();
  const client = getAnthropicClient();

  try {
    const message = await claudeCircuitBreaker.execute(
      async () => {
        return await client.messages.create({
          model: relationshipConfig.claudeModel,
          max_tokens: relationshipConfig.maxTokens,
          temperature: relationshipConfig.temperature,
          messages: [{
            role: 'user',
            content: prompt,
          }],
        });
      },
      'claude-api-relationship-detection'
    );

    const latency = (Date.now() - startTime) / 1000;
    claudeApiLatency.observe({ model: relationshipConfig.claudeModel }, latency);
    claudeApiCalls.inc({ model: relationshipConfig.claudeModel, status: 'success' });

    logger.debug('Claude API call successful', {
      model: relationshipConfig.claudeModel,
      latency,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected content type from Claude API');
    }

    return content.text;
  } catch (error: any) {
    claudeApiCalls.inc({ model: relationshipConfig.claudeModel, status: 'error' });

    logger.error('Claude API call failed', {
      error: error.message,
      model: relationshipConfig.claudeModel,
      latency: (Date.now() - startTime) / 1000,
    });

    throw error;
  }
}

// ============================================================================
// Response Parsing
// ============================================================================

function parseClaudeResponse(
  response: string,
  newMemoryId: string
): DetectedRelationship[] {
  try {
    // Extract JSON array from response (handle markdown code blocks)
    let jsonText = response.trim();

    // Remove markdown code blocks if present
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    // Find JSON array
    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      logger.warn('No JSON array found in Claude response', {
        responsePreview: response.substring(0, 200),
      });
      return [];
    }

    const parsed = JSON.parse(arrayMatch[0]);

    if (!Array.isArray(parsed)) {
      logger.warn('Claude response is not an array', { parsed });
      return [];
    }

    // Validate and sanitize each relationship
    const validRelationships = parsed
      .map(validateRelationship)
      .filter((rel): rel is DetectedRelationship => rel !== null)
      .slice(0, relationshipConfig.maxRelationships)
      .map(rel => ({ ...rel, memory_id: newMemoryId }));

    logger.debug('Parsed relationships from Claude', {
      total: parsed.length,
      valid: validRelationships.length,
    });

    return validRelationships;
  } catch (error: any) {
    logger.error('Error parsing Claude response', {
      error: error.message,
      responsePreview: response.substring(0, 500),
    });
    return [];
  }
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= relationshipConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on certain errors
      if (error.status === 400 || error.status === 401 || error.status === 403) {
        logger.error('Non-retryable error in relationship detection', {
          context,
          error: error.message,
          status: error.status,
        });
        throw error;
      }

      if (attempt < relationshipConfig.maxRetries) {
        const delay = Math.min(
          relationshipConfig.retryBaseDelay * Math.pow(relationshipConfig.retryExponent, attempt),
          relationshipConfig.retryMaxDelay
        );

        logger.warn('Retrying relationship detection', {
          context,
          attempt: attempt + 1,
          maxRetries: relationshipConfig.maxRetries,
          delayMs: delay,
          error: error.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Unknown error in retry logic');
}

// ============================================================================
// Database Operations
// ============================================================================

async function fetchRecentMemories(
  userId: string,
  excludeMemoryId: string
): Promise<Array<{ id: string; text: string; created_at: string }>> {
  const tracker = new DBMetricsTracker('select', 'memories');

  try {
    const { data, error } = await supabase
      .from('memories')
      .select('id, text, created_at')
      .eq('user_id', userId)
      .neq('id', excludeMemoryId)
      .order('created_at', { ascending: false })
      .limit(relationshipConfig.recentMemoriesLimit);

    if (error) throw error;

    tracker.finish(true);
    return data || [];
  } catch (error) {
    tracker.finish(false);
    throw error;
  }
}

async function storeRelationships(
  relationships: DetectedRelationship[],
  userId: string
): Promise<number> {
  if (relationships.length === 0) {
    return 0;
  }

  const tracker = new DBMetricsTracker('insert', 'memory_relationships');

  try {
    // Check for existing relationships to maintain idempotency
    const { data: existing, error: checkError } = await supabase
      .from('memory_relationships')
      .select('memory_id, related_memory_id')
      .or(
        relationships
          .map(r => `and(memory_id.eq.${r.memory_id},related_memory_id.eq.${r.related_memory_id})`)
          .join(',')
      );

    if (checkError) {
      logger.warn('Error checking existing relationships', { error: checkError });
    }

    // Filter out relationships that already exist
    const existingPairs = new Set(
      (existing || []).map((e: any) => `${e.memory_id}:${e.related_memory_id}`)
    );

    const newRelationships = relationships.filter(
      r => !existingPairs.has(`${r.memory_id}:${r.related_memory_id}`)
    );

    if (newRelationships.length === 0) {
      logger.debug('All relationships already exist (idempotent)', {
        totalAttempted: relationships.length,
      });
      tracker.finish(true);
      return 0;
    }

    // Insert new relationships with user_id
    const { error: insertError } = await supabase
      .from('memory_relationships')
      .insert(newRelationships.map(rel => ({ ...rel, user_id: userId })));

    if (insertError) throw insertError;

    // Track metrics
    newRelationships.forEach(rel => {
      relationshipsDetected.inc({ type: rel.relationship_type });
    });

    tracker.finish(true);
    logger.info('Stored new relationships', {
      count: newRelationships.length,
      skipped: relationships.length - newRelationships.length,
    });

    return newRelationships.length;
  } catch (error) {
    tracker.finish(false);
    throw error;
  }
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect and store relationships for a newly created memory
 *
 * This function is designed to be called asynchronously and will not throw
 * errors - instead, it logs them and returns a result object.
 *
 * @param newMemoryId - UUID of the newly created memory
 * @param newMemoryText - Text content of the new memory
 * @param userId - UUID of the user who owns the memory
 * @returns Promise<RelationshipDetectionResult> - Result with success status and metadata
 */
export async function detectRelationships(
  newMemoryId: string,
  newMemoryText: string,
  userId: string
): Promise<RelationshipDetectionResult> {
  const startTime = Date.now();
  const endTimer = relationshipDetectionDuration.startTimer();

  try {
    // Check if feature is enabled
    if (!relationshipConfig.enabled) {
      logger.debug('Relationship detection disabled', { newMemoryId });
      return {
        success: false,
        relationshipsFound: 0,
        relationshipsStored: 0,
        processingTimeMs: Date.now() - startTime,
        error: 'Feature disabled',
      };
    }

    // Validate inputs
    validateMemoryText(newMemoryText);

    if (!newMemoryId || typeof newMemoryId !== 'string') {
      throw new Error('Invalid memory ID');
    }

    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }

    logger.info('Starting relationship detection', {
      memoryId: newMemoryId,
      userId,
      textLength: newMemoryText.length,
    });

    // Step 1: Fetch recent memories
    const recentMemories = await withRetry(
      () => fetchRecentMemories(userId, newMemoryId),
      'fetch-recent-memories'
    );

    if (recentMemories.length === 0) {
      logger.info('No existing memories to compare against', { memoryId: newMemoryId });
      relationshipDetectionAttempts.inc({ status: 'no_memories' });
      endTimer();
      return {
        success: true,
        relationshipsFound: 0,
        relationshipsStored: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 2: Build prompt and call Claude API
    const prompt = buildRelationshipPrompt(newMemoryText, recentMemories);
    const claudeResponse = await withRetry(
      () => callClaudeAPI(prompt),
      'claude-api-call'
    );

    // Step 3: Parse and validate relationships
    const detectedRelationships = parseClaudeResponse(claudeResponse, newMemoryId);

    if (detectedRelationships.length === 0) {
      logger.info('No relationships detected', { memoryId: newMemoryId });
      relationshipDetectionAttempts.inc({ status: 'no_relationships' });
      endTimer();
      return {
        success: true,
        relationshipsFound: 0,
        relationshipsStored: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 4: Store relationships in database
    let storedCount = 0;
    if (relationshipConfig.storeInDatabase) {
      storedCount = await withRetry(
        () => storeRelationships(detectedRelationships, userId),
        'store-relationships'
      );
    }

    // Success!
    relationshipDetectionAttempts.inc({ status: 'success' });
    endTimer();

    logger.info('Relationship detection completed successfully', {
      memoryId: newMemoryId,
      relationshipsFound: detectedRelationships.length,
      relationshipsStored: storedCount,
      processingTimeMs: Date.now() - startTime,
    });

    return {
      success: true,
      relationshipsFound: detectedRelationships.length,
      relationshipsStored: storedCount,
      processingTimeMs: Date.now() - startTime,
    };

  } catch (error: any) {
    relationshipDetectionAttempts.inc({ status: 'error' });
    endTimer();

    logger.error('Relationship detection failed', {
      memoryId: newMemoryId,
      userId,
      error: error.message,
      stack: error.stack,
      processingTimeMs: Date.now() - startTime,
    });

    return {
      success: false,
      relationshipsFound: 0,
      relationshipsStored: 0,
      processingTimeMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check if the relationship detection service is healthy and ready
 */
export async function checkRelationshipDetectionHealth(): Promise<{
  healthy: boolean;
  enabled: boolean;
  circuitBreakerState: string;
  apiKeyConfigured: boolean;
}> {
  return {
    healthy: relationshipConfig.enabled && claudeCircuitBreaker.getState() !== 'OPEN',
    enabled: relationshipConfig.enabled,
    circuitBreakerState: claudeCircuitBreaker.getState(),
    apiKeyConfigured: !!relationshipConfig.claudeApiKey,
  };
}

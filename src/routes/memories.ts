/**
 * Memories Routes
 * 
 * CRUD operations for memories using Supabase with vector embeddings
 */

import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { CreateMemoryRequest, Memory } from '../types/recallbricks.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { detectRelationships } from '../services/relationshipDetector.js';
import { relationshipConfig } from '../config/relationshipDetection.js';

const router = Router();

// Initialize OpenAI client (optional)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null;

// Initialize Anthropic client for classification (used in auto-save)
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
}) : null;

// Function to extract key information using OpenAI GPT-4o-mini (optional)
async function extractKeyInfo(text: string): Promise<string> {
  if (!openai) {
    return text; // Skip extraction if no OpenAI key
  }
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Extract only key information: decisions, code, facts. Remove explanations and filler.'
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const extracted = completion.choices[0]?.message?.content?.trim();
    return extracted || text;
  } catch (error) {
    console.error('Error extracting key information:', error);
    return text;
  }
}

// Function to generate embedding (optional)
async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!openai) {
    return null; // Skip embeddings if no OpenAI key
  }
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

// All routes require authentication
router.use(authenticateApiKey);

/**
 * POST /api/v1/memories
 * Create a new memory with vector embedding
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { text, source, project_id, tags, metadata, agent_id }: CreateMemoryRequest & { agent_id?: string } = req.body;

   // Extract key information (optional)
    const extractedText = await extractKeyInfo(text);

    // Generate embedding (optional)
    const embedding = await generateEmbedding(extractedText);

    const memory = {
      user_id: user.id,
      text: extractedText,
      source: source || 'api',
      project_id: project_id || 'default',
      tags: tags || [],
      metadata: {
        ...metadata,
        original_text: text,
        extracted: !!openai,
        ...(agent_id ? { contributed_by_agent: agent_id } : {})
      },
      embedding: embedding ? `[${embedding.join(',')}]` : null,
    };

    const { data, error } = await supabase
      .from('memories')
      .insert(memory)
      .select()
      .single();

    if (error) throw error;

    // PHASE 3: Record agent contribution if agent_id provided
    if (agent_id && data?.id) {
      const { error: contribError } = await supabase
        .from('agent_memory_contributions')
        .insert({
          memory_id: data.id,
          agent_id: agent_id,
          contribution_type: 'create',
          confidence: 0.8,
          validation_status: 'accepted'
        });

      if (contribError) {
        console.error('Failed to record agent contribution:', contribError);
      } else {
        // Update agent stats
        await supabase.rpc('update_agent_contribution_stats', {
          p_agent_id: agent_id,
          p_contribution_accepted: true
        });
      }
    }

    // Trigger async relationship detection (fire-and-forget)
    if (data?.id && relationshipConfig.asyncExecution) {
      detectRelationships(data.id, extractedText, user.id)
        .then(result => {
          if (result.success && result.relationshipsFound > 0) {
            console.log(`✓ Detected ${result.relationshipsFound} relationships for memory ${data.id}`);
          }
        })
        .catch(err => {
          console.error('Background relationship detection failed:', err);
        });
    }

    res.status(201).json(data);
  } catch (error: any) {
    console.error('Error creating memory:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to create memory.'
    });
  }
});

/**
 * GET /api/v1/memories
 * List memories with optional filters
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { limit, source, project_id } = req.query;

    let query = supabase
      .from('memories')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(parseInt(limit as string));
    }

    if (source) {
      query = query.eq('source', source);
    }

    if (project_id) {
      query = query.eq('project_id', project_id);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      memories: data,
      count: data?.length || 0
    });
  } catch (error: any) {
    console.error('Error listing memories:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to retrieve memories.'
    });
  }
});

/**
 * GET /api/v1/memories/search
 * Semantic search using vector similarity
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Query parameter "q" is required.'
      });
      return;
    }

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(q);

    // Use Supabase RPC for vector similarity search
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.5,
      match_count: parseInt(limit as string),
      filter_user_id: user.id
    });

    if (error) throw error;

    res.json({
      memories: data || [],
      count: data?.length || 0,
      query: q
    });
  } catch (error: any) {
    console.error('Error searching memories:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to search memories.'
    });
  }
});

/**
 * POST /api/v1/memories/search
 * Semantic search using vector similarity with optional usage-based weighting
 * Falls back to full-text search if embeddings are not available
 * PHASE 2: Uses adaptive per-user weights
 */
router.post('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const {
      query,
      limit = 10,
      weight_by_usage = false,
      decay_old_memories = false,
      learning_mode = false,
      min_helpfulness_score,
      adaptive_weights = true // Phase 2: Enable adaptive weighting
    } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Query field is required.'
      });
      return;
    }

    // PHASE 2: Fetch user's adaptive learning weights
    let userWeights = {
      usage_weight: 0.3,
      recency_weight: 0.2,
      helpfulness_weight: 0.5,
      relationship_weight: 0.2
    };

    if (adaptive_weights) {
      const { data: learningParams } = await supabase
        .from('user_learning_params')
        .select('usage_weight, recency_weight, helpfulness_weight, relationship_weight')
        .eq('user_id', user.id)
        .single();

      if (learningParams) {
        userWeights = learningParams;
      }
    }

    const queryEmbedding = await generateEmbedding(query);

    // Fetch more results if weighting is enabled (we'll re-rank and trim)
    const fetchLimit = weight_by_usage || decay_old_memories ? limit * 3 : limit;

    let memories: any[] = [];
    let usedFallback = false;

    // If embeddings are not available, fall back to full-text search
    if (!queryEmbedding) {
      usedFallback = true;

      // Use ILIKE for simple text matching (works reliably without tsvector column)
      const { data, error } = await supabase
        .from('memories')
        .select('*')
        .eq('user_id', user.id)
        .ilike('text', `%${query}%`)
        .limit(parseInt(String(fetchLimit)));

      if (error) throw error;

      memories = data || [];

      // If weight_by_usage is enabled, fetch analytics and apply weighting
      if (weight_by_usage && memories.length > 0) {
        const memoryIds = memories.map(m => m.id);
        const { data: analyticsData } = await supabase
          .from('memory_analytics')
          .select('id, usage_count, helpfulness_score, access_frequency')
          .in('id', memoryIds);

        const analyticsMap = new Map(
          (analyticsData || []).map((a: any) => [a.id, a])
        );

        // Apply text search weighting based on usage and helpfulness
        memories = memories.map(memory => {
          const analytics = analyticsMap.get(memory.id);
          const usageCount = analytics?.usage_count || 0;
          const helpfulness = analytics?.helpfulness_score || 0.5;

          // Simple scoring: (1 + usage_count) * helpfulness_score
          // Add 1 to usage_count to avoid zero scores for new memories
          const weightedScore = (1 + usageCount) * helpfulness;

          return {
            ...memory,
            base_similarity: null, // No vector similarity in text search
            weighted_score: weightedScore,
            boosted_by_usage: usageCount > 5,
            boosted_by_recency: false,
            penalized_by_age: false,
            usage_count: usageCount,
            helpfulness_score: helpfulness,
            access_frequency: analytics?.access_frequency || 'unused'
          };
        });

        // Sort by weighted score
        memories.sort((a, b) => b.weighted_score - a.weighted_score);
        memories = memories.slice(0, limit);
      }
    } else {
      // Use vector similarity search
      const { data, error } = await supabase.rpc('match_memories', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.5,
        match_count: parseInt(String(fetchLimit)),
        filter_user_id: user.id
      });

      if (error) throw error;

      memories = data || [];
    }

    // Apply metacognitive weighting if requested (skip if already done in fallback)
    const needsWeighting = (weight_by_usage || decay_old_memories) &&
                          !(usedFallback && weight_by_usage && !decay_old_memories);

    if (needsWeighting && memories.length > 0) {
      // Fetch analytics data for all memories
      const memoryIds = memories.map((m: any) => m.id);
      const { data: analyticsData } = await supabase
        .from('memory_analytics')
        .select('id, usage_count, last_accessed, helpfulness_score, recency_score, access_frequency')
        .in('id', memoryIds);

      const analyticsMap = new Map(
        (analyticsData || []).map((a: any) => [a.id, a])
      );

      // Apply weighted scoring
      memories = memories.map((memory: any) => {
        const analytics = analyticsMap.get(memory.id);
        const baseSimilarity = memory.similarity || 0;

        // For fallback searches, use the already computed weighted_score as base
        let weightedScore = usedFallback && memory.weighted_score
          ? memory.weighted_score
          : baseSimilarity;

        let boostedByUsage = false;
        let boostedByRecency = false;
        let penalizedByAge = false;

        if (analytics) {
          // Apply usage-based weighting only if not already done in fallback
          // PHASE 2: Use adaptive user weights
          if (weight_by_usage && !usedFallback) {
            const usageScore = Math.min(Math.log(analytics.usage_count + 1) / Math.log(100), 1.0);
            const helpfulness = analytics.helpfulness_score || 0.5;
            const recencyScore = analytics.recency_score || 0.5;

            // Apply learned weights
            weightedScore =
              baseSimilarity * 0.4 + // Base similarity always counts
              usageScore * userWeights.usage_weight +
              recencyScore * userWeights.recency_weight +
              helpfulness * userWeights.helpfulness_weight;

            boostedByUsage = analytics.usage_count > 5;
          }

          // Apply recency boost/decay
          if (decay_old_memories && analytics.last_accessed) {
            const daysSinceAccess = analytics.recency_score !== null
              ? (1 - analytics.recency_score) * 365 // Approximate days
              : 365;

            if (daysSinceAccess <= 7) {
              // Recent memories get +20% boost
              weightedScore *= 1.2;
              boostedByRecency = true;
            } else if (daysSinceAccess >= 90) {
              // Stale memories get -30% penalty
              weightedScore *= 0.7;
              penalizedByAge = true;
            }
          }

          // Filter by minimum helpfulness score if specified
          if (min_helpfulness_score !== undefined) {
            const helpfulness = analytics.helpfulness_score || 0.5;
            if (helpfulness < min_helpfulness_score) {
              weightedScore = 0; // Will be filtered out
            }
          }
        }

        return {
          ...memory,
          base_similarity: baseSimilarity,
          weighted_score: weightedScore,
          boosted_by_usage: boostedByUsage,
          boosted_by_recency: boostedByRecency,
          penalized_by_age: penalizedByAge,
          usage_count: analytics?.usage_count || 0,
          helpfulness_score: analytics?.helpfulness_score || 0.5,
          access_frequency: analytics?.access_frequency || 'unused'
        };
      });

      // Sort by weighted score and trim to limit
      memories.sort((a: any, b: any) => b.weighted_score - a.weighted_score);
      memories = memories.filter((m: any) => m.weighted_score > 0).slice(0, limit);

      // Track which results were used in learning mode
      if (learning_mode) {
        memories.forEach((memory: any) => {
          supabase.rpc('increment_memory_usage', {
            p_memory_id: memory.id,
            p_context: 'search_result'
          }).then(({ error }) => {
            if (error) {
              console.error('Failed to track learning mode usage:', error);
            }
          });
        });
      }
    }

    res.json({
      memories,
      count: memories.length,
      query,
      weighted: weight_by_usage || decay_old_memories,
      learning_mode,
      search_method: usedFallback ? 'text_search' : 'vector_similarity'
    });
  } catch (error: any) {
    console.error('Error searching memories:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to search memories.'
    });
  }
});

/**
 * GET /api/v1/memories/context
 * Auto-context endpoint: Returns clean text-only results for AI consumption
 */
router.get('/context', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Query parameter "q" is required.'
      });
      return;
    }

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(q);

    // Use Supabase RPC for vector similarity search
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.5,
      match_count: parseInt(limit as string),
      filter_user_id: user.id
    });

    if (error) throw error;

    // Extract only the text field for clean AI consumption
    const context = (data || []).map((memory: any) => memory.text);

    res.json({
      context,
      count: context.length
    });
  } catch (error: any) {
    console.error('Error generating context:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to generate context.'
    });
  }
});

/**
 * GET /api/v1/memories/context/all
 * Get all memories for the authenticated user as clean text context
 */
router.get('/context/all', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { limit = 100, offset = 0 } = req.query;

    // Fetch all memories for the user, ordered by most recent
    const { data, error } = await supabase
      .from('memories')
      .select('text')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

    if (error) throw error;

    // Extract only the text field for clean AI consumption
    const context = (data || []).map((memory: any) => memory.text);

    res.json({
      context,
      count: context.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error: any) {
    console.error('Error retrieving all context:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to retrieve all context.'
    });
  }
});

/**
 * GET /api/v1/memories/test-extraction
 * Test endpoint to verify OpenAI extraction is working
 */
router.get('/test-extraction', async (req: Request, res: Response): Promise<void> => {
  try {
    const testText = "Hey! I decided to use PostgreSQL instead of MongoDB. Here's my code: const x = 5; I prefer dark mode.";

    // Check if API key exists
    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({
        error: 'Configuration Error',
        message: 'OPENAI_API_KEY is not set',
        apiKeyExists: false
      });
      return;
    }

    // Test extraction
    const extracted = await extractKeyInfo(testText);

    res.json({
      success: true,
      apiKeyExists: true,
      apiKeyPrefix: process.env.OPENAI_API_KEY.substring(0, 7) + '...',
      original: testText,
      extracted: extracted,
      extractionWorked: extracted !== testText
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Extraction Failed',
      message: error.message,
      apiKeyExists: !!process.env.OPENAI_API_KEY
    });
  }
});

/**
 * GET /api/v1/memories/predict
 * Phase 2: Predictive memory prefetching
 * Predicts which memories will likely be needed next based on patterns
 */
router.get('/predict', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const {
      current_context,
      recent_memories,
      limit = 10
    } = req.query;

    // Parse recent_memories (comma-separated IDs or JSON array)
    let recentIds: string[] = [];
    if (typeof recent_memories === 'string') {
      try {
        recentIds = JSON.parse(recent_memories);
      } catch {
        recentIds = recent_memories.split(',').map(id => id.trim()).filter(id => id);
      }
    }

    const predictions: any[] = [];
    const predictionMap = new Map<string, { confidence: number; reasons: string[]; related_to: string[] }>();

    // 1. Co-access pattern predictions
    if (recentIds.length > 0) {
      // Fetch access patterns for recent memories
      const { data: recentMemories } = await supabase
        .from('memories')
        .select('id, access_pattern')
        .in('id', recentIds)
        .eq('user_id', user.id);

      (recentMemories || []).forEach((memory: any) => {
        const accessPattern = memory.access_pattern || {};
        const coAccessed = accessPattern.co_accessed_with || [];

        coAccessed.forEach((coAccessedId: string) => {
          if (recentIds.includes(coAccessedId)) return; // Skip already accessed

          if (!predictionMap.has(coAccessedId)) {
            predictionMap.set(coAccessedId, {
              confidence: 0,
              reasons: [],
              related_to: []
            });
          }

          const prediction = predictionMap.get(coAccessedId)!;
          prediction.confidence += 0.3; // Boost confidence for co-access
          prediction.reasons.push('frequently_accessed_with');
          prediction.related_to.push(memory.id);
        });
      });
    }

    // 2. Relationship-based predictions
    if (recentIds.length > 0) {
      const { data: relationships } = await supabase
        .from('memory_relationships')
        .select('memory_id, related_memory_id, relationship_type, strength')
        .or(recentIds.map(id => `memory_id.eq.${id}`).join(','))
        .eq('memory_id', recentIds[0]); // Simplified query

      // Better query: use in() for multiple IDs
      const { data: relatedMemories } = await supabase
        .from('memory_relationships')
        .select('memory_id, related_memory_id, relationship_type, strength')
        .in('memory_id', recentIds);

      (relatedMemories || []).forEach((rel: any) => {
        const targetId = rel.related_memory_id;
        if (recentIds.includes(targetId)) return;

        if (!predictionMap.has(targetId)) {
          predictionMap.set(targetId, {
            confidence: 0,
            reasons: [],
            related_to: []
          });
        }

        const prediction = predictionMap.get(targetId)!;
        const relationshipBoost = rel.strength || 0.5;
        prediction.confidence += relationshipBoost * 0.4;
        prediction.reasons.push(`${rel.relationship_type}_relationship`);
        prediction.related_to.push(rel.memory_id);
      });
    }

    // 3. Temporal pattern predictions
    const currentHour = new Date().getHours();
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const { data: temporalPatterns } = await supabase
      .from('temporal_patterns')
      .select('*')
      .eq('user_id', user.id)
      .gte('confidence', 0.5)
      .order('confidence', { ascending: false });

    (temporalPatterns || []).forEach((pattern: any) => {
      const patternData = pattern.pattern_data || {};

      // Check if pattern matches current time
      let matchesTime = false;
      if (pattern.pattern_type === 'hourly' && patternData.hour === currentHour) {
        matchesTime = true;
      } else if (pattern.pattern_type === 'daily' && patternData.day === currentDay) {
        matchesTime = true;
      } else if (pattern.pattern_type === 'sequence' && recentIds.length > 0) {
        // Check if recent memories match sequence start
        const sequence = patternData.sequence || [];
        if (sequence.length > 0 && recentIds.includes(sequence[0])) {
          matchesTime = true;
        }
      }

      if (matchesTime) {
        const predictedMemories = patternData.memories || [];
        predictedMemories.forEach((memId: string) => {
          if (recentIds.includes(memId)) return;

          if (!predictionMap.has(memId)) {
            predictionMap.set(memId, {
              confidence: 0,
              reasons: [],
              related_to: []
            });
          }

          const prediction = predictionMap.get(memId)!;
          prediction.confidence += pattern.confidence * 0.3;
          prediction.reasons.push(`temporal_pattern_${pattern.pattern_type}`);
        });
      }
    });

    // 4. Context-based predictions (if context provided)
    if (current_context && typeof current_context === 'string') {
      // Use existing search to find contextually relevant memories
      const contextEmbedding = await generateEmbedding(current_context);
      if (contextEmbedding) {
        const { data: contextMatches } = await supabase.rpc('match_memories', {
          query_embedding: JSON.stringify(contextEmbedding),
          match_threshold: 0.6,
          match_count: 20,
          filter_user_id: user.id
        });

        (contextMatches || []).forEach((match: any) => {
          if (recentIds.includes(match.id)) return;

          if (!predictionMap.has(match.id)) {
            predictionMap.set(match.id, {
              confidence: 0,
              reasons: [],
              related_to: []
            });
          }

          const prediction = predictionMap.get(match.id)!;
          prediction.confidence += match.similarity * 0.4;
          prediction.reasons.push('context_similarity');
        });
      }
    }

    // 5. Fetch memory details for predictions
    const predictedIds = Array.from(predictionMap.keys());
    if (predictedIds.length > 0) {
      const { data: memoryDetails } = await supabase
        .from('memory_analytics')
        .select('id, text, helpfulness_score, usage_count, access_frequency')
        .in('id', predictedIds);

      const memoryMap = new Map((memoryDetails || []).map((m: any) => [m.id, m]));

      predictionMap.forEach((pred, memId) => {
        const memory = memoryMap.get(memId);
        if (memory) {
          // Boost confidence by helpfulness
          const finalConfidence = Math.min(
            pred.confidence * (0.5 + memory.helpfulness_score * 0.5),
            1.0
          );

          predictions.push({
            memory_id: memId,
            text: memory.text?.substring(0, 150) + '...',
            confidence: Math.round(finalConfidence * 100) / 100,
            reasons: [...new Set(pred.reasons)],
            related_to: [...new Set(pred.related_to)],
            helpfulness_score: memory.helpfulness_score,
            usage_count: memory.usage_count
          });
        }
      });
    }

    // Sort by confidence and limit results
    predictions.sort((a, b) => b.confidence - a.confidence);
    const topPredictions = predictions.slice(0, parseInt(String(limit)));

    res.json({
      predictions: topPredictions,
      count: topPredictions.length,
      context: current_context || null,
      recent_memories: recentIds
    });
  } catch (error: any) {
    console.error('Error predicting memories:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to predict memories.'
    });
  }
});

/**
 * GET /api/v1/memories/:id
 * Get a single memory by ID (with usage tracking)
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const context = req.query.context as string | undefined;

    // First, fetch the memory
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Memory not found.'
      });
      return;
    }

    // Increment memory usage before returning
    await supabase.rpc('increment_memory_usage', {
      p_memory_id: id,
      p_context: context || null
    });

    // Fetch learning metadata from analytics view
    const { data: analyticsData } = await supabase
      .from('memory_analytics')
      .select('access_frequency, recency_score, days_since_access, relationship_count')
      .eq('id', id)
      .single();

    // PHASE 3: Fetch contributor agents
    const { data: contributors } = await supabase
      .from('agent_memory_contributions')
      .select(`
        id,
        contribution_type,
        confidence,
        validation_status,
        created_at,
        agent_profiles!agent_memory_contributions_agent_id_fkey(
          id,
          agent_name,
          agent_type,
          reputation_score
        )
      `)
      .eq('memory_id', id)
      .order('created_at', { ascending: false });

    // Enhance response with learning metadata and contributors
    const enhancedMemory = {
      ...data,
      learning_metadata: analyticsData ? {
        access_frequency: analyticsData.access_frequency,
        recency_score: analyticsData.recency_score,
        days_since_access: analyticsData.days_since_access,
        relationship_count: analyticsData.relationship_count
      } : undefined,
      contributors: contributors || []
    };

    res.json(enhancedMemory);
  } catch (error: any) {
    console.error('Error getting memory:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to retrieve memory.'
    });
  }
});

/**
 * DELETE /api/v1/memories/:id
 * Delete a memory by ID
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    res.json({
      message: 'Memory deleted successfully.',
      id
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to delete memory.'
    });
  }
});

/**
 * PUT /api/v1/memories/:id
 * Update a memory by ID (regenerates embedding if text changes)
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { text, tags, metadata, project_id } = req.body;

    const updates: any = {};
    if (text) {
      updates.text = text;
      // Regenerate embedding if text changed
      const newEmbedding = await generateEmbedding(text);
      updates.embedding = newEmbedding ? `[${newEmbedding.join(',')}]` : null;
    }
    if (tags) updates.tags = tags;
    if (metadata) updates.metadata = metadata;
    if (project_id) updates.project_id = project_id;

    const { data, error } = await supabase
      .from('memories')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Memory not found.'
      });
      return;
    }

    res.json(data);
  } catch (error: any) {
    console.error('Error updating memory:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to update memory.'
    });
  }
});

/**
 * POST /api/v1/memories/:id/feedback
 * Submit feedback on memory helpfulness to improve future recommendations
 */
router.post('/:id/feedback', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { helpful, context, user_satisfaction } = req.body;

    if (typeof helpful !== 'boolean') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Field "helpful" must be a boolean.'
      });
      return;
    }

    // Validate user_satisfaction if provided
    if (user_satisfaction !== undefined) {
      const satisfaction = parseFloat(user_satisfaction);
      if (isNaN(satisfaction) || satisfaction < 0 || satisfaction > 1) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Field "user_satisfaction" must be a number between 0.0 and 1.0.'
        });
        return;
      }
    }

    // Verify memory belongs to user
    const { data: memory, error: fetchError } = await supabase
      .from('memories')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !memory) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Memory not found.'
      });
      return;
    }

    // Update helpfulness score using the database function
    const { data: updatedScore, error } = await supabase.rpc('update_helpfulness_score', {
      p_memory_id: id,
      p_helpful: helpful,
      p_user_satisfaction: user_satisfaction || null
    });

    if (error) throw error;

    // PHASE 2: Update user's adaptive learning parameters based on feedback
    await supabase.rpc('update_learning_params', {
      p_user_id: user.id,
      p_search_satisfaction: user_satisfaction || null,
      p_helpful_feedback: helpful
    });

    // Log feedback context if provided
    if (context) {
      const { data: currentMemory } = await supabase
        .from('memories')
        .select('access_pattern')
        .eq('id', id)
        .single();

      if (currentMemory) {
        const accessPattern = currentMemory.access_pattern || {};
        accessPattern.feedback_contexts = accessPattern.feedback_contexts || [];
        accessPattern.feedback_contexts.push({
          context,
          helpful,
          timestamp: new Date().toISOString()
        });

        await supabase
          .from('memories')
          .update({ access_pattern: accessPattern })
          .eq('id', id);
      }
    }

    res.json({
      success: true,
      memory_id: id,
      new_helpfulness_score: updatedScore,
      feedback: {
        helpful,
        context: context || null,
        user_satisfaction: user_satisfaction || null
      }
    });
  } catch (error: any) {
    console.error('Error processing feedback:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to process feedback.'
    });
  }
});

/**
 * POST /api/v1/memories/suggest
 * Phase 2: Context-aware suggestions
 * Proactively suggests relevant memories BEFORE the user asks
 */
router.post('/suggest', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const {
      context,
      include_reasoning = true,
      limit = 5,
      min_confidence = 0.6
    } = req.body;

    if (!context || typeof context !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Field "context" is required.'
      });
      return;
    }

    // Get user's learning parameters for personalized weighting
    const { data: userParams } = await supabase
      .from('user_learning_params')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const weights = userParams || {
      usage_weight: 0.3,
      recency_weight: 0.2,
      helpfulness_weight: 0.5
    };

    // 1. Vector similarity search
    const contextEmbedding = await generateEmbedding(context);
    let suggestions: any[] = [];

    if (contextEmbedding) {
      const { data: semanticMatches } = await supabase.rpc('match_memories', {
        query_embedding: JSON.stringify(contextEmbedding),
        match_threshold: 0.5,
        match_count: limit * 3, // Fetch more for re-ranking
        filter_user_id: user.id
      });

      suggestions = semanticMatches || [];
    } else {
      // Fallback to text search if embeddings not available
      const { data: textMatches } = await supabase
        .from('memories')
        .select('*')
        .eq('user_id', user.id)
        .ilike('text', `%${context.split(' ').slice(0, 3).join('%')}%`)
        .limit(limit * 3);

      suggestions = textMatches || [];
    }

    // 2. Enhance with analytics data
    if (suggestions.length > 0) {
      const memoryIds = suggestions.map((m: any) => m.id);
      const { data: analyticsData } = await supabase
        .from('memory_analytics')
        .select('*')
        .in('id', memoryIds);

      const analyticsMap = new Map(
        (analyticsData || []).map((a: any) => [a.id, a])
      );

      // 3. Calculate suggestion scores using learned weights
      suggestions = suggestions.map((memory: any) => {
        const analytics = analyticsMap.get(memory.id);
        const baseSimilarity = memory.similarity || 0.5;

        // Normalize usage count to 0-1 scale (log scale)
        const usageCount = analytics?.usage_count || 0;
        const normalizedUsage = Math.min(Math.log(usageCount + 1) / Math.log(100), 1.0);

        // Get recency score
        const recencyScore = analytics?.recency_score || 0.5;

        // Get helpfulness score
        const helpfulnessScore = analytics?.helpfulness_score || 0.5;

        // Calculate weighted suggestion score
        const suggestionScore =
          baseSimilarity * 0.4 + // Base semantic match
          normalizedUsage * weights.usage_weight +
          recencyScore * weights.recency_weight +
          helpfulnessScore * weights.helpfulness_weight;

        return {
          memory_id: memory.id,
          text: memory.text,
          similarity: baseSimilarity,
          suggestion_score: suggestionScore,
          analytics: {
            usage_count: usageCount,
            helpfulness_score: helpfulnessScore,
            recency_score: recencyScore,
            access_frequency: analytics?.access_frequency || 'unused',
            days_since_access: analytics?.days_since_access
          },
          reasoning: include_reasoning ? {
            semantic_match: baseSimilarity > 0.7 ? 'high' : baseSimilarity > 0.5 ? 'medium' : 'low',
            frequently_used: usageCount > 10,
            recently_accessed: recencyScore > 0.8,
            high_helpfulness: helpfulnessScore > 0.7,
            weights_applied: weights
          } : undefined
        };
      });

      // 4. Filter by minimum confidence and sort
      suggestions = suggestions
        .filter((s: any) => s.suggestion_score >= min_confidence)
        .sort((a: any, b: any) => b.suggestion_score - a.suggestion_score)
        .slice(0, limit);

      // 5. Check for related memories to enhance suggestions
      if (suggestions.length > 0) {
        const topIds = suggestions.map((s: any) => s.memory_id);
        const { data: relationships } = await supabase
          .from('memory_relationships')
          .select('memory_id, related_memory_id, relationship_type, strength')
          .in('memory_id', topIds)
          .gte('strength', 0.6);

        // Add relationship info to suggestions
        const relationshipMap = new Map<string, any[]>();
        (relationships || []).forEach((rel: any) => {
          if (!relationshipMap.has(rel.memory_id)) {
            relationshipMap.set(rel.memory_id, []);
          }
          relationshipMap.get(rel.memory_id)!.push({
            related_memory_id: rel.related_memory_id,
            relationship_type: rel.relationship_type,
            strength: rel.strength
          });
        });

        suggestions = suggestions.map((s: any) => ({
          ...s,
          related_memories: relationshipMap.get(s.memory_id) || []
        }));
      }
    }

    res.json({
      suggestions,
      count: suggestions.length,
      context,
      weights_used: weights,
      min_confidence
    });
  } catch (error: any) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to generate suggestions.'
    });
  }
});

/**
 * GET /api/v1/memories/meta/patterns
 * Analyze usage patterns and return learning insights
 */
router.get('/meta/patterns', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { days = 30 } = req.query;

    // Get all memories with analytics data
    const { data: analytics, error: analyticsError } = await supabase
      .from('memory_analytics')
      .select('*')
      .eq('user_id', user.id);

    if (analyticsError) throw analyticsError;

    const memories = analytics || [];

    // 1. Most useful tags
    const tagStats = new Map<string, { count: number; totalHelpfulness: number; totalUsage: number }>();

    memories.forEach((memory: any) => {
      (memory.tags || []).forEach((tag: string) => {
        if (!tagStats.has(tag)) {
          tagStats.set(tag, { count: 0, totalHelpfulness: 0, totalUsage: 0 });
        }
        const stats = tagStats.get(tag)!;
        stats.count++;
        stats.totalHelpfulness += memory.helpfulness_score || 0.5;
        stats.totalUsage += memory.usage_count || 0;
      });
    });

    const mostUsefulTags = Array.from(tagStats.entries())
      .map(([tag, stats]) => ({
        tag,
        avg_helpfulness: stats.totalHelpfulness / stats.count,
        usage_count: stats.totalUsage
      }))
      .sort((a, b) => b.avg_helpfulness - a.avg_helpfulness)
      .slice(0, 10);

    // 2. Find frequently co-accessed memories (from access_pattern data)
    const coAccessMap = new Map<string, number>();

    memories.forEach((memory: any) => {
      const accessPattern = memory.access_pattern || {};
      const coAccessed = accessPattern.co_accessed_with || [];
      coAccessed.forEach((otherId: string) => {
        const key = [memory.id, otherId].sort().join('|');
        coAccessMap.set(key, (coAccessMap.get(key) || 0) + 1);
      });
    });

    const frequentlyAccessedTogether = Array.from(coAccessMap.entries())
      .map(([key, count]) => {
        const [id1, id2] = key.split('|');
        return {
          memory_id_1: id1,
          memory_id_2: id2,
          co_access_count: count
        };
      })
      .filter(pair => pair.co_access_count >= 3)
      .sort((a, b) => b.co_access_count - a.co_access_count)
      .slice(0, 20);

    // 3. Underutilized memories (low usage, high age)
    const underutilizedMemories = memories
      .filter((m: any) => (m.days_since_access || 0) > 90 || m.usage_count === 0)
      .map((m: any) => ({
        id: m.id,
        text: m.text?.substring(0, 100) + '...',
        days_since_access: m.days_since_access || 0,
        usage_count: m.usage_count || 0
      }))
      .sort((a, b) => b.days_since_access - a.days_since_access)
      .slice(0, 10);

    // 4. Access time patterns (requires more detailed access_pattern data)
    const hourlyDistribution: Record<number, number> = {};
    const dailyDistribution: Record<string, number> = {};

    // This would require storing timestamps in access_pattern
    // For now, return empty patterns
    for (let i = 0; i < 24; i++) {
      hourlyDistribution[i] = 0;
    }

    // 5. Optimal relationship types (based on helpfulness of related memories)
    const { data: relationships, error: relError } = await supabase
      .from('memory_relationships')
      .select('*, memories!memory_relationships_memory_id_fkey(helpfulness_score)')
      .eq('memories.user_id', user.id);

    const relationshipTypeStats = new Map<string, { count: number; totalHelpfulness: number }>();

    (relationships || []).forEach((rel: any) => {
      const type = rel.relationship_type;
      const helpfulness = rel.memories?.helpfulness_score || 0.5;

      if (!relationshipTypeStats.has(type)) {
        relationshipTypeStats.set(type, { count: 0, totalHelpfulness: 0 });
      }
      const stats = relationshipTypeStats.get(type)!;
      stats.count++;
      stats.totalHelpfulness += helpfulness;
    });

    const optimalRelationshipTypes: Record<string, number> = {};
    relationshipTypeStats.forEach((stats, type) => {
      optimalRelationshipTypes[type] = stats.totalHelpfulness / stats.count;
    });

    // 6. Summary statistics
    const totalMemories = memories.length;
    const totalAccesses = memories.reduce((sum: number, m: any) => sum + (m.usage_count || 0), 0);
    const avgHelpfulness = memories.length > 0
      ? memories.reduce((sum: number, m: any) => sum + (m.helpfulness_score || 0.5), 0) / memories.length
      : 0.5;
    const activeMemories = memories.filter((m: any) => (m.days_since_access || 999) <= 30).length;
    const staleMemories = memories.filter((m: any) => (m.days_since_access || 0) > 90).length;

    res.json({
      most_useful_tags: mostUsefulTags,
      frequently_accessed_together: frequentlyAccessedTogether,
      underutilized_memories: underutilizedMemories,
      access_time_patterns: {
        hourly_distribution: hourlyDistribution,
        daily_distribution: dailyDistribution
      },
      optimal_relationship_types: optimalRelationshipTypes,
      summary: {
        total_memories: totalMemories,
        total_accesses: totalAccesses,
        avg_helpfulness: avgHelpfulness,
        active_memories: activeMemories,
        stale_memories: staleMemories
      }
    });
  } catch (error: any) {
    console.error('Error analyzing patterns:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to analyze patterns.'
    });
  }
});

/**
 * POST /api/v1/memories/auto-save
 * Smart Auto-Save with Importance Classification
 * Automatically classifies conversation turns and saves important information
 */

interface AutoSaveRequest {
  text: string;
  context?: string;
  user_id?: string;
  force_save?: boolean;
}

interface ClassificationResult {
  category: 'decision' | 'fact' | 'preference' | 'outcome' | 'brainstorming' | null;
  should_save: boolean;
  confidence: number;
  reasoning: string;
}

router.post('/auto-save', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const user = req.user!;
    const { text, context, force_save = false }: AutoSaveRequest = req.body;

    if (!text || text.trim().length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Text is required'
      });
      return;
    }

    console.log('Auto-save requested', {
      textLength: text.length,
      force_save,
    });

    let classification: ClassificationResult | null = null;
    let memoryId: string | null = null;
    let saved = false;

    // If force_save is true, skip classification
    if (force_save) {
      const { data: memory, error: saveError } = await supabase
        .from('memories')
        .insert({
          user_id: user.id,
          text,
          source: 'api',
          project_id: 'default',
          tags: ['auto-saved', 'force-saved'],
          metadata: { force_saved: true, context },
        })
        .select('id')
        .single();

      if (saveError) throw saveError;

      memoryId = memory.id;
      saved = true;

      // Log classification (even though we force-saved)
      await supabase.from('memory_importance_classifications').insert({
        memory_id: memoryId,
        user_id: user.id,
        category: null,
        should_save: true,
        confidence: 1.0,
        reasoning: 'Force saved by user request',
        classification_time_ms: Date.now() - startTime,
        force_saved: true,
      });

    } else {
      // Use Anthropic Claude Haiku for classification
      if (!anthropic) {
        res.status(500).json({
          error: 'Server Error',
          message: 'Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.'
        });
        return;
      }

      const classificationStartTime = Date.now();

      const prompt = `Analyze this conversation turn. Classify if it contains important information worth remembering.

Categories (respond with JSON only):
1. decision: An explicit decision was made
2. fact: New factual information about the user or context
3. preference: User expressed a preference or opinion
4. outcome: A result or outcome of an action
5. brainstorming: Just discussion/ideas without decisions

Conversation turn:
${text}

${context ? `Additional context:\n${context}` : ''}

Respond ONLY with valid JSON:
{
  "category": "decision" | "fact" | "preference" | "outcome" | "brainstorming",
  "should_save": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

      try {
        const response = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: prompt,
          }],
        });

        const contentBlock = response.content[0];
        if (contentBlock.type === 'text') {
          const result = JSON.parse(contentBlock.text);
          classification = {
            category: result.category,
            should_save: result.should_save,
            confidence: result.confidence,
            reasoning: result.reasoning,
          };

          const classificationTime = Date.now() - classificationStartTime;

          // If should_save is true, create the memory
          if (classification.should_save) {
            const { data: memory, error: saveError } = await supabase
              .from('memories')
              .insert({
                user_id: user.id,
                text,
                source: 'api',
                project_id: 'default',
                tags: ['auto-saved', classification.category],
                metadata: {
                  classification: classification.category,
                  confidence: classification.confidence,
                  context,
                },
              })
              .select('id')
              .single();

            if (saveError) throw saveError;

            memoryId = memory.id;
            saved = true;
          }

          // Log classification result
          await supabase.from('memory_importance_classifications').insert({
            memory_id: memoryId,
            user_id: user.id,
            category: classification.category,
            should_save: classification.should_save,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
            classification_time_ms: classificationTime,
            force_saved: false,
          });

          res.setHeader('X-Classification-Used', 'anthropic-haiku');
        }
      } catch (aiError: any) {
        console.error('Classification failed', { error: aiError.message });
        res.status(500).json({
          error: 'Server Error',
          message: 'Classification failed: ' + aiError.message
        });
        return;
      }
    }

    const processingTime = Date.now() - startTime;
    res.setHeader('X-Processing-Time-Ms', processingTime.toString());

    res.json({
      saved,
      memory_id: memoryId,
      category: classification?.category || null,
      confidence: classification?.confidence || (force_save ? 1.0 : 0),
      reasoning: classification?.reasoning || (force_save ? 'Force saved' : ''),
      classification_time_ms: processingTime,
    });

    console.log('Auto-save completed', {
      saved,
      category: classification?.category,
      processing_time_ms: processingTime,
    });

  } catch (error: any) {
    console.error('Auto-save failed', {
      error: error.message,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to auto-save memory.'
    });
  }
});

export default router;


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

const router = Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Function to extract key information using OpenAI GPT-4o-mini
async function extractKeyInfo(text: string): Promise<string> {
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
    // If extraction fails, return original text
    return text;
  }
}

// Function to generate embedding
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Temporary: Create mock user if auth is bypassed
router.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    // Mock user for testing without auth
    req.user = {
      id: '00000000-0000-0000-0000-000000000001',
      api_key: 'mock-key'
    } as any;
  }
  next();
});


// All routes require authentication
// router.use(authenticateApiKey);

/**
 * POST /api/v1/memories
 * Create a new memory with vector embedding
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { text, source, project_id, tags, metadata }: CreateMemoryRequest = req.body;

    if (!text) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Text is required.'
      });
      return;
    }

    // Extract key information using OpenAI GPT-4o-mini
    const extractedText = await extractKeyInfo(text);

    // Generate embedding for semantic search using extracted text
    const embedding = await generateEmbedding(extractedText);

    const memory = {
      user_id: user.id,
      text: extractedText, // Save the extracted key information
      source: source || 'api',
      project_id: project_id || 'default',
      tags: tags || [],
      metadata: {
        ...metadata,
        original_text: text, // Preserve original text in metadata
        extracted: true
      },
      embedding: `[${embedding.join(',')}]`, // Convert to pgvector string format
    };

    const { data, error } = await supabase
      .from('memories')
      .insert(memory)
      .select()
      .single();

    if (error) throw error;

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
 * POST /api/v1/memories/batch
 * Create multiple memories in batch with vector embeddings
 */
router.post('/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { memories } = req.body;

    // Validation
    if (!memories || !Array.isArray(memories)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Memories array is required.'
      });
      return;
    }

    if (memories.length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Memories array cannot be empty.'
      });
      return;
    }

    if (memories.length > 100) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Maximum 100 memories can be created at once.'
      });
      return;
    }

    // Validate all memories have required fields
    for (let i = 0; i < memories.length; i++) {
      if (!memories[i].text) {
        res.status(400).json({
          error: 'Bad Request',
          message: `Memory at index ${i} is missing required field: text`
        });
        return;
      }
    }

    // Process all memories in parallel
    // Step 1: Extract key information for all memories
    const extractionPromises = memories.map(async (mem: any) => {
      return await extractKeyInfo(mem.text);
    });
    const extractedTexts = await Promise.all(extractionPromises);

    // Step 2: Generate embeddings for all extracted texts in parallel
    const embeddingPromises = extractedTexts.map(async (text: string) => {
      return await generateEmbedding(text);
    });
    const embeddings = await Promise.all(embeddingPromises);

    // Step 3: Prepare all memory records
    const memoryRecords = memories.map((mem: any, index: number) => ({
      user_id: user.id,
      text: extractedTexts[index],
      source: mem.source || 'api',
      project_id: mem.project_id || 'default',
      tags: mem.tags || [],
      metadata: {
        ...mem.metadata,
        original_text: mem.text,
        extracted: true
      },
      embedding: `[${embeddings[index].join(',')}]`
    }));

    // Step 4: Insert all memories in a single transaction
    const { data, error } = await supabase
      .from('memories')
      .insert(memoryRecords)
      .select('id, text, created_at, source, tags');

    if (error) {
      throw error;
    }

    res.status(201).json({
      created: data?.length || 0,
      memories: data || [],
      failed: 0
    });

  } catch (error: any) {
    console.error('Error creating batch memories:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to create batch memories. All memories rolled back.'
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
 * Semantic search using vector similarity (POST version for body params)
 */
router.post('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { query, limit = 10 } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Query field is required.'
      });
      return;
    }

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query);

    // Use Supabase RPC for vector similarity search
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.5,
      match_count: parseInt(String(limit)),
      filter_user_id: user.id
    });

    if (error) throw error;

    res.json({
      memories: data || [],
      count: data?.length || 0,
      query
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

// Cache for stats with 5-minute TTL
interface StatsCache {
  [userId: string]: {
    data: any;
    timestamp: number;
  };
}
const statsCache: StatsCache = {};
const STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Cleanup expired cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(statsCache).forEach(userId => {
    if (now - statsCache[userId].timestamp > STATS_CACHE_TTL) {
      delete statsCache[userId];
    }
  });
}, 10 * 60 * 1000);

/**
 * GET /api/v1/stats
 * Get analytics and statistics for the authenticated user's memories
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const now = Date.now();

    // Check cache first
    if (statsCache[user.id] && (now - statsCache[user.id].timestamp) < STATS_CACHE_TTL) {
      res.json({
        ...statsCache[user.id].data,
        cached: true,
        cache_age_seconds: Math.floor((now - statsCache[user.id].timestamp) / 1000)
      });
      return;
    }

    // Calculate date boundaries for growth metrics
    const nowDate = new Date();
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).toISOString();
    const weekStart = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).toISOString();

    // Query 1: Total count and basic stats
    const { data: allMemories, error: allError } = await supabase
      .from('memories')
      .select('source, tags, text, created_at')
      .eq('user_id', user.id);

    if (allError) throw allError;

    const totalMemories = allMemories?.length || 0;

    // Calculate by_source aggregation
    const bySource: { [key: string]: number } = {};
    allMemories?.forEach((mem: any) => {
      bySource[mem.source] = (bySource[mem.source] || 0) + 1;
    });

    // Calculate by_tag aggregation (unnest tags array)
    const byTag: { [key: string]: number } = {};
    allMemories?.forEach((mem: any) => {
      if (mem.tags && Array.isArray(mem.tags)) {
        mem.tags.forEach((tag: string) => {
          byTag[tag] = (byTag[tag] || 0) + 1;
        });
      }
    });

    // Calculate growth metrics
    const todayCount = allMemories?.filter((m: any) => m.created_at >= todayStart).length || 0;
    const weekCount = allMemories?.filter((m: any) => m.created_at >= weekStart).length || 0;
    const monthCount = allMemories?.filter((m: any) => m.created_at >= monthStart).length || 0;

    // Calculate storage metrics
    const totalTextBytes = allMemories?.reduce((sum: number, m: any) => {
      return sum + (m.text ? new TextEncoder().encode(m.text).length : 0);
    }, 0) || 0;
    const avgMemorySize = totalMemories > 0 ? Math.round(totalTextBytes / totalMemories) : 0;

    const statsData = {
      total_memories: totalMemories,
      by_source: bySource,
      by_tag: byTag,
      growth: {
        today: todayCount,
        this_week: weekCount,
        this_month: monthCount
      },
      storage: {
        total_text_bytes: totalTextBytes,
        avg_memory_size: avgMemorySize
      }
    };

    // Cache the results
    statsCache[user.id] = {
      data: statsData,
      timestamp: now
    };

    res.json({
      ...statsData,
      cached: false
    });

  } catch (error: any) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to retrieve stats.'
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
 * GET /api/v1/memories/:id
 * Get a single memory by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;

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

    res.json(data);
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
      updates.embedding = `[${newEmbedding.join(',')}]`;
    }
    if (tags) updates.tags = tags;
    if (metadata) updates.metadata = metadata;
    if (project_id) updates.project_id = project_id;

    const { data, error } = await supabase
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

export default router;
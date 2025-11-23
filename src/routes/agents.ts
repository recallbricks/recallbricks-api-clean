/**
 * Agent Routes - Identity Fusion Protocol
 *
 * RecallBricks is identity-agnostic memory infrastructure.
 * - agent_id: Unique identifier (developer provides)
 * - identity_schema: Flexible JSON (developer defines)
 * - No hardcoded defaults or assumptions
 *
 * Endpoints for persistent agent identity through memory:
 * - POST /api/v1/agents/:agent_id/context - Agent context injection
 * - POST /api/v1/memories/auto-save - Smart auto-save with importance classification
 * - POST /api/v1/agents/validate-identity - Identity validation (context guardian)
 *
 * If agent_id doesn't exist, creates minimal profile.
 * Developer customizes identity via separate API calls.
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { Errors } from '../utils/errors.js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

// Initialize Anthropic client for classification
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
}) : null;

// All routes require authentication
router.use(authenticateApiKey);

// ============================================================================
// ENDPOINT 1: Agent Context Injection
// POST /api/v1/agents/:agent_id/context
// ============================================================================
/**
 * Agent Context Injection Endpoint
 *
 * RecallBricks is identity-agnostic infrastructure.
 * - agent_id: Unique identifier (developer provides)
 * - identity_schema: Flexible JSON (developer defines)
 * - No hardcoded defaults or assumptions
 *
 * If agent_id doesn't exist, creates minimal profile.
 * Developer customizes identity via separate API calls.
 *
 * System prompt is built dynamically based on what's in the schema:
 * - If schema has name/purpose/traits, includes them
 * - If schema is minimal, only includes memory context
 * - No fabricated personality data
 */

interface AgentContextRequest {
  depth?: 'quick' | 'standard' | 'comprehensive';
  user_id?: string;
}

interface IdentitySchema {
  agent_id?: string;
  agent_name?: string;
  name?: string;
  purpose?: string;
  role?: string;
  traits?: string[];
  context_rules?: string[];
  origin_model?: string;
  created_at?: string;
  schema_version?: string;
  metadata?: any;
  [key: string]: any; // Allow any additional custom fields
}

router.post('/:agent_id/context', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const { agent_id } = req.params;
    const { depth = 'standard', user_id = 'default' }: AgentContextRequest = req.body;
    const authenticatedUserId = req.userId || req.user?.id;

    logger.info('Agent context injection requested', {
      agent_id,
      depth,
      user_id,
      requestId: req.requestId,
    });

    // Determine memory limits based on depth
    const depthLimits = {
      quick: { recent: 5, important: 5 },
      standard: { recent: 10, important: 10 },
      comprehensive: { recent: 20, important: 20 },
    };
    const limits = depthLimits[depth];

    // 1. Get or create agent profile
    let agentProfile: any;
    const { data: existingAgent } = await supabase
      .from('agent_profiles')
      .select('*')
      .eq('user_id', authenticatedUserId)
      .eq('agent_name', agent_id)
      .single();

    if (existingAgent) {
      agentProfile = existingAgent;
    } else {
      // Create new agent profile with minimal default schema
      const { data: newAgent, error: createError } = await supabase
        .from('agent_profiles')
        .insert({
          user_id: authenticatedUserId,
          agent_name: agent_id,
          agent_type: 'general',
          identity_schema: {
            agent_id: agent_id,
            created_at: new Date().toISOString(),
            schema_version: '1.0',
            metadata: {
              note: 'Default identity - customize via API',
            },
          },
        })
        .select()
        .single();

      if (createError) {
        throw Errors.databaseError('Failed to create agent profile', { error: createError.message });
      }

      agentProfile = newAgent;
    }

    // Use identity schema as-is - no hardcoded defaults
    const identitySchema: IdentitySchema = agentProfile.identity_schema || {
      agent_id: agent_id,
      metadata: { note: 'No identity schema defined' },
    };

    // 2. Get recent memories (parallel query) - defensive fetching
    let recentMemories: any[] = [];
    try {
      const { data, error: recentError } = await supabase
        .from('memories')
        .select('id, text, created_at')
        .eq('user_id', authenticatedUserId)
        .order('created_at', { ascending: false })
        .limit(limits.recent);

      if (recentError) {
        logger.warn('Failed to fetch recent memories', {
          error: recentError.message,
          code: recentError.code,
          details: recentError.details,
          hint: recentError.hint,
          user_id: authenticatedUserId,
          agent_id,
        });
      } else {
        recentMemories = data || [];
      }
    } catch (err: any) {
      logger.error('Exception while fetching recent memories', {
        error: err.message,
        user_id: authenticatedUserId,
        agent_id,
      });
      // Continue with empty array - don't fail the entire endpoint
    }

    // 3. Get important memories (high helpfulness score) - defensive fetching
    let importantMemories: any[] = [];
    try {
      const { data, error: importantError } = await supabase
        .from('memories')
        .select('id, text, helpfulness_score, usage_count')
        .eq('user_id', authenticatedUserId)
        .order('helpfulness_score', { ascending: false })
        .limit(limits.important);

      if (importantError) {
        logger.warn('Failed to fetch important memories', {
          error: importantError.message,
          code: importantError.code,
          details: importantError.details,
          hint: importantError.hint,
          user_id: authenticatedUserId,
          agent_id,
        });
      } else {
        importantMemories = data || [];
      }
    } catch (err: any) {
      logger.error('Exception while fetching important memories', {
        error: err.message,
        user_id: authenticatedUserId,
        agent_id,
      });
      // Continue with empty array - don't fail the entire endpoint
    }

    // 4. Get usage patterns from last 7 days - defensive fetching
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let recentAccess: any[] = [];
    try {
      const { data, error: accessError } = await supabase
        .from('memories')
        .select('tags, metadata')
        .eq('user_id', authenticatedUserId)
        .gte('last_accessed', sevenDaysAgo.toISOString())
        .order('usage_count', { ascending: false })
        .limit(20);

      if (accessError) {
        logger.warn('Failed to fetch usage patterns', {
          error: accessError.message,
          user_id: authenticatedUserId,
          agent_id,
        });
      } else {
        recentAccess = data || [];
      }
    } catch (err: any) {
      logger.error('Exception while fetching usage patterns', {
        error: err.message,
        user_id: authenticatedUserId,
        agent_id,
      });
      // Continue with empty array
    }

    // Extract key patterns
    const tagFrequency: Record<string, number> = {};
    const topics: string[] = [];

    recentAccess?.forEach((memory: any) => {
      memory.tags?.forEach((tag: string) => {
        tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
      });
    });

    const mostDiscussedTopics = Object.entries(tagFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tag]) => tag);

    const recentFocus = recentMemories?.slice(0, 5).map((m: any) => {
      const words = m.text.split(' ');
      return words.slice(0, 10).join(' ') + (words.length > 10 ? '...' : '');
    }) || [];

    // 5. Build system prompt injection - flexible based on what's in schema
    let systemPromptInjection = '';

    // Only add identity section if schema has identity fields
    const hasIdentityFields = identitySchema.name || identitySchema.agent_name ||
                               identitySchema.purpose || identitySchema.role ||
                               (identitySchema.traits && identitySchema.traits.length > 0);

    if (hasIdentityFields) {
      systemPromptInjection += `## AGENT IDENTITY\n\n`;

      if (identitySchema.name || identitySchema.agent_name) {
        systemPromptInjection += `**Name:** ${identitySchema.name || identitySchema.agent_name}\n`;
      }

      if (identitySchema.purpose || identitySchema.role) {
        systemPromptInjection += `**Purpose:** ${identitySchema.purpose || identitySchema.role}\n`;
      }

      if (identitySchema.traits && identitySchema.traits.length > 0) {
        systemPromptInjection += `**Traits:** ${identitySchema.traits.join(', ')}\n`;
      }

      if (identitySchema.origin_model) {
        systemPromptInjection += `**Origin Model:** ${identitySchema.origin_model}\n`;
      }

      systemPromptInjection += `\n`;
    }

    // Only add behavioral rules if they exist
    if (identitySchema.context_rules && identitySchema.context_rules.length > 0) {
      systemPromptInjection += `## BEHAVIORAL RULES\n\n`;
      identitySchema.context_rules.forEach((rule, i) => {
        systemPromptInjection += `${i + 1}. ${rule}\n`;
      });
      systemPromptInjection += `\n`;
    }

    // Add memory context regardless of identity completeness
    systemPromptInjection += `## RECENT CONTEXT\n\n`;
    systemPromptInjection += `You have access to ${recentMemories?.length || 0} recent memories and ${importantMemories?.length || 0} important memories from past interactions.\n\n`;

    if (mostDiscussedTopics.length > 0) {
      systemPromptInjection += `**Most Discussed Topics:** ${mostDiscussedTopics.join(', ')}\n\n`;
    }

    if (recentFocus.length > 0) {
      systemPromptInjection += `**Recent Focus Areas:**\n`;
      recentFocus.forEach((focus: string) => {
        systemPromptInjection += `- ${focus}\n`;
      });
      systemPromptInjection += `\n`;
    }

    // Only add identity maintenance reminder if agent has a name
    const agentName = identitySchema.name || identitySchema.agent_name;
    if (agentName) {
      systemPromptInjection += `## MEMORY-FIRST PROTOCOL\n\n`;
      systemPromptInjection += `CRITICAL: Before responding to any user query:\n`;
      systemPromptInjection += `1. Query your memory system for relevant context\n`;
      systemPromptInjection += `2. Reference past conversations when applicable\n`;
      systemPromptInjection += `3. Build on previous knowledge rather than starting fresh\n`;
      systemPromptInjection += `4. Maintain consistency with your established identity and past interactions\n\n`;
      systemPromptInjection += `You are ${agentName}, not a generic AI model. Always maintain this identity.\n`;
    }

    systemPromptInjection = systemPromptInjection.trim();

    // 6. Track context load for analytics (non-blocking)
    try {
      await supabase.from('agent_context_loads').insert({
        agent_id: agentProfile.id,
        user_id: authenticatedUserId,
        depth_level: depth,
        memories_loaded: (recentMemories?.length || 0) + (importantMemories?.length || 0),
        processing_time_ms: Date.now() - startTime,
      });
    } catch (err: any) {
      logger.warn('Failed to track context load analytics', {
        error: err.message,
        agent_id,
      });
      // Non-blocking - continue even if analytics fail
    }

    const processingTime = Date.now() - startTime;

    res.setHeader('X-Processing-Time-Ms', processingTime.toString());
    res.json({
      agent_id,
      user_id,
      system_prompt_injection: systemPromptInjection,
      identity_schema: identitySchema,
      recent_memories: recentMemories || [],
      important_memories: importantMemories || [],
      key_patterns: {
        most_discussed_topics: mostDiscussedTopics,
        recent_focus: recentFocus,
        communication_style: identitySchema.traits?.join(', ') || 'Not specified',
      },
      loaded_at: new Date().toISOString(),
      depth_used: depth,
    });

    logger.info('Agent context loaded successfully', {
      agent_id,
      depth,
      memories_loaded: (recentMemories?.length || 0) + (importantMemories?.length || 0),
      processing_time_ms: processingTime,
    });

  } catch (error: any) {
    logger.error('Agent context injection failed', {
      error: error.message,
      agent_id: req.params.agent_id,
    });
    throw error;
  }
});

// ============================================================================
// NOTE: Endpoint 2 (auto-save) is implemented in memories.ts as POST /api/v1/memories/auto-save
// ============================================================================
// ENDPOINT 3: Identity Validation (Context Guardian)
// POST /api/v1/agents/validate-identity
// ============================================================================

interface ValidateIdentityRequest {
  agent_id: string;
  response_text: string;
  auto_correct?: boolean;
}

interface IdentityViolation {
  type: string;
  text: string;
  location: string;
}

router.post('/validate-identity', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const { agent_id, response_text, auto_correct = false }: ValidateIdentityRequest = req.body;
    const authenticatedUserId = req.userId || req.user?.id;

    if (!agent_id || !response_text) {
      throw Errors.validationError('agent_id and response_text are required');
    }

    logger.info('Identity validation requested', {
      agent_id,
      auto_correct,
      requestId: req.requestId,
    });

    // Get agent's identity schema
    const { data: agentProfile } = await supabase
      .from('agent_profiles')
      .select('*')
      .eq('user_id', authenticatedUserId)
      .eq('agent_name', agent_id)
      .single();

    if (!agentProfile) {
      throw Errors.resourceNotFound('Agent', agent_id);
    }

    const identitySchema: IdentitySchema = agentProfile.identity_schema || {
      agent_id: agent_id,
      metadata: { note: 'No identity schema defined' },
    };

    // Check for violations
    const violations: IdentityViolation[] = [];
    const lowerResponse = response_text.toLowerCase();

    // Check for base model references (unless agent name is actually "Claude", etc.)
    const agentNameLower = (identitySchema.agent_name || identitySchema.name || '').toLowerCase();
    if (agentNameLower !== 'claude') {
      if (lowerResponse.includes('as claude') || lowerResponse.includes('i am claude') || lowerResponse.includes("i'm claude")) {
        const match = response_text.match(/(as claude|i am claude|i'm claude)/i);
        if (match) {
          violations.push({
            type: 'base_model_reference',
            text: match[0],
            location: 'Response contains reference to "Claude"',
          });
        }
      }
    }

    // Check for other base model references
    const baseModelPatterns = [
      { pattern: /chatgpt|gpt-4|gpt-3/i, name: 'ChatGPT/GPT' },
      { pattern: /as an ai language model/i, name: 'Generic AI language model' },
      { pattern: /i don't have access to previous conversations/i, name: 'No memory claim' },
      { pattern: /i cannot remember|i have no memory of/i, name: 'Memory denial' },
    ];

    baseModelPatterns.forEach(({ pattern, name }) => {
      const match = response_text.match(pattern);
      if (match) {
        violations.push({
          type: 'base_model_reference',
          text: match[0],
          location: `Response contains ${name} reference`,
        });
      }
    });

    const identityMaintained = violations.length === 0;
    const leakageDetected = violations.length > 0;

    // Log violations
    if (leakageDetected) {
      for (const violation of violations) {
        await supabase.from('agent_identity_violations').insert({
          agent_id: agentProfile.id,
          violation_type: violation.type,
          violation_text: violation.text,
          response_location: violation.location,
          auto_corrected: auto_correct,
        });
      }
    }

    // Auto-correct if requested
    let correctedResponse: string | null = null;
    if (auto_correct && leakageDetected) {
      const agentName = identitySchema.name || identitySchema.agent_name || agent_id;
      const agentPurpose = identitySchema.purpose || identitySchema.role || 'an AI assistant';
      correctedResponse = `[IDENTITY REMINDER: You are ${agentName}, ${agentPurpose}. Maintain this identity in all responses.]\n\n${response_text}`;
    }

    const processingTime = Date.now() - startTime;
    res.setHeader('X-Processing-Time-Ms', processingTime.toString());

    res.json({
      identity_maintained: identityMaintained,
      leakage_detected: leakageDetected,
      violations,
      corrected_response: correctedResponse,
      agent_name: identitySchema.name || identitySchema.agent_name || agent_id,
    });

    logger.info('Identity validation completed', {
      agent_id,
      identity_maintained: identityMaintained,
      violations_found: violations.length,
      processing_time_ms: processingTime,
    });

  } catch (error: any) {
    logger.error('Identity validation failed', {
      error: error.message,
    });
    throw error;
  }
});

export default router;

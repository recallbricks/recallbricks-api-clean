/**
 * Collaboration Routes - Phase 3
 *
 * Multi-agent collaboration endpoints for RecallBricks
 */

import { Router, Request, Response } from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import {
  createAgentProfile,
  getAgentProfile,
  listUserAgents,
  updateAgentReputation,
  agentContributeMemory,
  detectConflicts,
  resolveConflict,
  synthesizeKnowledge,
  getCollaborationDashboard,
  transferLearning,
  getAgentPerformance,
  listUnresolvedConflicts,
  validateContribution
} from '../services/collaborationService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All routes require authentication
router.use(authenticateApiKey);

/**
 * POST /api/v1/collaboration/agents
 * Create a new agent profile
 */
router.post('/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { agent_name, agent_type, expertise_domains, confidence_threshold, agent_metadata } = req.body;

    if (!agent_name || !agent_type) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Fields "agent_name" and "agent_type" are required.'
      });
      return;
    }

    const agent = await createAgentProfile(user.id, {
      agent_name,
      agent_type,
      expertise_domains,
      confidence_threshold,
      agent_metadata
    });

    res.status(201).json(agent);
  } catch (error: any) {
    logger.error('Error creating agent', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to create agent profile.'
    });
  }
});

/**
 * GET /api/v1/collaboration/agents
 * List all agents for the authenticated user
 */
router.get('/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const agents = await listUserAgents(user.id);

    res.json({
      agents,
      count: agents.length
    });
  } catch (error: any) {
    logger.error('Error listing agents', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to list agents.'
    });
  }
});

/**
 * GET /api/v1/collaboration/agents/:id
 * Get a specific agent profile
 */
router.get('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const agent = await getAgentProfile(id);

    if (!agent) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found.'
      });
      return;
    }

    // Verify agent belongs to user
    if (agent.user_id !== user.id) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this agent.'
      });
      return;
    }

    res.json(agent);
  } catch (error: any) {
    logger.error('Error getting agent', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to get agent.'
    });
  }
});

/**
 * GET /api/v1/collaboration/agents/:id/performance
 * Get performance metrics for an agent
 */
router.get('/agents/:id/performance', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const agent = await getAgentProfile(id);
    if (!agent || agent.user_id !== user.id) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found.'
      });
      return;
    }

    const performance = await getAgentPerformance(id);

    res.json(performance || {});
  } catch (error: any) {
    logger.error('Error getting agent performance', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to get agent performance.'
    });
  }
});

/**
 * POST /api/v1/collaboration/agents/:id/recalculate-reputation
 * Manually trigger reputation recalculation for an agent
 */
router.post('/agents/:id/recalculate-reputation', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const agent = await getAgentProfile(id);
    if (!agent || agent.user_id !== user.id) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found.'
      });
      return;
    }

    const newReputation = await updateAgentReputation(id);

    res.json({
      agent_id: id,
      reputation_score: newReputation
    });
  } catch (error: any) {
    logger.error('Error recalculating reputation', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to recalculate reputation.'
    });
  }
});

/**
 * POST /api/v1/collaboration/contribute
 * Agent contributes a memory
 */
router.post('/contribute', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const contributionData = req.body;

    if (!contributionData.agent_id || !contributionData.text) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Fields "agent_id" and "text" are required.'
      });
      return;
    }

    const result = await agentContributeMemory(user.id, contributionData);

    res.status(201).json(result);
  } catch (error: any) {
    logger.error('Error contributing memory', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to contribute memory.'
    });
  }
});

/**
 * POST /api/v1/collaboration/synthesize
 * Synthesize knowledge from multiple memories
 */
router.post('/synthesize', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { agent_id, source_memory_ids, synthesis_method, include_relationships } = req.body;

    if (!agent_id || !source_memory_ids || !Array.isArray(source_memory_ids)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Fields "agent_id" and "source_memory_ids" (array) are required.'
      });
      return;
    }

    if (source_memory_ids.length < 2) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'At least 2 source memories are required for synthesis.'
      });
      return;
    }

    const result = await synthesizeKnowledge(user.id, {
      agent_id,
      source_memory_ids,
      synthesis_method,
      include_relationships
    });

    res.status(201).json(result);
  } catch (error: any) {
    logger.error('Error synthesizing knowledge', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to synthesize knowledge.'
    });
  }
});

/**
 * POST /api/v1/collaboration/detect-conflicts
 * Detect conflicts for a specific memory or all user memories
 */
router.post('/detect-conflicts', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { memory_id, conflict_threshold } = req.body;

    if (!memory_id) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Field "memory_id" is required.'
      });
      return;
    }

    const conflicts = await detectConflicts(memory_id, conflict_threshold || 0.7);

    res.json({
      conflicts,
      count: conflicts.length,
      memory_id
    });
  } catch (error: any) {
    logger.error('Error detecting conflicts', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to detect conflicts.'
    });
  }
});

/**
 * GET /api/v1/collaboration/conflicts
 * List unresolved conflicts for the user
 */
router.get('/conflicts', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const conflicts = await listUnresolvedConflicts(user.id);

    res.json({
      conflicts,
      count: conflicts.length
    });
  } catch (error: any) {
    logger.error('Error listing conflicts', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to list conflicts.'
    });
  }
});

/**
 * POST /api/v1/collaboration/conflicts/:id/resolve
 * Resolve a conflict
 */
router.post('/conflicts/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { resolution_strategy, resolved_by } = req.body;

    if (!resolution_strategy) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Field "resolution_strategy" is required (trust_higher_rep, merge, keep_both, manual).'
      });
      return;
    }

    const validStrategies = ['trust_higher_rep', 'merge', 'keep_both', 'manual'];
    if (!validStrategies.includes(resolution_strategy)) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Invalid resolution_strategy. Must be one of: ${validStrategies.join(', ')}`
      });
      return;
    }

    const success = await resolveConflict(id, resolution_strategy, resolved_by || user.id);

    if (success) {
      res.json({
        success: true,
        conflict_id: id,
        resolution_strategy
      });
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to resolve conflict.'
      });
    }
  } catch (error: any) {
    logger.error('Error resolving conflict', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to resolve conflict.'
    });
  }
});

/**
 * POST /api/v1/collaboration/share-learning
 * Transfer learning patterns from one agent to another
 */
router.post('/share-learning', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { source_agent_id, target_agent_id, pattern_types, min_confidence } = req.body;

    if (!source_agent_id || !target_agent_id) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Fields "source_agent_id" and "target_agent_id" are required.'
      });
      return;
    }

    const result = await transferLearning({
      source_agent_id,
      target_agent_id,
      pattern_types,
      min_confidence
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Error transferring learning', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to transfer learning.'
    });
  }
});

/**
 * GET /api/v1/collaboration/dashboard
 * Get collaboration dashboard with system-wide metrics
 */
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const dashboard = await getCollaborationDashboard(user.id);

    res.json(dashboard);
  } catch (error: any) {
    logger.error('Error getting dashboard', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to get collaboration dashboard.'
    });
  }
});

/**
 * POST /api/v1/collaboration/contributions/:id/validate
 * Validate or reject a contribution
 */
router.post('/contributions/:id/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { validation_status, validation_notes } = req.body;

    if (!validation_status) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Field "validation_status" is required (accepted, rejected, disputed).'
      });
      return;
    }

    const validStatuses = ['accepted', 'rejected', 'disputed'];
    if (!validStatuses.includes(validation_status)) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Invalid validation_status. Must be one of: ${validStatuses.join(', ')}`
      });
      return;
    }

    const success = await validateContribution(id, validation_status, validation_notes);

    if (success) {
      res.json({
        success: true,
        contribution_id: id,
        validation_status
      });
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to validate contribution.'
      });
    }
  } catch (error: any) {
    logger.error('Error validating contribution', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to validate contribution.'
    });
  }
});

export default router;

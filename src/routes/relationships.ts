/**
 * Memory Relationships Routes
 *
 * API endpoints for querying and managing memory relationships
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { DBMetricsTracker } from '../utils/metrics.js';
import { checkRelationshipDetectionHealth } from '../services/relationshipDetector.js';

const router = Router();

// All routes require authentication
router.use(authenticateApiKey);

/**
 * GET /api/v1/relationships/memory/:memoryId
 * Get all relationships for a specific memory
 */
router.get('/memory/:memoryId', async (req: Request, res: Response): Promise<void> => {
  const tracker = new DBMetricsTracker('select', 'memory_relationships');

  try {
    const user = req.user!;
    const { memoryId } = req.params;
    const { type, minStrength, limit = '50' } = req.query;

    // Verify memory belongs to user
    const { data: memory, error: memoryError } = await supabase
      .from('memories')
      .select('id')
      .eq('id', memoryId)
      .eq('user_id', user.id)
      .single();

    if (memoryError || !memory) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Memory not found or does not belong to you.',
      });
      tracker.finish(false);
      return;
    }

    // Build query
    let query = supabase
      .from('memory_relationships')
      .select(`
        id,
        memory_id,
        related_memory_id,
        relationship_type,
        strength,
        explanation,
        created_at,
        related_memory:memories!memory_relationships_related_memory_id_fkey(id, text, created_at)
      `)
      .eq('memory_id', memoryId)
      .order('strength', { ascending: false })
      .limit(parseInt(limit as string));

    // Apply filters
    if (type) {
      query = query.eq('relationship_type', type);
    }

    if (minStrength) {
      query = query.gte('strength', parseFloat(minStrength as string));
    }

    const { data, error } = await query;

    if (error) throw error;

    tracker.finish(true);

    res.json({
      memoryId,
      relationships: data || [],
      count: data?.length || 0,
    });
  } catch (error: any) {
    tracker.finish(false);
    logger.error('Error fetching relationships', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to retrieve relationships.',
    });
  }
});

/**
 * GET /api/v1/relationships/graph/:memoryId
 * Get a graph of relationships (memory and its related memories with their relationships)
 */
router.get('/graph/:memoryId', async (req: Request, res: Response): Promise<void> => {
  const tracker = new DBMetricsTracker('select', 'memory_relationships');

  try {
    const user = req.user!;
    const { memoryId } = req.params;
    const { depth = '1', minStrength = '0.6' } = req.query;

    const maxDepth = Math.min(parseInt(depth as string), 3); // Limit depth to prevent huge graphs
    const strengthThreshold = parseFloat(minStrength as string);

    // Verify memory belongs to user
    const { data: memory, error: memoryError } = await supabase
      .from('memories')
      .select('id, text, created_at')
      .eq('id', memoryId)
      .eq('user_id', user.id)
      .single();

    if (memoryError || !memory) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Memory not found or does not belong to you.',
      });
      tracker.finish(false);
      return;
    }

    // Build relationship graph using BFS
    const visited = new Set<string>();
    const nodes: any[] = [memory];
    const edges: any[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: memoryId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;

      if (visited.has(id) || depth >= maxDepth) {
        continue;
      }

      visited.add(id);

      // Get relationships for this memory
      const { data: relationships, error: relError } = await supabase
        .from('memory_relationships')
        .select(`
          id,
          memory_id,
          related_memory_id,
          relationship_type,
          strength,
          explanation,
          related_memory:memories!memory_relationships_related_memory_id_fkey(id, text, created_at)
        `)
        .eq('memory_id', id)
        .gte('strength', strengthThreshold)
        .order('strength', { ascending: false })
        .limit(20);

      if (relError) {
        logger.error('Error fetching relationships in graph', { error: relError });
        continue;
      }

      if (relationships) {
        for (const rel of relationships) {
          edges.push({
            id: rel.id,
            from: rel.memory_id,
            to: rel.related_memory_id,
            type: rel.relationship_type,
            strength: rel.strength,
            explanation: rel.explanation,
          });

          if (!visited.has(rel.related_memory_id) && rel.related_memory) {
            nodes.push(rel.related_memory);
            queue.push({ id: rel.related_memory_id, depth: depth + 1 });
          }
        }
      }
    }

    tracker.finish(true);

    res.json({
      rootMemoryId: memoryId,
      graph: {
        nodes,
        edges,
      },
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        depth: maxDepth,
      },
    });
  } catch (error: any) {
    tracker.finish(false);
    logger.error('Error building relationship graph', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to build relationship graph.',
    });
  }
});

/**
 * GET /api/v1/relationships/types
 * Get relationship statistics by type for the authenticated user
 */
router.get('/types', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    // Get all memory IDs for the user
    const { data: userMemories, error: memoryError } = await supabase
      .from('memories')
      .select('id')
      .eq('user_id', user.id);

    if (memoryError) throw memoryError;

    const memoryIds = (userMemories || []).map((m: any) => m.id);

    if (memoryIds.length === 0) {
      res.json({
        types: {},
        totalRelationships: 0,
      });
      return;
    }

    // Get relationships for user's memories
    const { data: relationships, error: relError } = await supabase
      .from('memory_relationships')
      .select('relationship_type, strength')
      .in('memory_id', memoryIds);

    if (relError) throw relError;

    // Aggregate by type
    const typeStats: Record<string, { count: number; avgStrength: number }> = {};

    for (const rel of relationships || []) {
      if (!typeStats[rel.relationship_type]) {
        typeStats[rel.relationship_type] = { count: 0, avgStrength: 0 };
      }
      typeStats[rel.relationship_type].count++;
      typeStats[rel.relationship_type].avgStrength += rel.strength;
    }

    // Calculate averages
    for (const type in typeStats) {
      typeStats[type].avgStrength =
        typeStats[type].avgStrength / typeStats[type].count;
    }

    res.json({
      types: typeStats,
      totalRelationships: relationships?.length || 0,
    });
  } catch (error: any) {
    logger.error('Error fetching relationship types', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to retrieve relationship types.',
    });
  }
});

/**
 * DELETE /api/v1/relationships/:relationshipId
 * Delete a specific relationship
 */
router.delete('/:relationshipId', async (req: Request, res: Response): Promise<void> => {
  const tracker = new DBMetricsTracker('delete', 'memory_relationships');

  try {
    const user = req.user!;
    const { relationshipId } = req.params;

    // Verify the relationship belongs to a memory owned by the user
    const { data: relationship, error: fetchError } = await supabase
      .from('memory_relationships')
      .select(`
        id,
        memory_id,
        memories!memory_relationships_memory_id_fkey(user_id)
      `)
      .eq('id', relationshipId)
      .single();

    if (fetchError || !relationship) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Relationship not found.',
      });
      tracker.finish(false);
      return;
    }

    // Check ownership
    const memoryData = relationship.memories as any;
    if (memoryData.user_id !== user.id) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to delete this relationship.',
      });
      tracker.finish(false);
      return;
    }

    // Delete the relationship
    const { error: deleteError } = await supabase
      .from('memory_relationships')
      .delete()
      .eq('id', relationshipId);

    if (deleteError) throw deleteError;

    tracker.finish(true);

    res.json({
      message: 'Relationship deleted successfully.',
      id: relationshipId,
    });
  } catch (error: any) {
    tracker.finish(false);
    logger.error('Error deleting relationship', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to delete relationship.',
    });
  }
});

/**
 * GET /api/v1/relationships/health
 * Check the health of the relationship detection service
 */
router.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const health = await checkRelationshipDetectionHealth();

    const statusCode = health.healthy ? 200 : 503;

    res.status(statusCode).json({
      service: 'relationship-detection',
      ...health,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error checking relationship health', { error: error.message });
    res.status(500).json({
      service: 'relationship-detection',
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

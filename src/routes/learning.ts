/**
 * Learning & Metacognition Routes
 *
 * Endpoints for triggering and monitoring self-learning analysis
 */

import { Router, Request, Response } from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import { analyzeUsagePatterns, runLearningCycle, applyRelationshipSuggestions } from '../services/learningAnalyzer.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All routes require authentication
router.use(authenticateApiKey);

/**
 * POST /api/v1/learning/analyze
 * Trigger on-demand learning analysis
 */
router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  try {
    const { auto_apply = false } = req.body;

    logger.info(`Learning analysis triggered by user ${req.user?.id}`);

    const result = await runLearningCycle(auto_apply);

    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    logger.error('Learning analysis failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to run learning analysis.'
    });
  }
});

/**
 * POST /api/v1/learning/apply-suggestions
 * Apply relationship suggestions from a previous analysis
 */
router.post('/apply-suggestions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { suggestions, min_confidence = 0.75 } = req.body;

    if (!Array.isArray(suggestions)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Field "suggestions" must be an array.'
      });
      return;
    }

    const appliedCount = await applyRelationshipSuggestions(suggestions, min_confidence);

    res.json({
      success: true,
      applied_count: appliedCount,
      total_suggestions: suggestions.length
    });
  } catch (error: any) {
    logger.error('Failed to apply suggestions:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to apply suggestions.'
    });
  }
});

/**
 * GET /api/v1/learning/status
 * Get status of the learning system
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    // This could be enhanced with a job queue status, last run time, etc.
    res.json({
      enabled: true,
      last_run: null, // Would come from a job tracker
      next_scheduled_run: null,
      status: 'available'
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to get status.'
    });
  }
});

/**
 * GET /api/v1/learning/maintenance-suggestions
 * PHASE 2: Proactive maintenance suggestions
 * Identifies duplicates, outdated info, and candidates for archiving
 */
router.get('/maintenance-suggestions', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { supabase } = await import('../config/supabase.js');

    // 1. Find duplicate or near-duplicate memories
    const { data: userMemories } = await supabase
      .from('memories')
      .select('id, text, user_id, helpfulness_score')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500); // Analyze recent memories

    const duplicates: any[] = [];
    const memories = userMemories || [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const mem1 = memories[i];
        const mem2 = memories[j];

        // Simple Jaccard similarity
        const words1 = new Set(mem1.text.toLowerCase().split(/\s+/));
        const words2 = new Set(mem2.text.toLowerCase().split(/\s+/));
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        const similarity = intersection.size / union.size;

        if (similarity >= 0.85) {
          duplicates.push({
            memory_ids: [mem1.id, mem2.id],
            similarity: Math.round(similarity * 100) / 100,
            suggestion: similarity > 0.95 ? 'merge' : 'review',
            texts: [
              mem1.text.substring(0, 100),
              mem2.text.substring(0, 100)
            ]
          });
        }
      }
    }

    // 2. Find outdated memories (low helpfulness, not accessed in 90+ days)
    const { data: outdated } = await supabase
      .from('memory_analytics')
      .select('id, text, helpfulness_score, days_since_access, usage_count')
      .eq('user_id', user.id)
      .lte('helpfulness_score', 0.3)
      .gte('days_since_access', 90)
      .order('days_since_access', { ascending: false })
      .limit(20);

    // 3. Find archive candidates (never used, > 180 days old)
    const { data: archiveCandidates } = await supabase
      .from('memory_analytics')
      .select('id, text, days_since_access, usage_count, created_at')
      .eq('user_id', user.id)
      .eq('usage_count', 0)
      .gte('days_since_access', 180)
      .order('days_since_access', { ascending: false })
      .limit(20);

    // 4. Find memories with broken relationships (referenced memory deleted)
    const { data: allRelationships } = await supabase
      .from('memory_relationships')
      .select('id, memory_id, related_memory_id')
      .or(`memory_id.in.(${memories.map(m => m.id).join(',')}),related_memory_id.in.(${memories.map(m => m.id).join(',')})`);

    const memoryIds = new Set(memories.map(m => m.id));
    const brokenRelationships = (allRelationships || []).filter((rel: any) =>
      !memoryIds.has(rel.memory_id) || !memoryIds.has(rel.related_memory_id)
    );

    res.json({
      duplicates: duplicates.slice(0, 10),
      outdated: (outdated || []).map((m: any) => ({
        id: m.id,
        text: m.text?.substring(0, 100) + '...',
        helpfulness_score: m.helpfulness_score,
        days_since_access: m.days_since_access,
        suggestion: 'update_or_remove'
      })),
      archive_candidates: (archiveCandidates || []).map((m: any) => ({
        id: m.id,
        text: m.text?.substring(0, 100) + '...',
        days_since_access: m.days_since_access,
        usage_count: m.usage_count,
        suggestion: 'archive'
      })),
      broken_relationships: brokenRelationships.length,
      summary: {
        total_duplicates: duplicates.length,
        total_outdated: (outdated || []).length,
        total_archive_candidates: (archiveCandidates || []).length,
        total_broken_relationships: brokenRelationships.length
      }
    });
  } catch (error: any) {
    logger.error('Error generating maintenance suggestions:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to generate maintenance suggestions.'
    });
  }
});

/**
 * GET /api/v1/learning/metrics
 * PHASE 2: Learning velocity tracking
 * Returns time-series data showing system improvement
 */
router.get('/metrics', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { supabase } = await import('../config/supabase.js');
    const { days = 30, metric_type } = req.query;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(String(days)));

    // Build query
    let query = supabase
      .from('learning_metrics')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', cutoffDate.toISOString())
      .order('recorded_at', { ascending: true });

    if (metric_type) {
      query = query.eq('metric_type', metric_type);
    }

    const { data: metrics, error } = await query;

    if (error) throw error;

    // Calculate current user stats for comparison
    const { data: currentStats } = await supabase
      .from('memory_analytics')
      .select('helpfulness_score, usage_count, access_frequency')
      .eq('user_id', user.id);

    const avgHelpfulness = currentStats && currentStats.length > 0
      ? currentStats.reduce((sum: number, m: any) => sum + (m.helpfulness_score || 0.5), 0) / currentStats.length
      : 0.5;

    const totalUsage = currentStats
      ? currentStats.reduce((sum: number, m: any) => sum + (m.usage_count || 0), 0)
      : 0;

    // Get user's learning params
    const { data: learningParams } = await supabase
      .from('user_learning_params')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Get temporal patterns count
    const { data: patterns, count: patternsCount } = await supabase
      .from('temporal_patterns')
      .select('id', { count: 'exact' })
      .eq('user_id', user.id)
      .gte('last_seen', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Group metrics by type for trending
    const metricsByType = new Map<string, any[]>();
    (metrics || []).forEach((metric: any) => {
      if (!metricsByType.has(metric.metric_type)) {
        metricsByType.set(metric.metric_type, []);
      }
      metricsByType.get(metric.metric_type)!.push({
        value: metric.metric_value,
        recorded_at: metric.recorded_at
      });
    });

    // Calculate trends (improvement over time)
    const trends: Record<string, any> = {};
    metricsByType.forEach((values, type) => {
      if (values.length >= 2) {
        const firstValue = values[0].value;
        const lastValue = values[values.length - 1].value;
        const change = lastValue - firstValue;
        const percentChange = firstValue !== 0 ? (change / firstValue) * 100 : 0;

        trends[type] = {
          first_value: firstValue,
          last_value: lastValue,
          change: Math.round(change * 1000) / 1000,
          percent_change: Math.round(percentChange * 10) / 10,
          trend: change > 0 ? 'improving' : change < 0 ? 'declining' : 'stable',
          data_points: values.length
        };
      }
    });

    res.json({
      time_series: Array.from(metricsByType.entries()).map(([type, values]) => ({
        metric_type: type,
        data: values
      })),
      trends,
      current_stats: {
        avg_helpfulness: Math.round(avgHelpfulness * 100) / 100,
        total_usage: totalUsage,
        active_memories: currentStats?.filter((m: any) => m.access_frequency !== 'unused').length || 0,
        total_memories: currentStats?.length || 0
      },
      learning_params: learningParams || null,
      active_patterns: patternsCount || 0,
      time_range: {
        days: parseInt(String(days)),
        from: cutoffDate.toISOString(),
        to: new Date().toISOString()
      }
    });
  } catch (error: any) {
    logger.error('Error retrieving learning metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to retrieve learning metrics.'
    });
  }
});

/**
 * POST /api/v1/learning/analyze-enhanced
 * PHASE 2: Run enhanced learning cycle with temporal patterns
 */
router.post('/analyze-enhanced', async (req: Request, res: Response): Promise<void> => {
  try {
    const { auto_apply = false } = req.body;
    const { runEnhancedLearningCycle } = await import('../services/learningAnalyzer.js');

    logger.info(`Enhanced learning analysis triggered by user ${req.user?.id}`);

    const result = await runEnhancedLearningCycle(auto_apply);

    res.json({
      success: true,
      result
    });
  } catch (error: any) {
    logger.error('Enhanced learning analysis failed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to run enhanced learning analysis.'
    });
  }
});

export default router;

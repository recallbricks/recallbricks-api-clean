/**
 * Learning Scheduler
 *
 * Runs periodic learning analysis jobs
 */

import { runLearningCycle } from './learningAnalyzer.js';
import { logger } from '../utils/logger.js';

// Store interval ID for cleanup
let schedulerInterval: NodeJS.Timeout | null = null;

// Track last run time
let lastRunTime: Date | null = null;
let isRunning: boolean = false;

/**
 * Start the learning scheduler
 * @param intervalHours How often to run the analysis (in hours)
 * @param autoApply Whether to automatically apply high-confidence suggestions
 */
export function startLearningScheduler(
  intervalHours: number = 1,
  autoApply: boolean = false
): void {
  if (schedulerInterval) {
    logger.warn('Learning scheduler already running');
    return;
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;

  logger.info(`Starting learning scheduler (runs every ${intervalHours} hours, auto-apply: ${autoApply})`);

  // Run immediately on start
  runScheduledAnalysis(autoApply);

  // Schedule recurring runs
  schedulerInterval = setInterval(() => {
    runScheduledAnalysis(autoApply);
  }, intervalMs);
}

/**
 * Stop the learning scheduler
 */
export function stopLearningScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Learning scheduler stopped');
  }
}

/**
 * Run a scheduled analysis job
 */
async function runScheduledAnalysis(autoApply: boolean): Promise<void> {
  if (isRunning) {
    logger.warn('Learning analysis already in progress, skipping this cycle');
    return;
  }

  try {
    isRunning = true;
    logger.info('Starting scheduled learning analysis...');

    const result = await runLearningCycle(autoApply);

    lastRunTime = new Date();

    logger.info('Scheduled learning analysis completed:', {
      clusters: result.clusters_detected,
      suggestions: result.relationship_suggestions.length,
      stale_memories: result.stale_memory_count,
      duration_ms: result.processing_time_ms
    });

  } catch (error: any) {
    logger.error('Scheduled learning analysis failed:', { error: error?.message || String(error) });
  } finally {
    isRunning = false;
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  running: boolean;
  last_run: Date | null;
  is_analyzing: boolean;
} {
  return {
    running: schedulerInterval !== null,
    last_run: lastRunTime,
    is_analyzing: isRunning
  };
}

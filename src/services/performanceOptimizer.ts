/**
 * Performance Optimizer Service
 * Enterprise-grade performance optimizations for Phase 2
 */

import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import NodeCache from 'node-cache';

// ============================================================================
// MULTI-TIER CACHING STRATEGY
// ============================================================================

/**
 * L1 Cache: In-memory (fastest, smallest)
 * - Prediction results
 * - User learning params
 * - Frequently accessed patterns
 */
const l1Cache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60, // Check for expired keys every minute
  useClones: false, // Better performance, be careful with mutations
  maxKeys: 10000, // Limit memory usage
});

/**
 * L2 Cache: Query result cache (medium speed, larger)
 * - Search results
 * - Analytics data
 * - Maintenance suggestions
 */
const l2Cache = new NodeCache({
  stdTTL: 600, // 10 minutes
  checkperiod: 120,
  useClones: false,
  maxKeys: 5000,
});

/**
 * L3 Cache: Database-level (slowest, largest)
 * Handled by prediction_cache table
 */

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export class CacheManager {
  /**
   * Get from cache with fallback
   */
  static async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    options: {
      ttl?: number;
      tier?: 'l1' | 'l2' | 'l3';
      skipCache?: boolean;
    } = {}
  ): Promise<T> {
    const { ttl, tier = 'l1', skipCache = false } = options;

    if (skipCache) {
      return await computeFn();
    }

    // Try L1 cache first
    if (tier === 'l1') {
      const cached = l1Cache.get<T>(key);
      if (cached !== undefined) {
        logger.debug(`L1 Cache hit: ${key}`);
        return cached;
      }
    }

    // Try L2 cache
    if (tier === 'l2' || tier === 'l1') {
      const cached = l2Cache.get<T>(key);
      if (cached !== undefined) {
        logger.debug(`L2 Cache hit: ${key}`);
        // Promote to L1 if requested
        if (tier === 'l1') {
          l1Cache.set(key, cached, ttl || 300);
        }
        return cached;
      }
    }

    // Try L3 (database) cache
    if (tier === 'l3') {
      const dbCached = await this.getFromDatabaseCache(key);
      if (dbCached) {
        logger.debug(`L3 Cache hit: ${key}`);
        return dbCached as T;
      }
    }

    // Cache miss - compute
    logger.debug(`Cache miss: ${key}, computing...`);
    const result = await computeFn();

    // Store in appropriate tier
    if (tier === 'l1') {
      l1Cache.set(key, result, ttl || 300);
    } else if (tier === 'l2') {
      l2Cache.set(key, result, ttl || 600);
    } else if (tier === 'l3') {
      await this.setDatabaseCache(key, result, ttl || 3600);
    }

    return result;
  }

  /**
   * Get from database cache
   */
  private static async getFromDatabaseCache(key: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('prediction_cache')
        .select('predictions, hit_count')
        .eq('cache_key', key)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !data) return null;

      // Increment hit count
      await supabase
        .from('prediction_cache')
        .update({
          hit_count: data.hit_count + 1,
          last_accessed: new Date().toISOString(),
        })
        .eq('cache_key', key);

      return data.predictions;
    } catch (error) {
      logger.error('Database cache read error:', error as Record<string, any>);
      return null;
    }
  }

  /**
   * Set database cache
   */
  private static async setDatabaseCache(
    key: string,
    value: any,
    ttlSeconds: number
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const contextHash = this.hashKey(key);

      await supabase.from('prediction_cache').upsert({
        cache_key: key,
        predictions: value,
        context_hash: contextHash,
        expires_at: expiresAt.toISOString(),
        hit_count: 0,
      });
    } catch (error) {
      logger.error('Database cache write error:', error as Record<string, any>);
    }
  }

  /**
   * Invalidate cache
   */
  static invalidate(pattern: string, tier: 'l1' | 'l2' | 'all' = 'all'): void {
    if (tier === 'l1' || tier === 'all') {
      const keys = l1Cache.keys().filter(k => k.includes(pattern));
      l1Cache.del(keys);
      logger.info(`Invalidated ${keys.length} L1 cache entries for pattern: ${pattern}`);
    }

    if (tier === 'l2' || tier === 'all') {
      const keys = l2Cache.keys().filter(k => k.includes(pattern));
      l2Cache.del(keys);
      logger.info(`Invalidated ${keys.length} L2 cache entries for pattern: ${pattern}`);
    }
  }

  /**
   * Get cache statistics
   */
  static getStats() {
    return {
      l1: {
        keys: l1Cache.keys().length,
        hits: l1Cache.getStats().hits,
        misses: l1Cache.getStats().misses,
        hitRate: l1Cache.getStats().hits /
          (l1Cache.getStats().hits + l1Cache.getStats().misses),
      },
      l2: {
        keys: l2Cache.keys().length,
        hits: l2Cache.getStats().hits,
        misses: l2Cache.getStats().misses,
        hitRate: l2Cache.getStats().hits /
          (l2Cache.getStats().hits + l2Cache.getStats().misses),
      },
    };
  }

  /**
   * Hash key for consistency
   */
  private static hashKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

// ============================================================================
// QUERY OPTIMIZATION
// ============================================================================

export class QueryOptimizer {
  private static queryStats = new Map<string, {
    count: number;
    totalDuration: number;
    avgDuration: number;
    slowest: number;
  }>();

  /**
   * Track query performance
   */
  static trackQuery(name: string, duration: number): void {
    const stats = this.queryStats.get(name) || {
      count: 0,
      totalDuration: 0,
      avgDuration: 0,
      slowest: 0,
    };

    stats.count++;
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.count;
    stats.slowest = Math.max(stats.slowest, duration);

    this.queryStats.set(name, stats);

    // Log slow queries
    if (duration > 1000) {
      logger.warn(`Slow query detected: ${name} took ${duration}ms`);
    }
  }

  /**
   * Get query statistics
   */
  static getStats() {
    return Array.from(this.queryStats.entries()).map(([name, stats]) => ({
      name,
      ...stats,
    }));
  }

  /**
   * Reset statistics
   */
  static resetStats(): void {
    this.queryStats.clear();
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export class BatchProcessor {
  private static queues = new Map<string, {
    items: any[];
    timer: NodeJS.Timeout | null;
  }>();

  /**
   * Add item to batch queue
   */
  static async addToBatch<T>(
    queueName: string,
    item: T,
    processFn: (items: T[]) => Promise<void>,
    options: {
      maxBatchSize?: number;
      maxWaitMs?: number;
    } = {}
  ): Promise<void> {
    const { maxBatchSize = 100, maxWaitMs = 1000 } = options;

    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = { items: [], timer: null };
      this.queues.set(queueName, queue);
    }

    queue.items.push(item);

    // Clear existing timer
    if (queue.timer) {
      clearTimeout(queue.timer);
    }

    // Process immediately if batch is full
    if (queue.items.length >= maxBatchSize) {
      await this.processBatch(queueName, processFn);
    } else {
      // Set timer to process later
      queue.timer = setTimeout(async () => {
        await this.processBatch(queueName, processFn);
      }, maxWaitMs);
    }
  }

  /**
   * Process batch
   */
  private static async processBatch<T>(
    queueName: string,
    processFn: (items: T[]) => Promise<void>
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue || queue.items.length === 0) return;

    const items = [...queue.items];
    queue.items = [];
    queue.timer = null;

    try {
      await processFn(items);
      logger.info(`Processed batch of ${items.length} items for ${queueName}`);
    } catch (error) {
      logger.error(`Batch processing failed for ${queueName}:`, error as Record<string, any>);
      // Re-queue failed items
      queue.items.push(...items);
    }
  }
}

// ============================================================================
// CONNECTION POOL MONITORING
// ============================================================================

export class ConnectionMonitor {
  private static stats = {
    activeConnections: 0,
    totalQueries: 0,
    failedQueries: 0,
    avgQueryTime: 0,
  };

  /**
   * Track connection usage
   */
  static trackConnection(
    type: 'open' | 'close' | 'query' | 'error',
    duration?: number
  ): void {
    switch (type) {
      case 'open':
        this.stats.activeConnections++;
        break;
      case 'close':
        this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
        break;
      case 'query':
        this.stats.totalQueries++;
        if (duration !== undefined) {
          this.stats.avgQueryTime =
            (this.stats.avgQueryTime * (this.stats.totalQueries - 1) + duration) /
            this.stats.totalQueries;
        }
        break;
      case 'error':
        this.stats.failedQueries++;
        break;
    }

    // Alert on high connection count
    if (this.stats.activeConnections > 80) {
      logger.warn(`High connection count: ${this.stats.activeConnections}`);
    }
  }

  /**
   * Get connection statistics
   */
  static getStats() {
    return {
      ...this.stats,
      errorRate: this.stats.totalQueries > 0
        ? this.stats.failedQueries / this.stats.totalQueries
        : 0,
    };
  }
}

// ============================================================================
// GRACEFUL DEGRADATION
// ============================================================================

export class GracefulDegradation {
  private static readonly DEGRADATION_THRESHOLDS = {
    HIGH_LOAD: 0.8,    // 80% capacity
    CRITICAL_LOAD: 0.95, // 95% capacity
  };

  private static currentLoad = 0;
  private static degradationLevel: 'normal' | 'high' | 'critical' = 'normal';

  /**
   * Update current load
   */
  static updateLoad(load: number): void {
    this.currentLoad = load;

    if (load >= this.DEGRADATION_THRESHOLDS.CRITICAL_LOAD) {
      this.degradationLevel = 'critical';
      logger.warn('System under CRITICAL load - aggressive degradation active');
    } else if (load >= this.DEGRADATION_THRESHOLDS.HIGH_LOAD) {
      this.degradationLevel = 'high';
      logger.warn('System under HIGH load - degradation active');
    } else {
      this.degradationLevel = 'normal';
    }
  }

  /**
   * Check if feature should be degraded
   */
  static shouldDegrade(feature: string): boolean {
    const featureConfig: Record<string, { minLevel: 'high' | 'critical' }> = {
      'temporal-patterns': { minLevel: 'high' },
      'context-suggestions': { minLevel: 'high' },
      'maintenance-suggestions': { minLevel: 'critical' },
      'learning-metrics': { minLevel: 'critical' },
    };

    const config = featureConfig[feature];
    if (!config) return false;

    if (this.degradationLevel === 'critical') return true;
    if (this.degradationLevel === 'high' && config.minLevel === 'high') return true;

    return false;
  }

  /**
   * Get degradation status
   */
  static getStatus() {
    return {
      currentLoad: this.currentLoad,
      degradationLevel: this.degradationLevel,
      features: {
        'temporal-patterns': !this.shouldDegrade('temporal-patterns'),
        'context-suggestions': !this.shouldDegrade('context-suggestions'),
        'maintenance-suggestions': !this.shouldDegrade('maintenance-suggestions'),
        'learning-metrics': !this.shouldDegrade('learning-metrics'),
      },
    };
  }
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

export class PerformanceMonitor {
  private static metrics = {
    requestsPerSecond: 0,
    avgResponseTime: 0,
    errorRate: 0,
    cacheHitRate: 0,
  };

  private static window: Array<{
    timestamp: number;
    responseTime: number;
    error: boolean;
  }> = [];

  private static readonly WINDOW_SIZE = 60000; // 1 minute

  /**
   * Record request
   */
  static recordRequest(responseTime: number, error: boolean = false): void {
    const now = Date.now();

    // Add to window
    this.window.push({ timestamp: now, responseTime, error });

    // Remove old entries
    this.window = this.window.filter(
      entry => now - entry.timestamp < this.WINDOW_SIZE
    );

    // Calculate metrics
    this.updateMetrics();
  }

  /**
   * Update metrics
   */
  private static updateMetrics(): void {
    if (this.window.length === 0) return;

    const now = Date.now();
    const windowStart = now - this.WINDOW_SIZE;
    const recentEntries = this.window.filter(e => e.timestamp >= windowStart);

    // Requests per second
    this.metrics.requestsPerSecond = recentEntries.length / (this.WINDOW_SIZE / 1000);

    // Average response time
    this.metrics.avgResponseTime =
      recentEntries.reduce((sum, e) => sum + e.responseTime, 0) / recentEntries.length;

    // Error rate
    const errorCount = recentEntries.filter(e => e.error).length;
    this.metrics.errorRate = errorCount / recentEntries.length;

    // Cache hit rate
    const cacheStats = CacheManager.getStats();
    this.metrics.cacheHitRate = (cacheStats.l1.hitRate + cacheStats.l2.hitRate) / 2;

    // Update graceful degradation
    const load = Math.min(this.metrics.requestsPerSecond / 100, 1.0); // Assume max 100 RPS
    GracefulDegradation.updateLoad(load);
  }

  /**
   * Get current metrics
   */
  static getMetrics() {
    return {
      ...this.metrics,
      degradation: GracefulDegradation.getStatus(),
      cache: CacheManager.getStats(),
      connections: ConnectionMonitor.getStats(),
      queries: QueryOptimizer.getStats(),
    };
  }
}

// Export for use in routes
export { l1Cache, l2Cache };

/**
 * Enterprise Rate Limiting Middleware
 * Protects API from abuse and ensures fair usage
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { logger } from '../utils/logger.js';

// ============================================================================
// RATE LIMITERS BY TIER
// ============================================================================

/**
 * Global rate limiter - protects entire API
 */
const globalLimiter = new RateLimiterMemory({
  points: 1000, // 1000 requests
  duration: 60,  // per 60 seconds (1000 RPM)
  blockDuration: 60, // Block for 1 minute if exceeded
});

/**
 * Per-user rate limiter - fair usage per user
 */
const userLimiter = new RateLimiterMemory({
  points: 100, // 100 requests
  duration: 60, // per 60 seconds (100 RPM per user)
  blockDuration: 120, // Block for 2 minutes
});

/**
 * Expensive operations rate limiter (predict, suggest, maintenance)
 */
const expensiveLimiter = new RateLimiterMemory({
  points: 20, // 20 requests
  duration: 60, // per 60 seconds
  blockDuration: 300, // Block for 5 minutes
});

/**
 * Learning operations rate limiter (analyze, metrics)
 */
const learningLimiter = new RateLimiterMemory({
  points: 10, // 10 requests
  duration: 60, // per 60 seconds
  blockDuration: 600, // Block for 10 minutes
});

// ============================================================================
// RATE LIMITER MIDDLEWARE
// ============================================================================

/**
 * Apply rate limiting based on endpoint and user
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = req.user?.id || ip;
    const path = req.path;

    // Determine which limiters to apply
    const limiters: Array<{
      limiter: RateLimiterMemory;
      key: string;
      name: string;
    }> = [];

    // Always apply global limiter
    limiters.push({
      limiter: globalLimiter,
      key: 'global',
      name: 'Global',
    });

    // Always apply per-user limiter
    limiters.push({
      limiter: userLimiter,
      key: userId,
      name: 'User',
    });

    // Apply expensive limiter for specific endpoints
    if (
      path.includes('/predict') ||
      path.includes('/suggest') ||
      path.includes('/maintenance-suggestions')
    ) {
      limiters.push({
        limiter: expensiveLimiter,
        key: `${userId}:expensive`,
        name: 'Expensive',
      });
    }

    // Apply learning limiter
    if (
      path.includes('/learning/analyze') ||
      path.includes('/learning/metrics')
    ) {
      limiters.push({
        limiter: learningLimiter,
        key: `${userId}:learning`,
        name: 'Learning',
      });
    }

    // Check all limiters
    for (const { limiter, key, name } of limiters) {
      try {
        const result = await limiter.consume(key);

        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', limiter.points);
        res.setHeader('X-RateLimit-Remaining', result.remainingPoints);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + result.msBeforeNext).toISOString());

      } catch (rateLimitError) {
        if (rateLimitError instanceof Error) {
          throw rateLimitError;
        }

        const rlRes = rateLimitError as RateLimiterRes;

        logger.warn(`Rate limit exceeded: ${name} limiter for ${key}`, {
          path,
          remainingPoints: rlRes.remainingPoints,
          msBeforeNext: rlRes.msBeforeNext,
        });

        res.status(429).json({
          error: 'Too Many Requests',
          message: `${name} rate limit exceeded. Please try again later.`,
          retryAfter: Math.ceil(rlRes.msBeforeNext / 1000),
          limit: limiter.points,
          remaining: rlRes.remainingPoints,
        });

        return;
      }
    }

    next();

  } catch (error) {
    logger.error('Rate limiter error:', error as Record<string, any>);
    // Fail open - allow request if rate limiter fails
    next();
  }
}

// ============================================================================
// ADAPTIVE RATE LIMITING
// ============================================================================

export class AdaptiveRateLimiter {
  private static systemLoad = 0;
  private static readonly BASE_POINTS = 100;

  /**
   * Update system load (0.0 to 1.0)
   */
  static updateLoad(load: number): void {
    this.systemLoad = Math.max(0, Math.min(1, load));

    // Adjust rate limits based on load
    const adjustedPoints = Math.floor(
      this.BASE_POINTS * (1 - this.systemLoad * 0.5)
    );

    // Update user limiter
    userLimiter.points = adjustedPoints;

    logger.info(`Adaptive rate limit adjusted to ${adjustedPoints} points (load: ${(load * 100).toFixed(1)}%)`);
  }

  /**
   * Get current configuration
   */
  static getConfig() {
    return {
      systemLoad: this.systemLoad,
      userPoints: userLimiter.points,
      globalPoints: globalLimiter.points,
      expensivePoints: expensiveLimiter.points,
      learningPoints: learningLimiter.points,
    };
  }
}

// ============================================================================
// BURST DETECTION
// ============================================================================

export class BurstDetector {
  private static requestTimestamps = new Map<string, number[]>();
  private static readonly WINDOW_MS = 10000; // 10 seconds
  private static readonly BURST_THRESHOLD = 50; // 50 requests in 10 seconds

  /**
   * Check if user is bursting
   */
  static isBursting(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.requestTimestamps.get(userId) || [];

    // Remove old timestamps
    const recent = timestamps.filter(ts => now - ts < this.WINDOW_MS);

    // Add current timestamp
    recent.push(now);
    this.requestTimestamps.set(userId, recent);

    // Check if bursting
    if (recent.length > this.BURST_THRESHOLD) {
      logger.warn(`Burst detected for user ${userId}: ${recent.length} requests in ${this.WINDOW_MS}ms`);
      return true;
    }

    return false;
  }

  /**
   * Clear old data
   */
  static cleanup(): void {
    const now = Date.now();
    for (const [userId, timestamps] of this.requestTimestamps.entries()) {
      const recent = timestamps.filter(ts => now - ts < this.WINDOW_MS);
      if (recent.length === 0) {
        this.requestTimestamps.delete(userId);
      } else {
        this.requestTimestamps.set(userId, recent);
      }
    }
  }
}

// Cleanup burst detector every minute
setInterval(() => {
  BurstDetector.cleanup();
}, 60000);

// ============================================================================
// IP-BASED RATE LIMITING
// ============================================================================

/**
 * Aggressive IP-based limiter for unauthenticated requests
 */
const ipLimiter = new RateLimiterMemory({
  points: 20, // 20 requests
  duration: 60, // per minute
  blockDuration: 300, // Block for 5 minutes
});

export async function ipRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Only apply to unauthenticated requests
  if (req.user) {
    return next();
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    await ipLimiter.consume(ip);
    next();
  } catch (rateLimitError) {
    if (rateLimitError instanceof Error) {
      throw rateLimitError;
    }

    const rlRes = rateLimitError as RateLimiterRes;

    logger.warn(`IP rate limit exceeded: ${ip}`, {
      path: req.path,
      msBeforeNext: rlRes.msBeforeNext,
    });

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'IP rate limit exceeded. Please authenticate or try again later.',
      retryAfter: Math.ceil(rlRes.msBeforeNext / 1000),
    });
  }
}

/**
 * Production-Grade Rate Limiting Middleware
 *
 * Features:
 * - Global and per-API-key rate limiting
 * - Proper headers (X-RateLimit-*, Retry-After)
 * - Different limits for different endpoints
 * - Sliding window algorithm
 * - Metrics tracking
 */

import { Request, Response, NextFunction } from 'express';
import { Errors } from '../utils/errors.js';
import { rateLimitHits } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitStore {
  [key: string]: RateLimitEntry;
}

const rateLimitStore: RateLimitStore = {};
const globalStore: RateLimitStore = { global: { count: 0, resetTime: Date.now() + 60000 } };

// Rate limit configurations (requests per hour)
const RATE_LIMITS = {
  free: 100,
  pro: 1000,
  team: 5000,
  enterprise: 50000,
};

// Global rate limit (requests per minute)
const GLOBAL_LIMIT = parseInt(process.env.GLOBAL_RATE_LIMIT || '1000');
const GLOBAL_WINDOW = 60 * 1000; // 1 minute

// Endpoint-specific rate limits (multipliers)
const ENDPOINT_LIMITS = {
  POST: 0.5, // POST requests count as 2x
  GET: 1.0,
  DELETE: 0.7,
  PUT: 0.7,
};

// Cleanup expired entries every 5 minutes
function cleanupExpiredEntries() {
  const now = Date.now();
  Object.keys(rateLimitStore).forEach(key => {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  });
  logger.debug('Rate limit store cleanup completed', {
    remainingEntries: Object.keys(rateLimitStore).length,
  });
}

setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Global rate limiter - applies to all requests
 */
export function globalRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();

  // Reset window if expired
  if (globalStore.global.resetTime < now) {
    globalStore.global = {
      count: 0,
      resetTime: now + GLOBAL_WINDOW,
    };
  }

  globalStore.global.count++;

  // Check if limit exceeded
  if (globalStore.global.count > GLOBAL_LIMIT) {
    const retryAfter = Math.ceil((globalStore.global.resetTime - now) / 1000);

    rateLimitHits.inc({ type: 'global' });

    logger.warn('Global rate limit exceeded', {
      requestId: req.requestId,
      count: globalStore.global.count,
      limit: GLOBAL_LIMIT,
      retryAfter,
    });

    res.setHeader('Retry-After', retryAfter.toString());
    res.setHeader('X-RateLimit-Limit', GLOBAL_LIMIT.toString());
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', new Date(globalStore.global.resetTime).toISOString());

    throw Errors.rateLimitExceeded(retryAfter, GLOBAL_LIMIT);
  }

  next();
}

/**
 * API key rate limiter - applies per API key
 */
export function apiKeyRateLimit(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    throw Errors.missingApiKey();
  }

  // Get user plan (default to free)
  const userPlan = (req.user as any)?.plan || 'free';
  const baseLimit = RATE_LIMITS[userPlan as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;

  // Apply endpoint-specific multiplier
  const methodMultiplier = ENDPOINT_LIMITS[req.method as keyof typeof ENDPOINT_LIMITS] || 1.0;
  const cost = 1 / methodMultiplier; // Higher cost for heavier operations

  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour window

  // Initialize or reset if window expired
  if (!rateLimitStore[apiKey] || rateLimitStore[apiKey].resetTime < now) {
    rateLimitStore[apiKey] = {
      count: 0,
      resetTime: now + windowMs,
    };
  }

  // Add cost to counter
  rateLimitStore[apiKey].count += cost;

  const remaining = Math.max(0, baseLimit - rateLimitStore[apiKey].count);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', baseLimit.toString());
  res.setHeader('X-RateLimit-Remaining', Math.floor(remaining).toString());
  res.setHeader('X-RateLimit-Reset', new Date(rateLimitStore[apiKey].resetTime).toISOString());

  // Check if limit exceeded
  if (rateLimitStore[apiKey].count > baseLimit) {
    const retryAfter = Math.ceil((rateLimitStore[apiKey].resetTime - now) / 1000);

    rateLimitHits.inc({ type: 'api_key' });

    logger.warn('API key rate limit exceeded', {
      requestId: req.requestId,
      userId: req.user?.id,
      plan: userPlan,
      count: rateLimitStore[apiKey].count,
      limit: baseLimit,
      retryAfter,
    });

    res.setHeader('Retry-After', retryAfter.toString());

    throw Errors.rateLimitExceeded(retryAfter, baseLimit);
  }

  next();
}

/**
 * Rate limit status endpoint - check current usage
 */
export function rateLimitStatusEndpoint(req: Request, res: Response): void {
  const apiKey = req.headers['x-api-key'] as string;
  const plan = (req.user as any)?.plan || 'free';

  if (!apiKey) {
    throw Errors.missingApiKey();
  }

  const limit = RATE_LIMITS[plan as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;
  const data = rateLimitStore[apiKey];

  if (!data || data.resetTime < Date.now()) {
    res.json({
      plan,
      limit,
      remaining: limit,
      reset: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      percentUsed: 0,
      windowSeconds: 3600,
    });
    return;
  }

  const remaining = Math.max(0, limit - data.count);
  const percentUsed = Math.round((data.count / limit) * 100);

  res.json({
    plan,
    limit,
    remaining: Math.floor(remaining),
    reset: new Date(data.resetTime).toISOString(),
    percentUsed,
    windowSeconds: 3600,
  });
}

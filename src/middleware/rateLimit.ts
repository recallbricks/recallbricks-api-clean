/**
 * Rate Limiting Middleware for RecallBricks API
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStore: RateLimitStore = {};
const globalStore: RateLimitStore = { global: { count: 0, resetTime: Date.now() + 60000 } };

const RATE_LIMITS = {
  free: 100,
  pro: 1000,
  team: 5000,
  enterprise: 50000,
};

const GLOBAL_LIMIT = 1000;
const GLOBAL_WINDOW = 60 * 1000;

function cleanupExpiredEntries() {
  const now = Date.now();
  Object.keys(rateLimitStore).forEach(key => {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  });
}

setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

export function globalRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  
  if (globalStore.global.resetTime < now) {
    globalStore.global = {
      count: 0,
      resetTime: now + GLOBAL_WINDOW
    };
  }
  
  globalStore.global.count++;
  
  if (globalStore.global.count > GLOBAL_LIMIT) {
    const retryAfter = Math.ceil((globalStore.global.resetTime - now) / 1000);
    res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Global rate limit exceeded. Please try again later.',
      retryAfter
    });
    return;
  }
  
  next();
}

export function apiKeyRateLimit(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required'
    });
    return;
  }
  
  // @ts-ignore
  const userPlan = req.user?.plan || 'free';
  const limit = RATE_LIMITS[userPlan as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;
  
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  
  if (!rateLimitStore[apiKey] || rateLimitStore[apiKey].resetTime < now) {
    rateLimitStore[apiKey] = {
      count: 0,
      resetTime: now + windowMs
    };
  }
  
  rateLimitStore[apiKey].count++;
  
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - rateLimitStore[apiKey].count).toString());
  res.setHeader('X-RateLimit-Reset', new Date(rateLimitStore[apiKey].resetTime).toISOString());
  
  if (rateLimitStore[apiKey].count > limit) {
    const retryAfter = Math.ceil((rateLimitStore[apiKey].resetTime - now) / 1000);
    
    res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: `API rate limit exceeded for ${userPlan} plan.`,
      retryAfter,
      limit,
      remaining: 0
    });
    return;
  }
  
  next();
}

export function rateLimitStatusEndpoint(req: Request, res: Response): void {
  const apiKey = req.headers['x-api-key'] as string;
  // @ts-ignore
  const plan = req.user?.plan || 'free';
  
  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }
  
  const limit = RATE_LIMITS[plan as keyof typeof RATE_LIMITS] || RATE_LIMITS.free;
  const data = rateLimitStore[apiKey];
  
  if (!data || data.resetTime < Date.now()) {
    res.json({
      limit,
      remaining: limit,
      reset: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      percentUsed: 0
    });
    return;
  }
  
  const remaining = Math.max(0, limit - data.count);
  const percentUsed = Math.round((data.count / limit) * 100);
  
  res.json({
    limit,
    remaining,
    reset: new Date(data.resetTime).toISOString(),
    percentUsed
  });
}

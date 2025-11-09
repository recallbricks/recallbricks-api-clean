import { Request, Response, NextFunction } from 'express';
import { Errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedKey = process.env.API_KEY;

  logger.debug('API key authentication attempt', {
    requestId: req.requestId,
    hasApiKey: !!apiKey,
    keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING',
  });

  if (!apiKey) {
    throw Errors.missingApiKey();
  }

  if (apiKey !== expectedKey) {
    logger.warn('Invalid API key attempt', {
      requestId: req.requestId,
      keyPrefix: apiKey.substring(0, 10) + '...',
    });
    throw Errors.invalidApiKey();
  }

  // Create a mock user for now
  // In production, this would look up the user in the database
  req.user = {
    id: '00000000-0000-0000-0000-000000000001',
    api_key: apiKey,
  } as any;

  logger.debug('API key authentication successful', {
    requestId: req.requestId,
    userId: req.user?.id,
  });

  next();
}

export default authenticateApiKey;

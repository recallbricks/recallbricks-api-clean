import { Request, Response, NextFunction } from 'express';

export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    const expectedKey = process.env.API_KEY;

    console.log('Auth attempt with key:', apiKey ? apiKey.substring(0, 20) + '...' : 'MISSING');
    console.log('Expected key:', expectedKey ? expectedKey.substring(0, 20) + '...' : 'MISSING');

    if (!apiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key is required. Provide it in the X-API-Key header.'
      });
      return;
    }

    if (apiKey !== expectedKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key.'
      });
      return;
    }

    // Create a mock user for now
    req.user = {
      id: '00000000-0000-0000-0000-000000000001',
      api_key: apiKey
    } as any;

    console.log('Auth successful');
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed.'
    });
  }
}

export default authenticateApiKey;// Force rebuild

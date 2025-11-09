/**
 * Request Validation Middleware
 *
 * Validates incoming requests before they reach route handlers
 */

import { Request, Response, NextFunction } from 'express';
import { Errors } from '../utils/errors.js';

const MAX_TEXT_LENGTH = parseInt(process.env.MAX_MEMORY_TEXT_LENGTH || '10000');
const MAX_QUERY_LENGTH = 500;

export function validateMemoryCreation(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { text } = req.body;

  if (!text) {
    throw Errors.validationError('Text is required', { field: 'text' });
  }

  if (typeof text !== 'string') {
    throw Errors.validationError('Text must be a string', { field: 'text', type: typeof text });
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw Errors.validationError('Text cannot be empty', { field: 'text' });
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw Errors.textTooLong(MAX_TEXT_LENGTH, trimmed.length);
  }

  // Validate optional fields
  if (req.body.tags && !Array.isArray(req.body.tags)) {
    throw Errors.validationError('Tags must be an array', { field: 'tags' });
  }

  if (req.body.metadata && typeof req.body.metadata !== 'object') {
    throw Errors.validationError('Metadata must be an object', { field: 'metadata' });
  }

  next();
}

export function validateMemoryQuery(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { limit, offset } = req.query;

  if (limit) {
    const numLimit = parseInt(limit as string);
    if (isNaN(numLimit) || numLimit < 1 || numLimit > 100) {
      throw Errors.validationError('Limit must be between 1 and 100', {
        field: 'limit',
        value: limit,
      });
    }
  }

  if (offset) {
    const numOffset = parseInt(offset as string);
    if (isNaN(numOffset) || numOffset < 0) {
      throw Errors.validationError('Offset must be a non-negative number', {
        field: 'offset',
        value: offset,
      });
    }
  }

  next();
}

export function validateSearch(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const query = req.method === 'GET' ? req.query.q : req.body.query;

  if (!query) {
    throw Errors.validationError('Query is required', {
      field: req.method === 'GET' ? 'q' : 'query',
    });
  }

  if (typeof query !== 'string') {
    throw Errors.validationError('Query must be a string', {
      field: req.method === 'GET' ? 'q' : 'query',
      type: typeof query,
    });
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw Errors.validationError('Query cannot be empty', {
      field: req.method === 'GET' ? 'q' : 'query',
    });
  }

  if (trimmed.length > MAX_QUERY_LENGTH) {
    throw Errors.validationError(
      `Query too long (max ${MAX_QUERY_LENGTH} characters)`,
      {
        field: req.method === 'GET' ? 'q' : 'query',
        maxLength: MAX_QUERY_LENGTH,
        actualLength: trimmed.length,
      }
    );
  }

  next();
}

export function validateContextRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { query, limit, conversation_history } = req.body;

  if (!query) {
    throw Errors.validationError('Query is required', { field: 'query' });
  }

  if (typeof query !== 'string' || query.trim().length === 0) {
    throw Errors.validationError('Query must be a non-empty string', { field: 'query' });
  }

  if (limit !== undefined) {
    const numLimit = Number(limit);
    if (isNaN(numLimit) || numLimit < 1 || numLimit > 100) {
      throw Errors.validationError('Limit must be between 1 and 100', {
        field: 'limit',
        value: limit,
      });
    }
  }

  if (conversation_history !== undefined && !Array.isArray(conversation_history)) {
    throw Errors.validationError('Conversation history must be an array', {
      field: 'conversation_history',
    });
  }

  next();
}

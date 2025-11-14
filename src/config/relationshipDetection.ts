/**
 * Relationship Detection Configuration
 *
 * Enterprise-grade configuration for Claude-powered relationship detection
 */

export interface RelationshipDetectionConfig {
  // Claude API Configuration
  claudeApiKey: string;
  claudeModel: string;
  maxTokens: number;
  temperature: number;
  requestTimeout: number;

  // Detection Parameters
  recentMemoriesLimit: number;
  minStrength: number;
  maxRelationships: number;
  explanationMaxLength: number;

  // Retry Configuration
  maxRetries: number;
  retryBaseDelay: number;
  retryMaxDelay: number;
  retryExponent: number;

  // Circuit Breaker
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;

  // Feature Flags
  enabled: boolean;
  asyncExecution: boolean;
  storeInDatabase: boolean;
}

/**
 * Load configuration from environment variables with secure defaults
 */
export function loadRelationshipConfig(): RelationshipDetectionConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';

  if (!apiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set - relationship detection will be disabled');
  }

  return {
    // Claude API Configuration
    claudeApiKey: apiKey,
    claudeModel: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '2048'),
    temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.3'),
    requestTimeout: parseInt(process.env.CLAUDE_TIMEOUT || '30000'),

    // Detection Parameters
    recentMemoriesLimit: parseInt(process.env.RELATIONSHIP_MEMORY_LIMIT || '50'),
    minStrength: parseFloat(process.env.RELATIONSHIP_MIN_STRENGTH || '0.6'),
    maxRelationships: parseInt(process.env.RELATIONSHIP_MAX_COUNT || '10'),
    explanationMaxLength: parseInt(process.env.RELATIONSHIP_EXPLANATION_MAX || '200'),

    // Retry Configuration
    maxRetries: parseInt(process.env.RELATIONSHIP_MAX_RETRIES || '3'),
    retryBaseDelay: parseInt(process.env.RELATIONSHIP_RETRY_BASE_DELAY || '1000'),
    retryMaxDelay: parseInt(process.env.RELATIONSHIP_RETRY_MAX_DELAY || '10000'),
    retryExponent: parseFloat(process.env.RELATIONSHIP_RETRY_EXPONENT || '2'),

    // Circuit Breaker
    circuitBreakerThreshold: parseInt(process.env.RELATIONSHIP_CB_THRESHOLD || '5'),
    circuitBreakerTimeout: parseInt(process.env.RELATIONSHIP_CB_TIMEOUT || '60000'),

    // Feature Flags
    enabled: process.env.RELATIONSHIP_DETECTION_ENABLED !== 'false' && !!apiKey,
    asyncExecution: process.env.RELATIONSHIP_ASYNC !== 'false',
    storeInDatabase: process.env.RELATIONSHIP_STORE_DB !== 'false',
  };
}

export const relationshipConfig = loadRelationshipConfig();

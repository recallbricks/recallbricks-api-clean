/**
 * Circuit Breaker Pattern
 * Prevents cascading failures and provides resilience
 */

import { logger } from '../utils/logger.js';

// ============================================================================
// CIRCUIT BREAKER STATES
// ============================================================================

enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing - reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing - allow limited requests
}

// ============================================================================
// CIRCUIT BREAKER CLASS
// ============================================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private nextAttemptTime: number = 0;

  constructor(
    private readonly name: string,
    private readonly options: {
      failureThreshold: number;    // Number of failures before opening
      successThreshold: number;    // Number of successes to close from half-open
      timeout: number;             // Time in ms to wait before half-open
      monitoringPeriod: number;    // Time window for counting failures
    }
  ) {}

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitBreakerOpenError(
          `Circuit breaker '${this.name}' is OPEN. Retry after ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }

      // Transition to half-open
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info(`Circuit breaker '${this.name}' transitioning to HALF_OPEN`);
    }

    try {
      // Execute function
      const result = await fn();

      // Record success
      this.onSuccess();

      return result;
    } catch (error) {
      // Record failure
      this.onFailure();

      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // If enough successes, close the circuit
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logger.info(`Circuit breaker '${this.name}' closed after ${this.options.successThreshold} successes`);
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // If in half-open, immediately reopen
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.timeout;
      logger.warn(`Circuit breaker '${this.name}' reopened from HALF_OPEN`);
      return;
    }

    // If threshold exceeded, open circuit
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.timeout;
      logger.error(`Circuit breaker '${this.name}' opened after ${this.failureCount} failures`);
    }
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.state === CircuitState.OPEN ? this.nextAttemptTime : null,
    };
  }

  /**
   * Force reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = 0;
    logger.info(`Circuit breaker '${this.name}' manually reset`);
  }
}

// ============================================================================
// CIRCUIT BREAKER ERROR
// ============================================================================

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============================================================================
// CIRCUIT BREAKER REGISTRY
// ============================================================================

export class CircuitBreakerRegistry {
  private static breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create circuit breaker
   */
  static get(
    name: string,
    options?: {
      failureThreshold?: number;
      successThreshold?: number;
      timeout?: number;
      monitoringPeriod?: number;
    }
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const defaultOptions = {
        failureThreshold: 5,      // 5 failures
        successThreshold: 3,      // 3 successes
        timeout: 60000,           // 1 minute
        monitoringPeriod: 120000, // 2 minutes
      };

      this.breakers.set(
        name,
        new CircuitBreaker(name, { ...defaultOptions, ...options })
      );
    }

    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breakers status
   */
  static getAllStatus() {
    return Array.from(this.breakers.values()).map(breaker =>
      breaker.getStatus()
    );
  }

  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }
}

// ============================================================================
// PREDEFINED CIRCUIT BREAKERS
// ============================================================================

/**
 * Database circuit breaker
 */
export const dbCircuitBreaker = CircuitBreakerRegistry.get('database', {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000, // 30 seconds
  monitoringPeriod: 60000,
});

/**
 * OpenAI API circuit breaker
 */
export const openaiCircuitBreaker = CircuitBreakerRegistry.get('openai', {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  monitoringPeriod: 120000,
});

/**
 * External service circuit breaker
 */
export const externalServiceCircuitBreaker = CircuitBreakerRegistry.get('external-service', {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 120000, // 2 minutes
  monitoringPeriod: 300000,
});

// ============================================================================
// RETRY WITH EXPONENTIAL BACKOFF
// ============================================================================

export class RetryStrategy {
  /**
   * Execute with retry and exponential backoff
   */
  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffMultiplier?: number;
      retryOn?: (error: any) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffMultiplier = 2,
      retryOn = () => true,
    } = options;

    let lastError: any;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Check if we should retry
        if (attempt === maxRetries || !retryOn(error)) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const currentDelay = Math.min(delay * Math.pow(backoffMultiplier, attempt), maxDelay);

        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${currentDelay}ms`, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Wait before retry
        await this.sleep(currentDelay);
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// BULKHEAD PATTERN
// ============================================================================

export class Bulkhead {
  private activeRequests = 0;
  private queue: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
    fn: () => Promise<any>;
  }> = [];

  constructor(
    private readonly name: string,
    private readonly maxConcurrent: number,
    private readonly maxQueue: number = 100
  ) {}

  /**
   * Execute function with bulkhead protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If under limit, execute immediately
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++;
      try {
        return await fn();
      } finally {
        this.activeRequests--;
        this.processQueue();
      }
    }

    // Queue the request
    if (this.queue.length >= this.maxQueue) {
      throw new Error(`Bulkhead '${this.name}' queue is full (${this.maxQueue})`);
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ resolve, reject, fn });
    });
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    if (this.queue.length === 0 || this.activeRequests >= this.maxConcurrent) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeRequests++;

    item.fn()
      .then(result => {
        item.resolve(result);
      })
      .catch(error => {
        item.reject(error);
      })
      .finally(() => {
        this.activeRequests--;
        this.processQueue();
      });
  }

  /**
   * Get bulkhead status
   */
  getStatus() {
    return {
      name: this.name,
      activeRequests: this.activeRequests,
      queuedRequests: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue,
      utilizationPercent: (this.activeRequests / this.maxConcurrent) * 100,
    };
  }
}

// ============================================================================
// PREDEFINED BULKHEADS
// ============================================================================

/**
 * Database query bulkhead
 */
export const dbBulkhead = new Bulkhead('database', 50, 200);

/**
 * External API bulkhead
 */
export const apiBulkhead = new Bulkhead('api', 10, 50);

/**
 * Heavy computation bulkhead
 */
export const computeBulkhead = new Bulkhead('compute', 5, 20);

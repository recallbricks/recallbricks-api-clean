/**
 * Circuit Breaker Pattern
 *
 * Protects database connections from cascading failures
 * Based on the MCP implementation
 */

import { logger } from './logger.js';
import { Errors } from './errors.js';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  successCount: number;
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: CircuitState = CircuitState.CLOSED;
  private successCount = 0;

  constructor(
    private threshold: number = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5'),
    private timeout: number = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000')
  ) {
    logger.info('Circuit breaker initialized', {
      threshold: this.threshold,
      timeout: this.timeout,
    });
  }

  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        logger.warn('Circuit breaker entering HALF_OPEN state', { context });
      } else {
        logger.error('Circuit breaker is OPEN - rejecting request', {
          context,
          timeSinceFailure: Date.now() - this.lastFailureTime,
          timeout: this.timeout,
        });
        throw Errors.circuitBreakerOpen();
      }
    }

    try {
      const result = await fn();
      this.onSuccess(context);
      return result;
    } catch (error) {
      this.onFailure(context);
      throw error;
    }
  }

  private onSuccess(context?: string) {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        logger.info('Circuit breaker CLOSED - service recovered', { context });
      }
    } else {
      this.failures = 0;
      this.state = CircuitState.CLOSED;
    }
  }

  private onFailure(context?: string) {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      logger.error('Circuit breaker reopened in HALF_OPEN state', {
        context,
        failures: this.failures,
      });
    } else if (this.failures >= this.threshold) {
      this.state = CircuitState.OPEN;
      logger.error(`Circuit breaker OPEN after ${this.failures} consecutive failures`, {
        context,
        threshold: this.threshold,
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    logger.info('Circuit breaker reset');
  }
}

// Global circuit breaker instance for database operations
export const dbCircuitBreaker = new CircuitBreaker();

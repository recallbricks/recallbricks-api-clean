/**
 * Supabase Configuration with Circuit Breaker
 *
 * Production-grade Supabase client with:
 * - Circuit breaker protection
 * - Connection pooling
 * - Graceful degradation
 * - Performance monitoring
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dbCircuitBreaker } from '../utils/circuitBreaker.js';
import { logger } from '../utils/logger.js';
import { DBMetricsTracker, dbConnectionsActive } from '../utils/metrics.js';
import { Errors } from '../utils/errors.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

logger.info('Initializing Supabase configuration', {
  url: supabaseUrl || 'MISSING',
  keyLength: supabaseServiceKey?.length || 0,
});

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('Missing Supabase configuration', {
    availableEnvVars: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
  });
  throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Create Supabase client with service role (admin) access
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-client-info': 'recallbricks-api/2.0.0',
    },
  },
});

// Track active connections
let activeConnections = 0;

/**
 * Execute a Supabase query with circuit breaker protection
 */
export async function executeQuery<T>(
  operation: string,
  table: string,
  query: () => Promise<T>
): Promise<T> {
  const tracker = new DBMetricsTracker(operation, table);
  activeConnections++;
  dbConnectionsActive.set(activeConnections);

  try {
    const result = await dbCircuitBreaker.execute(
      async () => {
        try {
          return await query();
        } catch (error: any) {
          logger.error('Database query failed', {
            operation,
            table,
            error: error.message,
          });
          throw Errors.databaseError(error.message, {
            operation,
            table,
            code: error.code,
          });
        }
      },
      `${operation}:${table}`
    );

    tracker.finish(true);
    return result;
  } catch (error) {
    tracker.finish(false);
    throw error;
  } finally {
    activeConnections--;
    dbConnectionsActive.set(activeConnections);
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    logger.info('Testing database connection', { url: supabaseUrl });

    const { error } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true });

    if (error) {
      logger.error('Database connection test failed', {
        error: error.message,
        code: (error as any).code,
      });
      return false;
    }

    logger.info('Database connection successful');
    return true;
  } catch (error: any) {
    logger.error('Database connection test error', {
      error: error.message,
    });
    return false;
  }
}

/**
 * Get database health status
 */
export async function getDatabaseHealth(): Promise<{
  connected: boolean;
  latency?: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    const { error } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true });

    const latency = Date.now() - start;

    if (error) {
      return {
        connected: false,
        latency,
        error: error.message,
      };
    }

    return {
      connected: true,
      latency,
    };
  } catch (error: any) {
    return {
      connected: false,
      latency: Date.now() - start,
      error: error.message,
    };
  }
}

export default supabase;

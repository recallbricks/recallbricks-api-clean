/**
 * Admin Routes
 *
 * Administrative endpoints for database maintenance and migrations
 */

import { Router, Request, Response } from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// All routes require authentication
router.use(authenticateApiKey);

/**
 * POST /api/v1/admin/run-migration
 * Run database migrations
 */
router.post('/run-migration', async (req: Request, res: Response): Promise<void> => {
  try {
    const { migration_file } = req.body;

    if (!migration_file) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'migration_file parameter is required'
      });
      return;
    }

    console.log(`Running migration: ${migration_file}`);

    // Read migration file
    const migrationPath = join(__dirname, '../../migrations', migration_file);
    const sql = readFileSync(migrationPath, 'utf8');

    // Execute migration using raw SQL
    // Note: Supabase client doesn't support raw SQL execution directly
    // We'll create the tables using individual queries

    // Check if learning_metrics table exists
    const { data: existingTable, error: checkError } = await supabase
      .from('learning_metrics')
      .select('id')
      .limit(1);

    if (checkError && checkError.code === 'PGRST116') {
      // Table doesn't exist, create it
      console.log('learning_metrics table does not exist, creating...');

      // Since we can't run raw SQL through Supabase client, we'll return the SQL
      res.json({
        success: false,
        message: 'Cannot run raw SQL through Supabase client. Please run the migration manually.',
        instructions: [
          '1. Go to your Supabase dashboard',
          '2. Navigate to SQL Editor',
          '3. Copy and paste the contents of migrations/20251118_phase2_predictive.sql',
          '4. Execute the SQL'
        ],
        sql: sql.substring(0, 500) + '...'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Tables already exist or migration not needed',
      table_exists: !checkError
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to run migration.'
    });
  }
});

/**
 * GET /api/v1/admin/check-tables
 * Check which tables exist
 */
router.get('/check-tables', async (req: Request, res: Response): Promise<void> => {
  try {
    const tablesToCheck = [
      'memories',
      'memory_relationships',
      'memory_analytics',
      'temporal_patterns',
      'user_learning_params',
      'learning_metrics',
      'prediction_cache'
    ];

    const results: Record<string, boolean> = {};

    for (const table of tablesToCheck) {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        results[table] = !error || error.code !== 'PGRST116';
      } catch {
        results[table] = false;
      }
    }

    const missingTables = Object.entries(results)
      .filter(([_, exists]) => !exists)
      .map(([table]) => table);

    res.json({
      tables: results,
      missing_tables: missingTables,
      all_exist: missingTables.length === 0
    });

  } catch (error: any) {
    console.error('Check tables error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to check tables.'
    });
  }
});

export default router;

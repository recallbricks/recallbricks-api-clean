import pg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Missing DATABASE_URL environment variable');
  process.exit(1);
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Reading migration file...');
    const sql = readFileSync('./migrations/20251118_phase2_predictive.sql', 'utf8');

    console.log('Executing migration...');
    await client.query(sql);

    console.log('\n✓ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    // Continue anyway if table already exists
    if (error.message.includes('already exists')) {
      console.log('Tables already exist, skipping...');
    } else {
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
  console.log('File: migrations/quick_learning_metrics.sql\n');

  const sql = readFileSync('./migrations/quick_learning_metrics.sql', 'utf8');
  console.log('--- SQL TO RUN ---');
  console.log(sql);
  console.log('--- END SQL ---\n');

  console.log('Instructions:');
  console.log('1. Go to https://app.supabase.com');
  console.log('2. Select your project');
  console.log('3. Go to SQL Editor');
  console.log('4. Create a new query');
  console.log('5. Copy and paste the SQL above');
  console.log('6. Click "Run"');

  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Checking if learning_metrics table exists...');

    // Try to query the table
    const { data, error } = await supabase
      .from('learning_metrics')
      .select('id')
      .limit(1);

    if (error && error.code === 'PGRST116') {
      console.log('✗ Table learning_metrics does not exist');
      console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
      console.log('File: migrations/quick_learning_metrics.sql\n');

      const sql = readFileSync('./migrations/quick_learning_metrics.sql', 'utf8');
      console.log('--- SQL TO RUN ---');
      console.log(sql);
      console.log('--- END SQL ---\n');

      console.log('Instructions:');
      console.log('1. Go to https://app.supabase.com');
      console.log('2. Select your project');
      console.log('3. Go to SQL Editor');
      console.log('4. Create a new query');
      console.log('5. Copy and paste the SQL above');
      console.log('6. Click "Run"');
    } else if (error) {
      console.error('Error checking table:', error);
    } else {
      console.log('✓ Table learning_metrics already exists!');
      console.log('Migration not needed.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

runMigration();

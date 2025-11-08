/**
 * Supabase Configuration
 *
 * Initializes Supabase client with service role key for admin access
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Checking Supabase env vars...');
console.log('SUPABASE_URL:', supabaseUrl || 'MISSING');
console.log('SUPABASE_SERVICE_ROLE_KEY length:', supabaseServiceKey?.length || 0);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration!');
  console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Create Supabase client with service role (admin) access
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    console.log('Testing connection to:', supabaseUrl);
    const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    if (error) {
      console.error('Supabase query error:', JSON.stringify(error));
      throw error;
    }
    console.log('Supabase connection successful!');
    return true;
  } catch (error) {
    console.error('Supabase connection test failed:', error);
    return false;
  }
}

export default supabase;

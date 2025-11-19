# Database Migrations

This folder contains SQL migration files for the RecallBricks API database schema.

## Running Migrations

Since this project uses Supabase, you can run migrations in two ways:

### Option 1: Supabase Dashboard (Recommended)

1. Log in to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Copy the contents of the migration file
4. Paste into the SQL Editor
5. Click **Run** to execute

### Option 2: Supabase CLI

If you have the Supabase CLI installed:

```bash
supabase db push migrations/20251117_add_metacognitive_tracking.sql
```

### Option 3: Direct PostgreSQL Connection

If you have direct database access:

```bash
psql -h your-supabase-host -U postgres -d postgres -f migrations/20251117_add_metacognitive_tracking.sql
```

## Migration History

| Date | File | Description |
|------|------|-------------|
| 2025-11-17 | `20251117_add_metacognitive_tracking.sql` | Phase 1: Add usage tracking, helpfulness scoring, and access patterns to memories table |

## Rollback

To rollback the metacognitive tracking migration:

```sql
-- Drop functions
DROP FUNCTION IF EXISTS increment_memory_usage(UUID, TEXT);
DROP FUNCTION IF EXISTS update_helpfulness_score(UUID, BOOLEAN, FLOAT);

-- Drop view
DROP VIEW IF EXISTS memory_analytics;

-- Drop indexes
DROP INDEX IF EXISTS idx_memories_last_accessed;
DROP INDEX IF EXISTS idx_memories_helpfulness_score;
DROP INDEX IF EXISTS idx_memories_usage_count;
DROP INDEX IF EXISTS idx_memories_weighted_search;

-- Remove constraints
ALTER TABLE memories DROP CONSTRAINT IF EXISTS check_helpfulness_score_range;
ALTER TABLE memories DROP CONSTRAINT IF EXISTS check_usage_count_non_negative;

-- Remove columns
ALTER TABLE memories
DROP COLUMN IF EXISTS usage_count,
DROP COLUMN IF EXISTS last_accessed,
DROP COLUMN IF EXISTS helpfulness_score,
DROP COLUMN IF EXISTS access_pattern;
```

## Best Practices

1. **Always backup** your database before running migrations
2. **Test in staging** environment first
3. **Run during low-traffic** periods if possible
4. **Monitor performance** after adding indexes
5. **Keep this README updated** with new migrations

## Notes

- All migrations are idempotent (use `IF NOT EXISTS` / `IF EXISTS`)
- Backward compatibility is maintained (existing API calls work unchanged)
- New columns have sensible defaults (no NULL values for existing rows)
- Indexes are created to optimize query performance

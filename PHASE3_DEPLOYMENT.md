# Phase 3: Deployment Guide

Complete deployment instructions for RecallBricks Phase 3 multi-agent collaboration features.

## Prerequisites

- RecallBricks API v2.0 running
- PostgreSQL database (via Supabase)
- Database migration tool or direct SQL access
- Node.js 18+ and npm

## Deployment Steps

### 1. Database Migration

Run the Phase 3 migration to create all collaboration tables.

#### Option A: Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migration
supabase db push migrations/20251118_phase3_collaboration.sql
```

#### Option B: Using SQL Editor

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `migrations/20251118_phase3_collaboration.sql`
3. Paste and execute

#### Option C: Using psql

```bash
psql -h db.xxx.supabase.co \
     -U postgres \
     -d postgres \
     -f migrations/20251118_phase3_collaboration.sql
```

### 2. Verify Migration

Check that all tables were created successfully:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'agent_profiles',
    'agent_memory_contributions',
    'memory_conflicts',
    'synthesis_history',
    'agent_trust_network',
    'memory_pools',
    'memory_pool_memberships'
  );
```

Expected output: 7 tables

### 3. Verify Functions

Check that database functions exist:

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_type = 'FUNCTION'
  AND routine_name IN (
    'calculate_agent_reputation',
    'detect_memory_conflicts',
    'synthesize_knowledge',
    'resolve_conflict',
    'update_agent_contribution_stats'
  );
```

Expected output: 5 functions

### 4. Verify Views

Check that views were created:

```sql
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN (
    'collaborative_memory_health',
    'agent_performance_dashboard'
  );
```

Expected output: 2 views

### 5. Update Application Code

Ensure your application has the latest code:

```bash
# Pull latest changes
git pull origin feature/metacognition

# Install dependencies (if any new ones)
npm install

# Build TypeScript
npm run build

# Restart server
pm2 restart recallbricks-api
# OR
npm run start
```

### 6. Test Basic Functionality

Run a quick test to ensure Phase 3 is working:

```bash
# Test agent creation
curl -X POST http://localhost:8080/api/v1/collaboration/agents \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_name": "test-agent",
    "agent_type": "general"
  }'

# Should return 201 Created with agent profile

# Test dashboard
curl http://localhost:8080/api/v1/collaboration/dashboard \
  -H "X-API-Key: $API_KEY"

# Should return dashboard data
```

## Environment Configuration

### Optional Environment Variables

Add these to your `.env` file for Phase 3 configuration:

```bash
# Enable automatic conflict detection on memory creation (can be expensive)
ENABLE_AUTO_CONFLICT_DETECTION=false

# Conflict detection threshold (0.0-1.0)
DEFAULT_CONFLICT_THRESHOLD=0.7

# Reputation calculation frequency
REPUTATION_RECALC_INTERVAL_HOURS=24

# Enable cross-agent learning transfer by default
ENABLE_CROSS_AGENT_LEARNING=true
```

## Performance Considerations

### Indexes

The migration creates several indexes. Verify they exist:

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'agent%' OR tablename LIKE 'memory%';
```

### Auto-Conflict Detection

By default, auto-conflict detection is **disabled** because it can be expensive for large datasets.

To enable, uncomment this trigger in the migration:

```sql
CREATE TRIGGER trigger_memory_conflict_detection
  AFTER INSERT ON memories
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_detect_conflicts();
```

### Query Optimization

For large-scale deployments:

1. **Enable pg_trgm** for better text similarity:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

2. **Add GIN index** on memory text for similarity searches:
```sql
CREATE INDEX idx_memories_text_trgm ON memories USING GIN (text gin_trgm_ops);
```

## Database Permissions

### Row Level Security (RLS)

If using Supabase RLS, add these policies:

```sql
-- Agent profiles: Users can only access their own agents
CREATE POLICY "Users can view own agents"
  ON agent_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own agents"
  ON agent_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Similar policies for other tables...
```

### Service Role Access

Ensure your service role has permissions:

```sql
GRANT ALL ON agent_profiles TO service_role;
GRANT ALL ON agent_memory_contributions TO service_role;
GRANT ALL ON memory_conflicts TO service_role;
GRANT ALL ON synthesis_history TO service_role;
GRANT ALL ON agent_trust_network TO service_role;
GRANT ALL ON memory_pools TO service_role;
GRANT ALL ON memory_pool_memberships TO service_role;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION calculate_agent_reputation TO service_role;
GRANT EXECUTE ON FUNCTION detect_memory_conflicts TO service_role;
GRANT EXECUTE ON FUNCTION synthesize_knowledge TO service_role;
GRANT EXECUTE ON FUNCTION resolve_conflict TO service_role;
GRANT EXECUTE ON FUNCTION update_agent_contribution_stats TO service_role;
```

## Testing Deployment

### Run Test Suite

```bash
# Run Phase 3 tests
npm test -- collaboration.test.ts

# Run all tests
npm test
```

### Manual Testing Checklist

- [ ] Create agent profile
- [ ] Agent contributes memory
- [ ] View memory with contributors
- [ ] Synthesize knowledge from multiple memories
- [ ] Detect conflicts
- [ ] Resolve conflict
- [ ] Transfer learning between agents
- [ ] View collaboration dashboard
- [ ] Check agent performance metrics

## Monitoring

### Key Metrics to Track

1. **Agent Activity**
   - Number of active agents
   - Contributions per agent
   - Average agent reputation

2. **Collaboration Health**
   - Synthesis rate
   - Conflict resolution rate
   - Unresolved conflicts

3. **Performance**
   - Conflict detection time
   - Synthesis processing time
   - Reputation calculation time

### Monitoring Queries

```sql
-- Active agents in last 24h
SELECT COUNT(*)
FROM agent_profiles
WHERE last_contribution > NOW() - INTERVAL '24 hours';

-- Unresolved conflicts
SELECT COUNT(*)
FROM memory_conflicts
WHERE resolved_at IS NULL;

-- Synthesis activity
SELECT COUNT(*)
FROM synthesis_history
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Average reputation by agent type
SELECT agent_type, AVG(reputation_score) as avg_reputation
FROM agent_profiles
GROUP BY agent_type;
```

## Rollback Procedure

If you need to rollback Phase 3:

```sql
-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS memory_pool_memberships CASCADE;
DROP TABLE IF EXISTS memory_pools CASCADE;
DROP TABLE IF EXISTS agent_trust_network CASCADE;
DROP TABLE IF EXISTS synthesis_history CASCADE;
DROP TABLE IF EXISTS memory_conflicts CASCADE;
DROP TABLE IF EXISTS agent_memory_contributions CASCADE;
DROP TABLE IF EXISTS agent_profiles CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS calculate_agent_reputation CASCADE;
DROP FUNCTION IF EXISTS detect_memory_conflicts CASCADE;
DROP FUNCTION IF EXISTS synthesize_knowledge CASCADE;
DROP FUNCTION IF EXISTS resolve_conflict CASCADE;
DROP FUNCTION IF EXISTS update_agent_contribution_stats CASCADE;

-- Drop views
DROP VIEW IF EXISTS collaborative_memory_health CASCADE;
DROP VIEW IF EXISTS agent_performance_dashboard CASCADE;
```

**Warning**: This will delete all agent profiles, contributions, and synthesis history.

## Production Recommendations

### 1. Gradual Rollout

Start with a small set of users:
```sql
-- Enable Phase 3 for specific users
ALTER TABLE users ADD COLUMN phase3_enabled BOOLEAN DEFAULT false;
UPDATE users SET phase3_enabled = true WHERE email IN ('beta@example.com');
```

### 2. Background Jobs

Set up background jobs for:
- Periodic reputation recalculation
- Conflict detection scans
- Stale agent cleanup

```javascript
// Example cron job (node-cron)
cron.schedule('0 0 * * *', async () => {
  // Recalculate all agent reputations daily
  const { data: agents } = await supabase
    .from('agent_profiles')
    .select('id');

  for (const agent of agents) {
    await supabase.rpc('calculate_agent_reputation', {
      p_agent_id: agent.id
    });
  }
});
```

### 3. Database Maintenance

Schedule regular maintenance:

```sql
-- Vacuum tables weekly
VACUUM ANALYZE agent_profiles;
VACUUM ANALYZE agent_memory_contributions;
VACUUM ANALYZE memory_conflicts;
VACUUM ANALYZE synthesis_history;

-- Reindex monthly
REINDEX TABLE agent_profiles;
REINDEX TABLE agent_memory_contributions;
```

### 4. Backup Strategy

Ensure backups include Phase 3 tables:

```bash
# PostgreSQL backup
pg_dump -h db.xxx.supabase.co \
        -U postgres \
        -d postgres \
        -t agent_profiles \
        -t agent_memory_contributions \
        -t memory_conflicts \
        -t synthesis_history \
        -t agent_trust_network \
        > phase3_backup.sql
```

## Troubleshooting

### Issue: Functions not found

**Solution**: Re-run migration or manually create functions.

### Issue: Permission denied errors

**Solution**: Check RLS policies and service role permissions.

### Issue: Slow conflict detection

**Solution**:
1. Disable auto-conflict detection
2. Run conflict detection in background jobs
3. Add similarity indexes

### Issue: High database load

**Solution**:
1. Add connection pooling
2. Cache dashboard queries
3. Limit conflict detection scope

## Next Steps

After successful deployment:

1. Read [COLLABORATION_GUIDE.md](./COLLABORATION_GUIDE.md) for usage patterns
2. Review [CONFLICT_RESOLUTION.md](./CONFLICT_RESOLUTION.md) for conflict strategies
3. Monitor metrics and adjust thresholds
4. Train agents and build workflows

## Support

For issues or questions:
- GitHub Issues: https://github.com/anthropics/recallbricks/issues
- Documentation: https://docs.recallbricks.com
- Email: support@recallbricks.com

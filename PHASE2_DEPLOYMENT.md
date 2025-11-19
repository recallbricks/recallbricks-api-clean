# Phase 2 Deployment Checklist

## Pre-Deployment

### 1. Database Migration
- [ ] **Backup your database** (CRITICAL!)
  ```bash
  pg_dump -U postgres -d recallbricks > backup_pre_phase2.sql
  ```

- [ ] **Run Phase 2 migration**
  ```bash
  psql -U postgres -d recallbricks -f migrations/20251118_phase2_predictive.sql
  ```

- [ ] **Verify new tables created**
  ```sql
  \dt temporal_patterns
  \dt user_learning_params
  \dt prediction_cache
  \dt learning_metrics
  ```

- [ ] **Verify new functions created**
  ```sql
  \df record_temporal_pattern
  \df update_learning_params
  \df record_learning_metric
  \df cleanup_expired_predictions
  ```

- [ ] **Check indexes**
  ```sql
  \di idx_temporal_patterns_*
  \di idx_user_learning_params_*
  \di idx_prediction_cache_*
  \di idx_learning_metrics_*
  ```

### 2. Code Build & Tests
- [ ] **Install dependencies (if any new)**
  ```bash
  npm install
  ```

- [ ] **Build TypeScript**
  ```bash
  npm run build
  ```

- [ ] **Run Phase 2 tests**
  ```bash
  npm test -- phase2.test.ts
  ```

- [ ] **Run all tests**
  ```bash
  npm test
  ```

### 3. Environment Configuration
- [ ] **Verify environment variables**
  - `OPENAI_API_KEY` (required for embeddings)
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`

- [ ] **Check feature flags** (if applicable)
  - Phase 2 features are ON by default
  - Can disable `adaptive_weights` per request

### 4. Documentation
- [ ] **Review API documentation**: PHASE2_API.md
- [ ] **Check migration SQL**: migrations/20251118_phase2_predictive.sql
- [ ] **Verify type definitions**: src/types/recallbricks.d.ts

---

## Deployment Steps

### Step 1: Deploy Database Changes
```bash
# Connect to production database
psql -U postgres -h your-db-host -d recallbricks

# Run migration
\i migrations/20251118_phase2_predictive.sql

# Verify
SELECT COUNT(*) FROM temporal_patterns;
SELECT COUNT(*) FROM user_learning_params;
SELECT COUNT(*) FROM prediction_cache;
SELECT COUNT(*) FROM learning_metrics;
```

### Step 2: Deploy Code
```bash
# Pull latest code
git pull origin feature/metacognition

# Build
npm run build

# Restart server
pm2 restart recallbricks-api
# OR
systemctl restart recallbricks-api
```

### Step 3: Verify Endpoints
Test each new endpoint:

**1. Predictive Prefetching**
```bash
curl -X GET "http://your-api/api/v1/memories/predict?limit=5" \
  -H "X-API-Key: your-key"
```

**2. Context Suggestions**
```bash
curl -X POST "http://your-api/api/v1/memories/suggest" \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"context": "test", "limit": 5}'
```

**3. Maintenance Suggestions**
```bash
curl -X GET "http://your-api/api/v1/learning/maintenance-suggestions" \
  -H "X-API-Key: your-key"
```

**4. Learning Metrics**
```bash
curl -X GET "http://your-api/api/v1/learning/metrics?days=30" \
  -H "X-API-Key: your-key"
```

**5. Enhanced Analysis**
```bash
curl -X POST "http://your-api/api/v1/learning/analyze-enhanced" \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"auto_apply": false}'
```

### Step 4: Initialize Background Jobs

**Option A: Cron Job**
```bash
# Add to crontab
crontab -e

# Run enhanced learning every 6 hours
0 */6 * * * curl -X POST http://localhost:3000/api/v1/learning/analyze-enhanced \
  -H "X-API-Key: admin-key" \
  -H "Content-Type: application/json" \
  -d '{"auto_apply": true}'

# Clean prediction cache every hour
0 * * * * psql -U postgres -d recallbricks -c "SELECT cleanup_expired_predictions();"
```

**Option B: Node Scheduler** (add to src/index.ts)
```typescript
import { startLearningScheduler } from './services/learningScheduler.js';
import { runEnhancedLearningCycle } from './services/learningAnalyzer.js';

// Start enhanced learning cycle every 6 hours
setInterval(async () => {
  await runEnhancedLearningCycle(true);
}, 6 * 60 * 60 * 1000);
```

---

## Post-Deployment Verification

### 1. Functional Tests
- [ ] **Create a test memory**
- [ ] **Access it multiple times**
- [ ] **Run prediction endpoint** - should return predictions
- [ ] **Get suggestions** - should work with context
- [ ] **Check maintenance** - should return empty results initially
- [ ] **View metrics** - should show current stats

### 2. Performance Checks
- [ ] **Response times** < 500ms for predictions
- [ ] **Response times** < 300ms for suggestions (with cache)
- [ ] **Database query times** < 100ms for most queries

### 3. Monitor Logs
Check for any errors:
```bash
tail -f /var/log/recallbricks-api.log
# OR
pm2 logs recallbricks-api
```

Look for:
- "Enhanced Phase 2 learning cycle..." (success)
- "Detected X temporal patterns" (success)
- Any ERROR messages (investigate)

### 4. Database Growth
Monitor new table sizes:
```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN ('temporal_patterns', 'user_learning_params', 'prediction_cache', 'learning_metrics')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Gradual Rollout (Recommended)

### Week 1: Monitoring Only
- Enable Phase 2 endpoints
- Don't enable auto-apply yet
- Collect data on patterns detected
- Monitor for errors

### Week 2: Soft Launch
- Enable `adaptive_weights` for 10% of users
- Monitor weight convergence
- Check prediction accuracy
- Gather user feedback

### Week 3: Full Rollout
- Enable for all users
- Enable `auto_apply` for relationship suggestions
- Monitor maintenance suggestions
- Track learning velocity

---

## Rollback Plan

If issues arise:

### Quick Rollback (Code Only)
```bash
# Revert to previous version
git checkout main
npm run build
pm2 restart recallbricks-api

# Phase 2 tables remain but aren't used
```

### Full Rollback (Code + Database)
```bash
# Stop server
pm2 stop recallbricks-api

# Restore database backup
psql -U postgres -d recallbricks < backup_pre_phase2.sql

# Revert code
git checkout main
npm run build
pm2 start recallbricks-api
```

---

## Monitoring & Alerts

### Key Metrics to Track

1. **API Performance**
   - `/predict` endpoint latency
   - `/suggest` endpoint latency
   - `/maintenance-suggestions` execution time

2. **Learning System Health**
   - Patterns detected per hour
   - User weight convergence time
   - Prediction accuracy rate
   - Cache hit rate

3. **Database Performance**
   - Query times for temporal_patterns
   - Size growth of learning_metrics
   - Index usage statistics

### Recommended Alerts

```yaml
alerts:
  - name: "Phase 2 High Latency"
    condition: "p95_latency > 1000ms"
    endpoints: ["/predict", "/suggest"]

  - name: "No Patterns Detected"
    condition: "patterns_per_hour == 0 for 6 hours"
    action: "Check learning analyzer"

  - name: "Cache Growth"
    condition: "prediction_cache size > 1GB"
    action: "Run cleanup function"

  - name: "Learning Metrics Explosion"
    condition: "learning_metrics growth > 100k rows/day"
    action: "Review metric recording frequency"
```

---

## Performance Optimization

### Database Indexes
Already created by migration, but verify:
```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('temporal_patterns', 'prediction_cache', 'learning_metrics')
ORDER BY idx_scan DESC;
```

### Cache Configuration
```typescript
// Adjust cache TTL based on usage
// Default: 1 hour
const PREDICTION_CACHE_TTL = 60 * 60 * 1000;

// Cleanup frequency
// Default: Every hour
const CACHE_CLEANUP_INTERVAL = 60 * 60 * 1000;
```

### Pattern Detection Frequency
```typescript
// Adjust based on usage volume
// High traffic: Every 1 hour
// Low traffic: Every 6 hours
const PATTERN_DETECTION_INTERVAL = 6 * 60 * 60 * 1000;
```

---

## Troubleshooting

### Issue: Predictions Always Empty
**Cause**: Not enough access pattern data

**Solution**:
1. Check access_pattern JSONB in memories table
2. Run `/learning/analyze-enhanced` to build patterns
3. Wait for more user activity

### Issue: Weights Not Adapting
**Cause**: Not enough feedback data

**Solution**:
1. Check user_learning_params table
2. Verify feedback endpoint is being called
3. Check total_searches count (needs >10 for adaptation)

### Issue: High Memory Usage
**Cause**: Large prediction_cache table

**Solution**:
```sql
-- Clear old cache entries
DELETE FROM prediction_cache WHERE expires_at < NOW();

-- Reduce cache TTL
UPDATE prediction_cache SET expires_at = NOW() + INTERVAL '30 minutes';
```

### Issue: Slow Maintenance Endpoint
**Cause**: Too many memories to compare

**Solution**:
```typescript
// Reduce analysis limit in code
.limit(200) // Down from 500
```

---

## Success Criteria

After 1 week of deployment:

- [ ] **Zero critical errors** in logs
- [ ] **Response times** meet targets (<500ms)
- [ ] **Patterns detected** for active users (>5 patterns per user)
- [ ] **Weights converging** (stable after ~50 searches)
- [ ] **Cache hit rate** >60%
- [ ] **User satisfaction** maintained or improved
- [ ] **No performance degradation** of existing endpoints

---

## Support

If you encounter issues:

1. **Check logs** for error messages
2. **Review database** for data integrity
3. **Test endpoints** individually
4. **Consult documentation**:
   - PHASE2_API.md
   - METACOGNITION_PHASE1.md
5. **Contact**: github.com/your-repo/issues

---

## Next Steps After Deployment

1. **Monitor for 1 week**: Track metrics and user feedback
2. **Tune parameters**: Adjust weights, thresholds, cache TTL
3. **Optimize queries**: Based on slow query log
4. **Plan Phase 3**: Advanced features based on Phase 2 learnings

---

## Changelog

**Version 2.0.0 - Phase 2**
- ✅ Predictive memory prefetching
- ✅ Context-aware suggestions
- ✅ Temporal pattern learning
- ✅ Adaptive per-user weights
- ✅ Proactive maintenance
- ✅ Learning velocity tracking

---

Last updated: 2025-11-18

# Phase 1 Deployment Checklist

## Pre-Deployment

### 1. Database Migration ✅
- [ ] Backup production database
- [ ] Review migration SQL: `migrations/20251117_add_metacognitive_tracking.sql`
- [ ] Test migration on staging database
- [ ] Execute migration in production:
  ```sql
  -- Run in Supabase SQL Editor
  -- See migrations/README.md for details
  ```
- [ ] Verify new columns exist:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'memories'
  AND column_name IN ('usage_count', 'last_accessed', 'helpfulness_score', 'access_pattern');
  ```
- [ ] Verify functions exist:
  ```sql
  SELECT routine_name FROM information_schema.routines
  WHERE routine_name IN ('increment_memory_usage', 'update_helpfulness_score');
  ```
- [ ] Verify view exists:
  ```sql
  SELECT * FROM memory_analytics LIMIT 1;
  ```

### 2. Code Review ✅
- [ ] Review new files:
  - `src/routes/learning.ts`
  - `src/services/learningAnalyzer.ts`
  - `src/services/learningScheduler.ts`
- [ ] Review modified files:
  - `src/routes/memories.ts`
  - `src/types/recallbricks.d.ts`
  - `src/index.ts`
- [ ] Check TypeScript compilation:
  ```bash
  npm run build
  ```
- [ ] Review security (no SQL injection, proper auth, input validation)

### 3. Environment Configuration ✅
- [ ] Set environment variables:
  ```env
  ENABLE_LEARNING_SCHEDULER=true    # or false to disable
  LEARNING_INTERVAL_HOURS=1         # how often to run analysis
  LEARNING_AUTO_APPLY=false         # auto-create relationships
  ```
- [ ] Verify existing env vars still work:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY` (optional)
  - `PORT`

### 4. Testing (Optional but Recommended) ✅
- [ ] Install test dependencies:
  ```bash
  npm install --save-dev vitest @vitest/coverage-v8 supertest @types/supertest
  ```
- [ ] Run test suite:
  ```bash
  npm test
  ```
- [ ] Verify all tests pass
- [ ] Check test coverage:
  ```bash
  npm run test:coverage
  ```

## Deployment

### 5. Build and Deploy ✅
- [ ] Clean build:
  ```bash
  rm -rf dist
  npm run build
  ```
- [ ] Verify no TypeScript errors
- [ ] Deploy to production (your deployment process)
- [ ] Verify server starts:
  ```bash
  npm start
  # Or your production start command
  ```

### 6. Smoke Tests ✅
- [ ] Check server health:
  ```bash
  curl https://your-api.com/health/ready
  ```
- [ ] Verify metacognition features listed:
  ```bash
  curl https://your-api.com/ | jq '.features'
  # Should include "Self-Optimizing Memory (Metacognition)"
  ```
- [ ] Test existing endpoint (backward compatibility):
  ```bash
  curl -X GET https://your-api.com/api/v1/memories \
    -H "X-API-Key: test-key"
  ```
- [ ] Test new endpoint:
  ```bash
  curl -X GET https://your-api.com/api/v1/memories/meta/patterns \
    -H "X-API-Key: test-key"
  ```

## Post-Deployment

### 7. Monitoring ✅
- [ ] Check logs for errors:
  ```bash
  tail -f logs/app.log | grep ERROR
  ```
- [ ] Verify learning scheduler started (if enabled):
  ```bash
  grep "Learning scheduler started" logs/app.log
  ```
- [ ] Monitor first learning job execution:
  ```bash
  grep "Learning analysis completed" logs/app.log
  ```

### 8. Gradual Rollout ✅
- [ ] Enable weighted search for small user group
- [ ] Monitor performance impact
- [ ] Collect feedback on result quality
- [ ] Adjust parameters if needed:
  - Usage weight multiplier
  - Recency boost/penalty percentages
  - Minimum helpfulness threshold

### 9. Documentation ✅
- [ ] Update API documentation
- [ ] Notify users of new features
- [ ] Provide usage examples
- [ ] Update changelog

## Rollback Plan

### If Issues Occur:

**1. Disable Learning Scheduler:**
```env
ENABLE_LEARNING_SCHEDULER=false
```
Restart server.

**2. Revert Code:**
```bash
git revert <commit-hash>
npm run build
# Redeploy
```

**3. Rollback Database (Last Resort):**
```sql
-- See migrations/README.md "Rollback" section
-- WARNING: This will delete all usage tracking data
```

## Success Criteria

After deployment, verify:
- [ ] Existing API endpoints work unchanged
- [ ] New endpoints return expected data
- [ ] No increase in error rate
- [ ] Response times remain acceptable (<2s for most requests)
- [ ] Learning scheduler runs without errors (if enabled)
- [ ] Database performance is stable

## Performance Benchmarks

**Before Deployment (Baseline):**
- GET /memories/:id: ___ ms
- POST /memories/search: ___ ms
- Database CPU: ___% avg
- Database memory: ___ MB

**After Deployment (Target):**
- GET /memories/:id: < baseline + 10ms
- POST /memories/search: < baseline + 30ms (weighted)
- Database CPU: < baseline + 5%
- Database memory: < baseline + 10%

## Support

**Issues?**
1. Check logs: `tail -f logs/app.log`
2. Review TESTING.md for debugging
3. Check database: `SELECT * FROM memory_analytics LIMIT 10;`
4. Open GitHub issue with logs and error details

**Need Help?**
- METACOGNITION_API.md - Full API reference
- TESTING.md - Testing and debugging
- METACOGNITION_PHASE1.md - Implementation details

---

**Deployment Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

**Deployed By:** ________________

**Deployment Date:** ________________

**Notes:**
_____________________________________________
_____________________________________________
_____________________________________________

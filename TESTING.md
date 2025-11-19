# Testing Guide for RecallBricks Metacognition Features

## Setup

### 1. Install Test Dependencies

```bash
npm install --save-dev vitest @vitest/coverage-v8 supertest @types/supertest
```

### 2. Update package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

### 3. Environment Setup

Create a `.env.test` file with test credentials:

```env
SUPABASE_URL=your_test_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_test_service_role_key
TEST_API_KEY=your_test_api_key
TEST_API_URL=http://localhost:8080
OPENAI_API_KEY=your_openai_key  # Optional, for embedding tests
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run with Coverage Report

```bash
npm run test:coverage
```

### Run Specific Test File

```bash
npx vitest src/__tests__/metacognition.test.ts
```

## Test Coverage

The metacognition test suite covers:

### ✅ Usage Tracking
- Memory access tracking (usage_count, last_accessed)
- Context logging in access_pattern
- Learning metadata inclusion in responses

### ✅ Weighted Search
- Default unweighted search
- Usage-based weighting (boosting frequently-used memories)
- Recency decay (penalizing old memories)
- Minimum helpfulness filtering
- Learning mode tracking

### ✅ Feedback Loop
- Positive feedback (increases helpfulness_score)
- Negative feedback (decreases helpfulness_score)
- User satisfaction scores (0.0-1.0)
- Feedback context storage
- Input validation

### ✅ Pattern Analysis
- Most useful tags analysis
- Co-access pattern detection
- Underutilized memory identification
- Relationship type effectiveness
- Summary statistics

### ✅ Learning System
- On-demand analysis triggering
- Relationship suggestion generation
- Weight optimization
- Stale memory detection

## Manual Testing

### 1. Test Usage Tracking

```bash
# Create a memory
curl -X POST http://localhost:8080/api/v1/memories \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Test memory", "tags": ["test"]}'

# Access it multiple times (should increment usage_count)
curl -X GET http://localhost:8080/api/v1/memories/{memory-id} \
  -H "X-API-Key: your-key"
```

### 2. Test Weighted Search

```bash
# Unweighted search (baseline)
curl -X POST http://localhost:8080/api/v1/memories/search \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 10}'

# Weighted search (usage-based)
curl -X POST http://localhost:8080/api/v1/memories/search \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "test",
    "limit": 10,
    "weight_by_usage": true,
    "decay_old_memories": true
  }'
```

### 3. Test Feedback

```bash
# Submit positive feedback
curl -X POST http://localhost:8080/api/v1/memories/{memory-id}/feedback \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "helpful": true,
    "context": "Very useful for pricing questions",
    "user_satisfaction": 0.9
  }'
```

### 4. Test Pattern Analysis

```bash
# Get usage patterns
curl -X GET http://localhost:8080/api/v1/memories/meta/patterns \
  -H "X-API-Key: your-key"
```

### 5. Test Learning Job

```bash
# Trigger learning analysis
curl -X POST http://localhost:8080/api/v1/learning/analyze \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"auto_apply": false}'
```

## Database Verification

### Check Usage Tracking

```sql
SELECT id, text, usage_count, last_accessed, helpfulness_score
FROM memories
ORDER BY usage_count DESC
LIMIT 10;
```

### Check Analytics View

```sql
SELECT *
FROM memory_analytics
WHERE access_frequency = 'high'
LIMIT 10;
```

### Verify Access Patterns

```sql
SELECT id, text, access_pattern
FROM memories
WHERE access_pattern IS NOT NULL
AND access_pattern != '{}'
LIMIT 5;
```

## Troubleshooting

### Tests Failing with Database Errors

1. Ensure migration has been run:
   ```bash
   # Run the migration SQL in Supabase dashboard
   cat migrations/20251117_add_metacognitive_tracking.sql
   ```

2. Verify Supabase connection:
   ```bash
   curl http://localhost:8080/health/ready
   ```

### Tests Timing Out

- Increase `testTimeout` in `vitest.config.ts`
- Check if Supabase database is responding
- Verify network connectivity

### Weighted Search Not Working

- Ensure memories have been accessed (usage_count > 0)
- Check that analytics view is populated
- Verify helpfulness_score is in range [0.0, 1.0]

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Metacognition

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TEST_API_KEY: ${{ secrets.TEST_API_KEY }}

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Best Practices

1. **Isolate test data**: Use a separate test database or namespace
2. **Clean up after tests**: Delete test memories in `afterAll()` hooks
3. **Mock external services**: Mock OpenAI/Claude APIs for faster tests
4. **Test edge cases**: Zero usage, maximum scores, stale data
5. **Verify backwards compatibility**: Existing endpoints still work

## Expected Test Results

All tests should pass with:
- ✅ 30+ test cases
- ✅ > 80% code coverage
- ✅ No memory leaks
- ✅ All endpoints respond within 2s
- ✅ No breaking changes to existing API

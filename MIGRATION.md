# Migration Guide: v1.x to v2.0

This guide helps you migrate from RecallBricks API v1.x to v2.0.

## Summary

**Good News:** v2.0 is fully backward compatible with v1.x. There are **no breaking changes** to API endpoints or request/response formats.

All v2.0 improvements are **additions** that enhance the existing API without breaking existing integrations.

## What's New in v2.0

### 1. Enhanced Response Headers

**New headers in all responses:**
- `X-Request-ID` - Unique request identifier for debugging
- `X-RateLimit-Limit` - Maximum requests allowed
- `X-RateLimit-Remaining` - Remaining requests in current window
- `X-RateLimit-Reset` - ISO 8601 timestamp when rate limit resets
- `Retry-After` - Seconds to wait (only on 429 responses)

**Impact:** None - These are additional headers, existing clients will ignore them

**Recommendation:** Update your client to log X-Request-ID for debugging purposes

### 2. Enhanced Error Response Format

**Before (v1.x):**
```json
{
  "error": "Bad Request",
  "message": "Text is required"
}
```

**After (v2.0):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Text is required",
    "details": { "field": "text" },
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-01-09T12:34:56.789Z"
  }
}
```

**Impact:** Existing error handling continues to work, but now provides more information

**Recommendation:** Update error handling to use error codes for better error detection:

```javascript
// Before
if (response.data.error === "Unauthorized") {
  // handle auth error
}

// After (recommended)
if (response.data.error.code === "INVALID_API_KEY") {
  // handle auth error
}
```

### 3. New Health Check Endpoints

**New endpoints:**
- `GET /health` - Basic liveness check
- `GET /health/ready` - Readiness check with DB status
- `GET /health/metrics` - Prometheus metrics

**Impact:** None - These are new endpoints

**Recommendation:** Configure your load balancer / monitoring to use these endpoints

### 4. Circuit Breaker Protection

The database is now protected by a circuit breaker.

**When circuit breaker is OPEN:**
- Requests return 503 with error code `CIRCUIT_BREAKER_OPEN`
- Circuit automatically recovers after 60 seconds

**Impact:** Your application may receive 503 errors during database outages

**Recommendation:** Implement retry logic with exponential backoff for 503 errors:

```javascript
async function callAPI(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (error.status === 503 && i < retries - 1) {
        // Circuit breaker is open, wait and retry
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

### 5. Enhanced Rate Limiting

**Changes:**
- POST requests now cost 2x (count as 2 requests)
- PUT/DELETE requests cost 1.4x
- Better headers with exact reset times
- `Retry-After` header on 429 responses

**Impact:** POST-heavy applications may hit rate limits sooner

**Recommendation:**
- Use the rate limit headers to track usage
- Check `X-RateLimit-Remaining` before making requests
- Respect `Retry-After` header on 429 responses

```javascript
const response = await fetch(url, options);
const remaining = parseInt(response.headers.get('X-RateLimit-Remaining'));

if (remaining < 10) {
  console.warn('Approaching rate limit:', remaining);
}

if (response.status === 429) {
  const retryAfter = parseInt(response.headers.get('Retry-After'));
  console.log(`Rate limited. Retry after ${retryAfter} seconds`);
  // Wait before retrying
}
```

### 6. Input Validation

**New validation:**
- Maximum memory text length: 10,000 characters
- Query text maximum: 500 characters
- Limit validation: 1-100
- Type validation for all fields

**Impact:** Previously accepted invalid requests now return 400 errors

**Recommendation:** Validate input on the client side before sending:

```javascript
const MAX_TEXT_LENGTH = 10000;

if (memoryText.length > MAX_TEXT_LENGTH) {
  throw new Error(`Text too long: ${memoryText.length} > ${MAX_TEXT_LENGTH}`);
}
```

## Migration Steps

### Step 1: Update Dependencies (No changes required)

Your application doesn't need any changes if it's using the API via HTTP.

### Step 2: Update Error Handling (Optional, Recommended)

```javascript
// Before
try {
  const response = await createMemory(text);
} catch (error) {
  if (error.response?.data?.error === "Unauthorized") {
    // Handle auth error
  }
}

// After (recommended)
try {
  const response = await createMemory(text);
} catch (error) {
  const errorCode = error.response?.data?.error?.code;
  const requestId = error.response?.data?.error?.requestId;

  console.error(`Error ${errorCode} (Request: ${requestId})`);

  switch (errorCode) {
    case 'INVALID_API_KEY':
    case 'MISSING_API_KEY':
      // Handle auth error
      break;
    case 'RATE_LIMIT_EXCEEDED':
      // Handle rate limit
      const retryAfter = error.response.headers['retry-after'];
      break;
    case 'CIRCUIT_BREAKER_OPEN':
    case 'SERVICE_UNAVAILABLE':
      // Retry with backoff
      break;
  }
}
```

### Step 3: Add Rate Limit Tracking (Optional, Recommended)

```javascript
async function callAPIWithRateLimit(url, options) {
  const response = await fetch(url, options);

  // Track rate limit
  const limit = response.headers.get('X-RateLimit-Limit');
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const reset = response.headers.get('X-RateLimit-Reset');

  console.log(`Rate limit: ${remaining}/${limit} (resets at ${reset})`);

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new RateLimitError(`Retry after ${retryAfter} seconds`);
  }

  return response;
}
```

### Step 4: Configure Health Checks (For Production Deployments)

Update your infrastructure configuration:

**Kubernetes:**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
```

**Docker Compose:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8080/health/ready"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Step 5: Update Monitoring (Optional, Recommended)

Add Prometheus scraping for metrics:

**Prometheus config:**
```yaml
scrape_configs:
  - job_name: 'recallbricks-api'
    static_configs:
      - targets: ['api.yourdomain.com:8080']
    metrics_path: '/health/metrics'
```

## Environment Variables

### New Optional Variables in v2.0

```bash
# Logging
LOG_LEVEL=info              # debug, info, warn, error
NODE_ENV=production         # development, production

# Rate Limiting
GLOBAL_RATE_LIMIT=1000      # Global requests per minute

# Circuit Breaker
CIRCUIT_BREAKER_THRESHOLD=5      # Failures before opening
CIRCUIT_BREAKER_TIMEOUT=60000    # Recovery timeout (ms)

# Validation
MAX_MEMORY_TEXT_LENGTH=10000     # Maximum text length

# Security
CORS_ORIGIN=https://yourdomain.com  # Allowed origins
```

**Impact:** All have sensible defaults, no action required

**Recommendation:** Set `NODE_ENV=production` in production for optimized logging

## Testing Your Migration

### 1. Test Basic Functionality

```bash
# Test health check
curl http://your-api/health

# Test memory creation (should work as before)
curl -X POST http://your-api/api/v1/memories \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"Migration test"}'
```

### 2. Test Error Handling

```bash
# Test invalid API key (should return new error format)
curl -X POST http://your-api/api/v1/memories \
  -H "X-API-Key: invalid" \
  -H "Content-Type: application/json" \
  -d '{"text":"Test"}'

# Should return:
# {
#   "error": {
#     "code": "INVALID_API_KEY",
#     "message": "Invalid API key",
#     ...
#   }
# }
```

### 3. Test Rate Limiting

```bash
# Check rate limit status
curl -H "X-API-Key: your-key" \
  http://your-api/api/v1/rate-limit

# Should return:
# {
#   "plan": "free",
#   "limit": 100,
#   "remaining": 95,
#   ...
# }
```

## Rollback Plan

If you need to rollback to v1.x:

1. **Deploy v1.x code** - All endpoints are the same
2. **No database migration needed** - Database schema unchanged
3. **No data loss** - All data remains compatible

## Common Issues

### Issue: Getting 400 errors for text that worked before

**Cause:** v2.0 enforces 10,000 character limit

**Solution:** Trim text before sending:
```javascript
const text = longText.substring(0, 10000);
```

### Issue: Getting more 503 errors than before

**Cause:** Circuit breaker is protecting database during issues

**Solution:** Implement retry logic with exponential backoff

### Issue: Rate limits hit sooner than before

**Cause:** POST requests now count as 2x

**Solution:**
- Monitor `X-RateLimit-Remaining` header
- Upgrade to higher plan if needed
- Batch operations when possible

## Support

If you encounter any issues during migration:

1. Check the error code in the response
2. Include the `X-Request-ID` when reporting issues
3. Check `/health/ready` endpoint for service status
4. Review logs (they now include request IDs)

## Timeline

- **v1.x**: Supported until 2026-01-01
- **v2.0**: Recommended for all new deployments
- **Migration**: Can be done gradually, no downtime required

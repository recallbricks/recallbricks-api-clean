# Quick Start: Memory Relationships

## Setup (5 minutes)

### 1. Verify Configuration

Your `.env` already has the required key:
```bash
ANTHROPIC_API_KEY=sk-ant-...  ✓ Already configured
```

### 2. Optional: Customize Settings

Add to `.env` (optional, defaults are production-ready):
```bash
# Analyze 50 most recent memories (default)
RELATIONSHIP_MEMORY_LIMIT=50

# Minimum confidence threshold (default: 0.6)
RELATIONSHIP_MIN_STRENGTH=0.6

# Max relationships per memory (default: 10)
RELATIONSHIP_MAX_COUNT=10
```

### 3. Start the Server

```bash
npm run build
npm start
```

## Test It (2 minutes)

### 1. Create First Memory

```bash
curl -X POST http://localhost:10000/api/v1/memories \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "text": "Implemented PostgreSQL connection pooling using pg-pool"
  }'
```

Response:
```json
{
  "id": "abc-123",
  "text": "Implemented PostgreSQL connection pooling using pg-pool",
  ...
}
```

### 2. Create Related Memory

```bash
curl -X POST http://localhost:10000/api/v1/memories \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "text": "Configured pgBouncer for connection management and load balancing"
  }'
```

### 3. Wait for Processing

⏱️ Wait 2-5 seconds for async relationship detection to complete.

Check server logs for:
```
✓ Detected 1 relationships for memory abc-123
```

### 4. Query Relationships

```bash
curl http://localhost:10000/api/v1/relationships/memory/abc-123 \
  -H "X-API-Key: YOUR_API_KEY"
```

Response:
```json
{
  "memoryId": "abc-123",
  "relationships": [
    {
      "id": "rel-456",
      "memory_id": "abc-123",
      "related_memory_id": "def-789",
      "relationship_type": "related_to",
      "strength": 0.87,
      "explanation": "Both implement PostgreSQL connection management",
      "created_at": "2025-01-13T10:30:00Z",
      "related_memory": {
        "id": "def-789",
        "text": "Configured pgBouncer for connection management",
        "created_at": "2025-01-13T10:28:00Z"
      }
    }
  ],
  "count": 1
}
```

## Common Use Cases

### Get Relationship Graph

See memory connections visually:

```bash
curl http://localhost:10000/api/v1/relationships/graph/abc-123?depth=2 \
  -H "X-API-Key: YOUR_API_KEY"
```

### Get Statistics

```bash
curl http://localhost:10000/api/v1/relationships/types \
  -H "X-API-Key: YOUR_API_KEY"
```

### Check Service Health

```bash
curl http://localhost:10000/api/v1/relationships/health \
  -H "X-API-Key: YOUR_API_KEY"
```

Expected response:
```json
{
  "service": "relationship-detection",
  "healthy": true,
  "enabled": true,
  "circuitBreakerState": "CLOSED",
  "apiKeyConfigured": true,
  "timestamp": "2025-01-13T10:30:00Z"
}
```

## Monitoring

### View Prometheus Metrics

```bash
curl http://localhost:10000/metrics | grep relationship
```

Key metrics:
- `recallbricks_relationship_detection_attempts_total` - Total attempts
- `recallbricks_relationships_detected_total` - Relationships found
- `recallbricks_claude_api_calls_total` - API usage

### Check Logs

```bash
# View relationship detection logs
grep "relationship detection" logs/app.log

# View Claude API calls
grep "Claude API" logs/app.log
```

## Troubleshooting

### No relationships detected?

**Check health:**
```bash
curl http://localhost:10000/api/v1/relationships/health \
  -H "X-API-Key: YOUR_API_KEY"
```

**Common issues:**
- ✅ API key configured? Check `apiKeyConfigured: true`
- ✅ Circuit breaker closed? Check `circuitBreakerState: "CLOSED"`
- ✅ Feature enabled? Check `enabled: true`

### Adjust sensitivity

**Too many relationships:**
```bash
# In .env
RELATIONSHIP_MIN_STRENGTH=0.8  # Increase threshold
```

**Too few relationships:**
```bash
# In .env
RELATIONSHIP_MIN_STRENGTH=0.5  # Lower threshold
RELATIONSHIP_MAX_COUNT=20      # Allow more
```

## What's Next?

- 📖 Read full documentation: `RELATIONSHIP_DETECTION.md`
- 🔧 See all configuration options: `.env.example`
- 🎯 Integrate with your app using the API endpoints
- 📊 Monitor performance with Prometheus metrics

## Cost Estimation

**Using Claude 3 Haiku:**
- ~$0.001 per relationship detection
- 100 memories/day = ~$3/month
- 1000 memories/day = ~$30/month

**Tips to optimize costs:**
- Use `RELATIONSHIP_MEMORY_LIMIT=20` for high volume
- Set `RELATIONSHIP_MIN_STRENGTH=0.7` for higher quality, fewer relationships
- Consider batching for very high volumes

## Support

Questions or issues? Check:
- Full docs: `RELATIONSHIP_DETECTION.md`
- Example config: `.env.example`
- GitHub Issues: [Your repo URL]

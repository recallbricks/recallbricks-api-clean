# Memory Relationship Detection

## Overview

Automatic AI-powered relationship detection between memories using Claude Haiku. When a memory is created, the system analyzes it against the user's 50 most recent memories to identify semantic relationships.

## Features

✅ **Enterprise-Grade Implementation**
- Circuit breaker pattern to prevent cascading failures
- Exponential backoff retry logic with configurable parameters
- Comprehensive metrics and structured logging
- Input validation and sanitization
- Idempotency guarantees
- Graceful error handling (never blocks memory creation)

✅ **Relationship Types**
- `related_to` - General topical or contextual relationship
- `caused_by` - New memory is a consequence of an existing memory
- `similar_to` - Very similar content or near-duplicate
- `follows` - Continuation or next step
- `contradicts` - Conflicts with existing memory

✅ **Performance Optimized**
- Non-blocking async execution (fire-and-forget)
- Claude Haiku for cost efficiency (~$0.25 per 1M input tokens)
- Configurable rate limiting and circuit breakers
- Efficient batch processing

## Architecture

```
POST /api/v1/memories
  ↓
Memory Created & Saved
  ↓
Async Trigger (non-blocking) →  detectRelationships()
                                   ↓
                                 1. Fetch 50 recent memories
                                   ↓
                                 2. Call Claude API with prompt
                                   ↓
                                 3. Parse & validate relationships
                                   ↓
                                 4. Store in memory_relationships table
                                   ↓
                                 Log result (success/failure)

API Response ← (returned immediately, not waiting for relationships)
```

## Configuration

### Required Environment Variables

```bash
# Required - Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-...

# Optional - Claude Configuration
CLAUDE_MODEL=claude-3-haiku-20240307          # Model to use
CLAUDE_MAX_TOKENS=2048                        # Max tokens in response
CLAUDE_TEMPERATURE=0.3                        # Temperature (0-1)
CLAUDE_TIMEOUT=30000                          # Request timeout (ms)

# Optional - Detection Parameters
RELATIONSHIP_MEMORY_LIMIT=50                  # How many recent memories to analyze
RELATIONSHIP_MIN_STRENGTH=0.6                 # Minimum confidence score (0-1)
RELATIONSHIP_MAX_COUNT=10                     # Max relationships per memory
RELATIONSHIP_EXPLANATION_MAX=200              # Max chars in explanation

# Optional - Retry Configuration
RELATIONSHIP_MAX_RETRIES=3                    # Number of retry attempts
RELATIONSHIP_RETRY_BASE_DELAY=1000            # Initial retry delay (ms)
RELATIONSHIP_RETRY_MAX_DELAY=10000            # Max retry delay (ms)
RELATIONSHIP_RETRY_EXPONENT=2                 # Exponential backoff multiplier

# Optional - Circuit Breaker
RELATIONSHIP_CB_THRESHOLD=5                   # Failures before opening circuit
RELATIONSHIP_CB_TIMEOUT=60000                 # Circuit open duration (ms)

# Optional - Feature Flags
RELATIONSHIP_DETECTION_ENABLED=true           # Enable/disable feature
RELATIONSHIP_ASYNC=true                       # Async execution (recommended)
RELATIONSHIP_STORE_DB=true                    # Store in database
```

## API Endpoints

### 1. Get Relationships for a Memory

```http
GET /api/v1/relationships/memory/:memoryId
```

**Query Parameters:**
- `type` (optional) - Filter by relationship type
- `minStrength` (optional) - Minimum strength threshold (0-1)
- `limit` (optional) - Max results (default: 50)

**Example:**
```bash
curl -X GET "https://api.recallbricks.com/api/v1/relationships/memory/123?minStrength=0.7" \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{
  "memoryId": "123",
  "relationships": [
    {
      "id": "rel-456",
      "memory_id": "123",
      "related_memory_id": "789",
      "relationship_type": "related_to",
      "strength": 0.85,
      "explanation": "Both discuss PostgreSQL database optimization",
      "created_at": "2025-01-13T10:30:00Z",
      "related_memory": {
        "id": "789",
        "text": "Optimizing PostgreSQL queries...",
        "created_at": "2025-01-12T15:20:00Z"
      }
    }
  ],
  "count": 1
}
```

### 2. Get Relationship Graph

```http
GET /api/v1/relationships/graph/:memoryId
```

**Query Parameters:**
- `depth` (optional) - Graph depth (1-3, default: 1)
- `minStrength` (optional) - Minimum strength (default: 0.6)

**Example:**
```bash
curl -X GET "https://api.recallbricks.com/api/v1/relationships/graph/123?depth=2" \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{
  "rootMemoryId": "123",
  "graph": {
    "nodes": [
      {
        "id": "123",
        "text": "Implementing PostgreSQL indexes",
        "created_at": "2025-01-13T10:30:00Z"
      },
      {
        "id": "789",
        "text": "Database query optimization",
        "created_at": "2025-01-12T15:20:00Z"
      }
    ],
    "edges": [
      {
        "id": "rel-456",
        "from": "123",
        "to": "789",
        "type": "related_to",
        "strength": 0.85,
        "explanation": "Both about database performance"
      }
    ]
  },
  "stats": {
    "nodeCount": 2,
    "edgeCount": 1,
    "depth": 2
  }
}
```

### 3. Get Relationship Statistics

```http
GET /api/v1/relationships/types
```

**Example:**
```bash
curl -X GET "https://api.recallbricks.com/api/v1/relationships/types" \
  -H "X-API-Key: your-api-key"
```

**Response:**
```json
{
  "types": {
    "related_to": {
      "count": 42,
      "avgStrength": 0.78
    },
    "follows": {
      "count": 18,
      "avgStrength": 0.82
    },
    "similar_to": {
      "count": 9,
      "avgStrength": 0.91
    }
  },
  "totalRelationships": 69
}
```

### 4. Delete a Relationship

```http
DELETE /api/v1/relationships/:relationshipId
```

**Example:**
```bash
curl -X DELETE "https://api.recallbricks.com/api/v1/relationships/rel-456" \
  -H "X-API-Key: your-api-key"
```

### 5. Health Check

```http
GET /api/v1/relationships/health
```

**Example:**
```bash
curl -X GET "https://api.recallbricks.com/api/v1/relationships/health" \
  -H "X-API-Key: your-api-key"
```

**Response:**
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

## Database Schema

The `memory_relationships` table stores detected relationships:

```sql
CREATE TABLE memory_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  related_memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'related_to',
    'caused_by',
    'similar_to',
    'follows',
    'contradicts'
  )),
  strength NUMERIC(3,2) NOT NULL CHECK (strength >= 0 AND strength <= 1),
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate relationships
  UNIQUE(memory_id, related_memory_id)
);

CREATE INDEX idx_memory_relationships_memory_id ON memory_relationships(memory_id);
CREATE INDEX idx_memory_relationships_related_memory_id ON memory_relationships(related_memory_id);
CREATE INDEX idx_memory_relationships_type ON memory_relationships(relationship_type);
CREATE INDEX idx_memory_relationships_strength ON memory_relationships(strength DESC);
```

## Monitoring & Observability

### Prometheus Metrics

The system exposes comprehensive metrics at `/metrics`:

**Detection Metrics:**
- `recallbricks_relationship_detection_attempts_total` - Total attempts by status
- `recallbricks_relationship_detection_duration_seconds` - Detection duration
- `recallbricks_relationships_detected_total` - Total relationships by type

**Claude API Metrics:**
- `recallbricks_claude_api_calls_total` - API calls by model and status
- `recallbricks_claude_api_latency_seconds` - API response latency

**Circuit Breaker Metrics:**
- `recallbricks_circuit_breaker_state` - Current circuit state
- `recallbricks_circuit_breaker_failures_total` - Failure count

### Structured Logging

All operations are logged with structured JSON:

```json
{
  "timestamp": "2025-01-13T10:30:00.000Z",
  "level": "info",
  "message": "Relationship detection completed successfully",
  "memoryId": "123",
  "relationshipsFound": 3,
  "relationshipsStored": 3,
  "processingTimeMs": 1245
}
```

## Cost Estimation

Using Claude 3 Haiku:
- **Input**: ~$0.25 per 1M tokens
- **Output**: ~$1.25 per 1M tokens

**Example calculation for 1,000 memories/day:**
- Average input: ~2,000 tokens per detection (new memory + 50 recent memories)
- Average output: ~300 tokens (JSON relationships)
- Daily cost: ~$1.00
- Monthly cost: ~$30

## Error Handling

The system is designed to **never** block memory creation:

1. ✅ If Claude API is down → Circuit breaker opens, future calls fail fast
2. ✅ If detection fails → Logged but memory creation succeeds
3. ✅ If database insert fails → Logged, detection can be retried manually
4. ✅ If API key missing → Feature disabled, logs warning on startup

## Testing

Test the implementation:

```bash
# 1. Create a memory
curl -X POST "http://localhost:8080/api/v1/memories" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Implemented PostgreSQL connection pooling with pg-pool"
  }'

# Response: {"id": "123", ...}

# 2. Create another related memory
curl -X POST "http://localhost:8080/api/v1/memories" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Configured pgBouncer for connection management"
  }'

# 3. Check relationships (wait ~2-5 seconds for async processing)
curl -X GET "http://localhost:8080/api/v1/relationships/memory/123" \
  -H "X-API-Key: your-api-key"

# 4. Check service health
curl -X GET "http://localhost:8080/api/v1/relationships/health" \
  -H "X-API-Key: your-api-key"
```

## Troubleshooting

### Issue: Relationships not being detected

**Check:**
1. Verify `ANTHROPIC_API_KEY` is set correctly
2. Check service health: `GET /api/v1/relationships/health`
3. Review logs for errors: `grep "relationship detection" logs/app.log`
4. Verify circuit breaker is not open

### Issue: Circuit breaker opened

**Solution:**
```bash
# Check circuit breaker state
curl http://localhost:8080/health/detailed

# Wait for timeout (default: 60 seconds) or adjust:
RELATIONSHIP_CB_TIMEOUT=30000  # 30 seconds
```

### Issue: Too many/few relationships detected

**Adjust thresholds:**
```bash
RELATIONSHIP_MIN_STRENGTH=0.8  # Increase for fewer, higher-quality relationships
RELATIONSHIP_MAX_COUNT=5       # Limit total relationships per memory
```

## Performance Tuning

### High Volume (1000+ memories/day)

```bash
# Reduce memory limit to speed up processing
RELATIONSHIP_MEMORY_LIMIT=20

# Increase circuit breaker threshold
RELATIONSHIP_CB_THRESHOLD=10

# Reduce retries
RELATIONSHIP_MAX_RETRIES=2
```

### High Accuracy Requirements

```bash
# Analyze more memories
RELATIONSHIP_MEMORY_LIMIT=100

# Higher strength threshold
RELATIONSHIP_MIN_STRENGTH=0.8

# More relationships
RELATIONSHIP_MAX_COUNT=15
```

## Security

- ✅ All endpoints require API key authentication
- ✅ Input sanitization prevents injection attacks
- ✅ Explanations stripped of HTML/control characters
- ✅ Rate limiting applied via global middleware
- ✅ User isolation enforced at database level

## Future Enhancements

Potential improvements:
- [ ] Bidirectional relationships (A→B and B→A)
- [ ] Batch processing for existing memories
- [ ] Webhook notifications for relationship detection
- [ ] Relationship strength recalibration over time
- [ ] Custom relationship types via user configuration
- [ ] Relationship visualization UI component

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/recallbricks-api
- Documentation: https://docs.recallbricks.com
- Email: support@recallbricks.com

# RecallBricks Metacognition API - Phase 1

Complete API documentation for self-optimizing memory features.

## Overview

Phase 1 adds metacognitive capabilities to RecallBricks, enabling the system to:
- Track which memories are accessed and how often
- Learn from user feedback
- Optimize search results based on usage patterns
- Identify relationship patterns automatically
- Provide insights on its own performance

All features are **backward compatible** - existing API calls work unchanged.

---

## Table of Contents

1. [Enhanced Memory Endpoints](#enhanced-memory-endpoints)
2. [Search with Learning](#search-with-learning)
3. [Feedback System](#feedback-system)
4. [Pattern Analysis](#pattern-analysis)
5. [Learning Jobs](#learning-jobs)
6. [Database Schema](#database-schema)
7. [Examples](#examples)

---

## Enhanced Memory Endpoints

### GET /api/v1/memories/:id

Retrieve a single memory by ID. Now includes usage tracking and learning metadata.

**Authentication:** Required (JWT or API Key)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `context` | string | Optional context for tracking (e.g., "pricing_query", "feature_lookup") |

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "text": "Memory content",
  "source": "api",
  "project_id": "default",
  "tags": ["pricing", "features"],
  "metadata": {},
  "created_at": "2025-11-17T20:00:00Z",
  "updated_at": "2025-11-17T20:00:00Z",

  // New metacognitive fields
  "usage_count": 42,
  "last_accessed": "2025-11-17T20:30:00Z",
  "helpfulness_score": 0.85,
  "access_pattern": {
    "contexts": {
      "pricing_query": 15,
      "feature_lookup": 27
    }
  },
  "learning_metadata": {
    "access_frequency": "high",
    "recency_score": 1.0,
    "days_since_access": 0,
    "relationship_count": 5
  }
}
```

**Behavior Changes:**
- Every access increments `usage_count`
- Updates `last_accessed` timestamp
- If `context` provided, logs it in `access_pattern.contexts`
- Returns computed `learning_metadata` from analytics view

**Example:**
```bash
curl -X GET "http://localhost:8080/api/v1/memories/abc123?context=pricing_query" \
  -H "X-API-Key: your-api-key"
```

---

## Search with Learning

### POST /api/v1/memories/search

Semantic search with optional usage-based weighting and learning features.

**Authentication:** Required (JWT or API Key)

**Request Body:**
```json
{
  "query": "pricing information",
  "limit": 10,

  // New metacognitive options
  "weight_by_usage": true,
  "decay_old_memories": true,
  "learning_mode": true,
  "min_helpfulness_score": 0.7
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query text |
| `limit` | number | 10 | Maximum results to return |
| `weight_by_usage` | boolean | false | Boost frequently-used memories in results |
| `decay_old_memories` | boolean | false | Penalize stale memories (not accessed in 90+ days) |
| `learning_mode` | boolean | false | Track which results are used (increments usage) |
| `min_helpfulness_score` | number | - | Filter results below this helpfulness threshold (0.0-1.0) |

**Weighting Algorithm:**

When `weight_by_usage=true`:
```
weighted_score = base_similarity × (1 + log(usage_count + 1)) × helpfulness_score
```

When `decay_old_memories=true`:
- Recent (≤7 days): +20% boost
- Mid-range (7-90 days): No change
- Stale (≥90 days): -30% penalty

**Response:**
```json
{
  "memories": [
    {
      "id": "uuid",
      "text": "Memory content",
      "base_similarity": 0.85,
      "weighted_score": 1.23,
      "boosted_by_usage": true,
      "boosted_by_recency": true,
      "penalized_by_age": false,
      "usage_count": 50,
      "helpfulness_score": 0.9,
      "access_frequency": "high"
    }
  ],
  "count": 10,
  "query": "pricing information",
  "weighted": true,
  "learning_mode": true
}
```

**Examples:**

**Basic Search (Unchanged):**
```bash
curl -X POST http://localhost:8080/api/v1/memories/search \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pricing information",
    "limit": 10
  }'
```

**Weighted Search with Learning:**
```bash
curl -X POST http://localhost:8080/api/v1/memories/search \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pricing information",
    "limit": 10,
    "weight_by_usage": true,
    "decay_old_memories": true,
    "learning_mode": true,
    "min_helpfulness_score": 0.7
  }'
```

---

## Feedback System

### POST /api/v1/memories/:id/feedback

Submit feedback on memory helpfulness to improve future recommendations.

**Authentication:** Required (JWT or API Key)

**Request Body:**
```json
{
  "helpful": true,
  "context": "Used to answer pricing question",
  "user_satisfaction": 0.8
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `helpful` | boolean | ✅ | Whether the memory was helpful |
| `context` | string | ❌ | Description of how it was used |
| `user_satisfaction` | number | ❌ | Explicit satisfaction score (0.0-1.0) |

**Scoring Logic:**

**Simple Feedback:**
- `helpful=true`: score += 0.1 (capped at 1.0)
- `helpful=false`: score -= 0.05 (floored at 0.0)

**With User Satisfaction:**
Uses exponential moving average (EMA):
```
new_score = 0.3 × user_satisfaction + 0.7 × current_score
```

**Response:**
```json
{
  "success": true,
  "memory_id": "uuid",
  "new_helpfulness_score": 0.85,
  "feedback": {
    "helpful": true,
    "context": "Used to answer pricing question",
    "user_satisfaction": 0.8
  }
}
```

**Examples:**

**Positive Feedback:**
```bash
curl -X POST http://localhost:8080/api/v1/memories/abc123/feedback \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "helpful": true,
    "context": "Very useful for pricing questions"
  }'
```

**Negative Feedback:**
```bash
curl -X POST http://localhost:8080/api/v1/memories/abc123/feedback \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "helpful": false,
    "context": "Not relevant to my query"
  }'
```

**With Satisfaction Score:**
```bash
curl -X POST http://localhost:8080/api/v1/memories/abc123/feedback \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "helpful": true,
    "user_satisfaction": 0.95
  }'
```

---

## Pattern Analysis

### GET /api/v1/memories/meta/patterns

Analyze usage patterns and get learning insights.

**Authentication:** Required (JWT or API Key)

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | 30 | Time window for analysis (in days) |

**Response:**
```json
{
  "most_useful_tags": [
    {
      "tag": "pricing",
      "avg_helpfulness": 0.92,
      "usage_count": 150
    }
  ],
  "frequently_accessed_together": [
    {
      "memory_id_1": "uuid-1",
      "memory_id_2": "uuid-2",
      "co_access_count": 15
    }
  ],
  "underutilized_memories": [
    {
      "id": "uuid",
      "text": "Old memory not accessed...",
      "days_since_access": 120,
      "usage_count": 0
    }
  ],
  "access_time_patterns": {
    "hourly_distribution": {
      "0": 5,
      "1": 2,
      "9": 45,
      "14": 78
    },
    "daily_distribution": {
      "monday": 120,
      "tuesday": 95
    }
  },
  "optimal_relationship_types": {
    "contradicts": 0.85,
    "caused_by": 0.92,
    "similar_to": 0.78
  },
  "summary": {
    "total_memories": 500,
    "total_accesses": 2500,
    "avg_helpfulness": 0.75,
    "active_memories": 320,
    "stale_memories": 45
  }
}
```

**Use Cases:**
- Identify which tags lead to most useful memories
- Find memories frequently used together (suggests creating relationships)
- Discover unused memories that could be archived
- Understand which relationship types are most valuable

**Example:**
```bash
curl -X GET "http://localhost:8080/api/v1/memories/meta/patterns?days=30" \
  -H "X-API-Key: your-api-key"
```

---

## Learning Jobs

### POST /api/v1/learning/analyze

Trigger on-demand learning analysis to discover patterns and suggest optimizations.

**Authentication:** Required (JWT or API Key)

**Request Body:**
```json
{
  "auto_apply": false
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `auto_apply` | boolean | false | Automatically create high-confidence relationships (≥0.75) |

**Response:**
```json
{
  "success": true,
  "result": {
    "timestamp": "2025-11-17T20:30:00Z",
    "clusters_detected": 12,
    "relationship_suggestions": [
      {
        "memory_id": "uuid-1",
        "related_memory_id": "uuid-2",
        "suggested_type": "related_to",
        "confidence": 0.82,
        "reason": "Co-accessed 15 times, 2 common tags",
        "co_access_count": 15
      }
    ],
    "weight_adjustments": {
      "contradicts": 0.85,
      "caused_by": 0.92,
      "similar_to": 0.78,
      "follows": 0.81,
      "related_to": 0.75
    },
    "stale_memory_count": 23,
    "processing_time_ms": 1250
  }
}
```

**What It Does:**
1. **Cluster Detection**: Finds memories frequently accessed together
2. **Relationship Suggestions**: Proposes new relationships based on co-access patterns
3. **Weight Optimization**: Calculates which relationship types are most useful
4. **Stale Memory Detection**: Identifies memories not accessed in 180+ days

**Example:**
```bash
curl -X POST http://localhost:8080/api/v1/learning/analyze \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "auto_apply": false
  }'
```

**With Auto-Apply (creates relationships automatically):**
```bash
curl -X POST http://localhost:8080/api/v1/learning/analyze \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "auto_apply": true
  }'
```

### POST /api/v1/learning/apply-suggestions

Manually apply relationship suggestions from a previous analysis.

**Request Body:**
```json
{
  "suggestions": [
    {
      "memory_id": "uuid-1",
      "related_memory_id": "uuid-2",
      "suggested_type": "related_to",
      "confidence": 0.82,
      "reason": "Co-accessed 15 times"
    }
  ],
  "min_confidence": 0.75
}
```

**Response:**
```json
{
  "success": true,
  "applied_count": 5,
  "total_suggestions": 12
}
```

### GET /api/v1/learning/status

Get status of the learning system.

**Response:**
```json
{
  "enabled": true,
  "last_run": "2025-11-17T19:00:00Z",
  "next_scheduled_run": "2025-11-17T20:00:00Z",
  "status": "available"
}
```

---

## Database Schema

### New Columns in `memories` Table

```sql
ALTER TABLE memories
ADD COLUMN usage_count INTEGER DEFAULT 0,
ADD COLUMN last_accessed TIMESTAMP WITH TIME ZONE,
ADD COLUMN helpfulness_score FLOAT DEFAULT 0.5,
ADD COLUMN access_pattern JSONB DEFAULT '{}';
```

### New Database Functions

**increment_memory_usage(memory_id, context)**
- Atomically increments usage_count
- Updates last_accessed timestamp
- Logs context in access_pattern JSON

**update_helpfulness_score(memory_id, helpful, user_satisfaction)**
- Updates helpfulness score based on feedback
- Uses exponential moving average for satisfaction scores
- Returns new score

### New View: `memory_analytics`

Provides computed metrics:
- `access_frequency`: 'unused' | 'low' | 'medium' | 'high' | 'very_high'
- `recency_score`: 0.0-1.0 (1.0 = accessed today, 0.3 = 90+ days)
- `days_since_access`: Days since last access
- `relationship_count`: Number of relationships

---

## Configuration

### Environment Variables

```env
# Learning Scheduler
ENABLE_LEARNING_SCHEDULER=true       # Enable/disable scheduler
LEARNING_INTERVAL_HOURS=1            # How often to run (default: 1 hour)
LEARNING_AUTO_APPLY=false            # Auto-create relationships (default: false)
```

### Scheduler Behavior

When enabled, the scheduler:
- Runs immediately on startup
- Runs every N hours (configurable)
- Analyzes co-access patterns
- Suggests new relationships
- Calculates relationship type performance
- Identifies stale memories

**To disable:**
```env
ENABLE_LEARNING_SCHEDULER=false
```

---

## Examples

### Complete Workflow

**1. Create and use memories:**
```bash
# Create memory
MEMORY_ID=$(curl -X POST http://localhost:8080/api/v1/memories \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "Our pricing is $99/month", "tags": ["pricing"]}' \
  | jq -r '.id')

# Access it multiple times
curl -X GET "http://localhost:8080/api/v1/memories/$MEMORY_ID?context=pricing_query" \
  -H "X-API-Key: $API_KEY"
```

**2. Provide feedback:**
```bash
curl -X POST "http://localhost:8080/api/v1/memories/$MEMORY_ID/feedback" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"helpful": true, "user_satisfaction": 0.9}'
```

**3. Use weighted search:**
```bash
curl -X POST http://localhost:8080/api/v1/memories/search \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pricing",
    "weight_by_usage": true,
    "decay_old_memories": true
  }'
```

**4. Analyze patterns:**
```bash
curl -X GET http://localhost:8080/api/v1/memories/meta/patterns \
  -H "X-API-Key: $API_KEY"
```

**5. Trigger learning:**
```bash
curl -X POST http://localhost:8080/api/v1/learning/analyze \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"auto_apply": false}'
```

---

## Migration Guide

### For Existing Deployments

1. **Run the migration:**
   ```bash
   # Execute migrations/20251117_add_metacognitive_tracking.sql
   # in your Supabase SQL Editor
   ```

2. **Verify migration:**
   ```sql
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'memories'
   AND column_name IN ('usage_count', 'last_accessed', 'helpfulness_score', 'access_pattern');
   ```

3. **Update application:**
   ```bash
   npm install  # Update dependencies
   npm run build
   npm start
   ```

4. **Verify endpoints:**
   ```bash
   curl http://localhost:8080/  # Should show metacognition features
   ```

### Backward Compatibility

All changes are **100% backward compatible**:
- ✅ Existing API calls work unchanged
- ✅ New fields have defaults (no NULL errors)
- ✅ New parameters are optional
- ✅ Response format unchanged (new fields are additions)

---

## Performance Considerations

### Indexing

Migration creates indexes on:
- `last_accessed` (for time-based queries)
- `helpfulness_score` (for filtering)
- `usage_count` (for sorting)
- Composite index `(helpfulness_score, last_accessed)` (for weighted search)

### Query Optimization

**Weighted search** fetches 3x results when weighting is enabled, then re-ranks and trims. This ensures accurate weighting while maintaining performance.

**Analytics view** is pre-computed, so no runtime calculations needed for `learning_metadata`.

### Async Operations

- Usage tracking is **fire-and-forget** (doesn't block response)
- Learning mode tracking is **async**
- Pattern analysis runs in **background job**

---

## Security

- All endpoints require authentication (JWT or API Key)
- User isolation enforced (can't access other users' memories)
- Input validation on all parameters
- Rate limiting applies to all endpoints
- SQL injection protection via parameterized queries

---

## Troubleshooting

### High usage_count but low helpfulness_score
- System is being used but not providing value
- Consider reviewing memory quality or search relevance

### Weighted search returns same results as unweighted
- Memories may not have been accessed yet (usage_count = 0)
- Try accessing memories first to build usage data

### Pattern analysis returns empty suggestions
- Need more co-access data (use learning_mode in search)
- Consider lowering threshold in analyzeUsagePatterns()

### Learning scheduler not running
- Check `ENABLE_LEARNING_SCHEDULER` environment variable
- Verify logs: `grep "Learning scheduler" logs/app.log`

---

## Next Steps (Phase 2 Preview)

Future enhancements:
- **Predictive Recall**: Suggest memories before user searches
- **Context Awareness**: Learn from query patterns
- **Auto-Archival**: Automatically archive unused memories
- **Relationship Strength Learning**: Adjust relationship weights dynamically
- **Personalized Weighting**: Per-user learning profiles

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/recallbricks-api/issues
- Documentation: Full API docs at `/api/v1/docs`
- Health Check: `GET /health/ready`

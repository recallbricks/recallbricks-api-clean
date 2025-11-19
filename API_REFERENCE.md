# RecallBricks API v2.1 - Complete Reference

Production-grade memory management API with self-optimizing intelligence.

**Base URL:** `https://your-api-domain.com` or `http://localhost:8080`

**API Version:** v2.1.0

---

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limiting](#rate-limiting)
3. [Error Handling](#error-handling)
4. [Pagination](#pagination)
5. [Memory Endpoints](#memory-endpoints)
6. [Search Endpoints](#search-endpoints)
7. [Context Endpoints](#context-endpoints)
8. [Metacognition Endpoints](#metacognition-endpoints)
9. [Learning Endpoints](#learning-endpoints)
10. [Relationship Endpoints](#relationship-endpoints)
11. [Collaboration Endpoints](#collaboration-endpoints)
12. [Monitoring Endpoints](#monitoring-endpoints)
13. [Health Check Endpoints](#health-check-endpoints)

---

## Authentication

All API endpoints (except health checks) require authentication via API key.

### API Key Authentication

Include your API key in the `X-API-Key` header:

```bash
curl https://api.yourdomain.com/api/v1/memories \
  -H "X-API-Key: your-api-key-here"
```

### JWT Authentication (Optional)

Alternatively, use JWT tokens in the `Authorization` header:

```bash
curl https://api.yourdomain.com/api/v1/memories \
  -H "Authorization: Bearer your-jwt-token"
```

### Error Responses

**401 Unauthorized** - Missing API key
```json
{
  "error": {
    "code": "MISSING_API_KEY",
    "message": "API key required. Provide X-API-Key header.",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-11-18T12:34:56.789Z"
  }
}
```

**403 Forbidden** - Invalid API key
```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "Invalid API key provided.",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-11-18T12:34:56.789Z"
  }
}
```

---

## Rate Limiting

Rate limits are enforced per API key with different tiers:

| Plan | Rate Limit | Cost Multiplier |
|------|------------|-----------------|
| Free | 100 requests/hour | POST=2x, PUT/DELETE=1.4x |
| Pro | 1,000 requests/hour | POST=2x, PUT/DELETE=1.4x |
| Team | 5,000 requests/hour | POST=2x, PUT/DELETE=1.4x |
| Enterprise | 50,000 requests/hour | POST=2x, PUT/DELETE=1.4x |

Additionally, a global rate limit of **1,000 requests/minute** applies across all users.

### Rate Limit Headers

Every response includes rate limit headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 998
X-RateLimit-Reset: 2025-11-18T13:00:00.000Z
```

### Rate Limit Exceeded

**429 Too Many Requests**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 3600 seconds.",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-11-18T12:34:56.789Z"
  }
}
```

Response includes `Retry-After` header with seconds to wait.

### Check Rate Limit Status

```http
GET /api/v1/rate-limit
```

**Response:**
```json
{
  "limit": 1000,
  "remaining": 998,
  "reset": "2025-11-18T13:00:00.000Z"
}
```

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "additional context"
    },
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-11-18T12:34:56.789Z"
  }
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `MISSING_API_KEY` | 401 | API key not provided |
| `INVALID_API_KEY` | 403 | API key is invalid |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_TEXT_LENGTH` | 400 | Text exceeds maximum length |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `RESOURCE_NOT_FOUND` | 404 | Resource doesn't exist |
| `ROUTE_NOT_FOUND` | 404 | Endpoint doesn't exist |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `DATABASE_CONNECTION_FAILED` | 503 | Can't connect to database |
| `CIRCUIT_BREAKER_OPEN` | 503 | Service temporarily unavailable |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

---

## Pagination

List endpoints support pagination via query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 10 | Number of items per page (1-100) |
| `offset` | integer | 0 | Number of items to skip |

**Example:**
```bash
curl "https://api.yourdomain.com/api/v1/memories?limit=20&offset=40" \
  -H "X-API-Key: your-key"
```

---

## Memory Endpoints

### Create Memory

Create a new memory with automatic embedding generation.

```http
POST /api/v1/memories
```

**Request Body:**
```json
{
  "text": "Our API supports semantic search and intelligent context retrieval.",
  "source": "documentation",
  "project_id": "my-project",
  "tags": ["api", "features"],
  "metadata": {
    "author": "John Doe",
    "version": "2.1"
  }
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | ✅ | Memory content (max 10,000 chars) |
| `source` | string | ❌ | Source identifier (default: "api") |
| `project_id` | string | ❌ | Project identifier (default: "default") |
| `tags` | array | ❌ | Tags for categorization |
| `metadata` | object | ❌ | Additional metadata (JSON object) |

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-uuid",
  "text": "Our API supports semantic search and intelligent context retrieval.",
  "source": "documentation",
  "project_id": "my-project",
  "tags": ["api", "features"],
  "metadata": {
    "author": "John Doe",
    "version": "2.1"
  },
  "created_at": "2025-11-18T12:34:56.789Z",
  "updated_at": "2025-11-18T12:34:56.789Z",
  "usage_count": 0,
  "last_accessed": null,
  "helpfulness_score": 0.5,
  "access_pattern": {}
}
```

**Example:**
```bash
curl -X POST https://api.yourdomain.com/api/v1/memories \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Our API supports semantic search and intelligent context retrieval.",
    "tags": ["api", "features"]
  }'
```

---

### List Memories

Retrieve a paginated list of all memories.

```http
GET /api/v1/memories
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 10 | Items per page (1-100) |
| `offset` | integer | 0 | Items to skip |
| `project_id` | string | - | Filter by project |
| `tags` | string | - | Filter by tags (comma-separated) |

**Response:** `200 OK`
```json
{
  "memories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "text": "Memory content...",
      "tags": ["api", "features"],
      "created_at": "2025-11-18T12:34:56.789Z",
      "usage_count": 5,
      "helpfulness_score": 0.75
    }
  ],
  "count": 1,
  "total": 100,
  "limit": 10,
  "offset": 0
}
```

**Example:**
```bash
curl "https://api.yourdomain.com/api/v1/memories?limit=20&tags=api,features" \
  -H "X-API-Key: your-key"
```

---

### Get Memory by ID

Retrieve a single memory. Automatically tracks usage.

```http
GET /api/v1/memories/:id
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `context` | string | Optional context for tracking (e.g., "pricing_query") |

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-uuid",
  "text": "Memory content...",
  "source": "api",
  "project_id": "default",
  "tags": ["api"],
  "metadata": {},
  "created_at": "2025-11-18T12:34:56.789Z",
  "updated_at": "2025-11-18T12:34:56.789Z",
  "usage_count": 42,
  "last_accessed": "2025-11-18T12:40:00.789Z",
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

**Example:**
```bash
curl "https://api.yourdomain.com/api/v1/memories/550e8400-e29b-41d4-a716-446655440000?context=pricing_query" \
  -H "X-API-Key: your-key"
```

---

### Update Memory

Update an existing memory.

```http
PUT /api/v1/memories/:id
```

**Request Body:**
```json
{
  "text": "Updated memory content",
  "tags": ["updated", "api"],
  "metadata": {
    "version": "2.2"
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "text": "Updated memory content",
  "tags": ["updated", "api"],
  "metadata": {
    "version": "2.2"
  },
  "updated_at": "2025-11-18T12:45:00.789Z"
}
```

**Example:**
```bash
curl -X PUT https://api.yourdomain.com/api/v1/memories/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Updated memory content"}'
```

---

### Delete Memory

Delete a memory permanently.

```http
DELETE /api/v1/memories/:id
```

**Response:** `200 OK`
```json
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Memory deleted successfully"
}
```

**Example:**
```bash
curl -X DELETE https://api.yourdomain.com/api/v1/memories/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-API-Key: your-key"
```

---

## Search Endpoints

### Semantic Search

Search memories using vector similarity with optional metacognitive weighting.

```http
POST /api/v1/memories/search
```

**Request Body:**
```json
{
  "query": "pricing information",
  "limit": 10,
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
| `limit` | integer | 10 | Maximum results (1-100) |
| `weight_by_usage` | boolean | false | Boost frequently-used memories |
| `decay_old_memories` | boolean | false | Penalize stale memories (90+ days) |
| `learning_mode` | boolean | false | Track result usage |
| `min_helpfulness_score` | number | - | Filter by helpfulness (0.0-1.0) |
| `project_id` | string | - | Filter by project |
| `tags` | array | - | Filter by tags |

**Response:** `200 OK`
```json
{
  "memories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "text": "Our pricing is $99/month for Pro tier",
      "base_similarity": 0.85,
      "weighted_score": 1.23,
      "boosted_by_usage": true,
      "boosted_by_recency": true,
      "penalized_by_age": false,
      "usage_count": 50,
      "helpfulness_score": 0.9,
      "access_frequency": "high",
      "tags": ["pricing"],
      "created_at": "2025-11-18T12:00:00.789Z"
    }
  ],
  "count": 1,
  "query": "pricing information",
  "weighted": true,
  "learning_mode": true
}
```

**Weighting Algorithm:**

When `weight_by_usage=true`:
```
weighted_score = base_similarity × (1 + log(usage_count + 1)) × helpfulness_score
```

When `decay_old_memories=true`:
- Recent (≤7 days): +20% boost
- Mid-range (7-90 days): No change
- Stale (≥90 days): -30% penalty

**Example:**
```bash
curl -X POST https://api.yourdomain.com/api/v1/memories/search \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pricing information",
    "weight_by_usage": true,
    "decay_old_memories": true,
    "min_helpfulness_score": 0.7
  }'
```

---

## Context Endpoints

### Get Intelligent Context

Retrieve contextually relevant memories with automatic summarization.

```http
POST /api/v1/context
```

**Request Body:**
```json
{
  "query": "Tell me about our API features",
  "limit": 5,
  "conversation_history": [
    {"role": "user", "content": "What is RecallBricks?"},
    {"role": "assistant", "content": "RecallBricks is a memory management API..."}
  ]
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Context query |
| `limit` | integer | ❌ | Max memories to retrieve (default: 5) |
| `conversation_history` | array | ❌ | Previous conversation turns |

**Response:** `200 OK`
```json
{
  "context": "RecallBricks API supports semantic search, intelligent context retrieval...",
  "memories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "text": "Our API supports semantic search...",
      "similarity": 0.92,
      "tags": ["api", "features"]
    }
  ],
  "query": "Tell me about our API features"
}
```

---

## Metacognition Endpoints

### Submit Feedback

Provide feedback on memory helpfulness to improve future recommendations.

```http
POST /api/v1/memories/:id/feedback
```

**Request Body:**
```json
{
  "helpful": true,
  "context": "Used to answer pricing question",
  "user_satisfaction": 0.9
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `helpful` | boolean | ✅ | Whether memory was helpful |
| `context` | string | ❌ | Description of usage |
| `user_satisfaction` | number | ❌ | Explicit satisfaction (0.0-1.0) |

**Scoring Logic:**

**Simple feedback:**
- `helpful=true`: score += 0.1 (capped at 1.0)
- `helpful=false`: score -= 0.05 (floored at 0.0)

**With satisfaction score:**
```
new_score = 0.3 × user_satisfaction + 0.7 × current_score
```

**Response:** `200 OK`
```json
{
  "success": true,
  "memory_id": "550e8400-e29b-41d4-a716-446655440000",
  "new_helpfulness_score": 0.85,
  "feedback": {
    "helpful": true,
    "context": "Used to answer pricing question",
    "user_satisfaction": 0.9
  }
}
```

**Example:**
```bash
curl -X POST https://api.yourdomain.com/api/v1/memories/550e8400-e29b-41d4-a716-446655440000/feedback \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "helpful": true,
    "user_satisfaction": 0.9
  }'
```

---

### Analyze Patterns

Get insights on memory usage patterns.

```http
GET /api/v1/memories/meta/patterns
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | 30 | Time window for analysis |

**Response:** `200 OK`
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

**Example:**
```bash
curl "https://api.yourdomain.com/api/v1/memories/meta/patterns?days=30" \
  -H "X-API-Key: your-key"
```

---

## Learning Endpoints

### Trigger Learning Analysis

Run on-demand pattern analysis to discover insights and suggest optimizations.

```http
POST /api/v1/learning/analyze
```

**Request Body:**
```json
{
  "auto_apply": false
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `auto_apply` | boolean | false | Auto-create high-confidence relationships (≥0.75) |

**Response:** `200 OK`
```json
{
  "success": true,
  "result": {
    "timestamp": "2025-11-18T12:30:00.789Z",
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
      "similar_to": 0.78
    },
    "stale_memory_count": 23,
    "processing_time_ms": 1250
  }
}
```

**Example:**
```bash
curl -X POST https://api.yourdomain.com/api/v1/learning/analyze \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"auto_apply": false}'
```

---

### Apply Relationship Suggestions

Manually apply relationship suggestions from learning analysis.

```http
POST /api/v1/learning/apply-suggestions
```

**Request Body:**
```json
{
  "suggestions": [
    {
      "memory_id": "uuid-1",
      "related_memory_id": "uuid-2",
      "suggested_type": "related_to",
      "confidence": 0.82
    }
  ],
  "min_confidence": 0.75
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "applied_count": 5,
  "total_suggestions": 12
}
```

---

### Get Learning Status

Check the status of the learning system.

```http
GET /api/v1/learning/status
```

**Response:** `200 OK`
```json
{
  "enabled": true,
  "last_run": "2025-11-18T11:00:00.789Z",
  "next_scheduled_run": "2025-11-18T12:00:00.789Z",
  "status": "available"
}
```

---

### Get Learning Metrics

View learning system performance metrics.

```http
GET /api/v1/learning/metrics
```

**Response:** `200 OK`
```json
{
  "total_analyses": 245,
  "total_suggestions": 1520,
  "suggestions_applied": 892,
  "acceptance_rate": 0.587,
  "avg_processing_time_ms": 1150,
  "last_analysis": "2025-11-18T11:00:00.789Z"
}
```

---

### Get Maintenance Suggestions

Get recommendations for memory maintenance.

```http
GET /api/v1/learning/maintenance-suggestions
```

**Response:** `200 OK`
```json
{
  "archive_candidates": [
    {
      "id": "uuid",
      "text": "Old memory...",
      "days_since_access": 180,
      "usage_count": 0,
      "reason": "Not accessed in 6 months"
    }
  ],
  "quality_issues": [
    {
      "id": "uuid",
      "text": "Low quality memory...",
      "helpfulness_score": 0.15,
      "reason": "Consistently marked unhelpful"
    }
  ],
  "merge_candidates": [
    {
      "memory_id_1": "uuid-1",
      "memory_id_2": "uuid-2",
      "similarity": 0.95,
      "reason": "Nearly identical content"
    }
  ]
}
```

---

## Relationship Endpoints

### Get Memory Relationships

Get all relationships for a specific memory.

```http
GET /api/v1/relationships/memory/:memoryId
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `depth` | integer | Relationship depth (1-3, default: 1) |
| `types` | string | Filter by types (comma-separated) |

**Response:** `200 OK`
```json
{
  "memory_id": "uuid",
  "relationships": [
    {
      "id": "rel-uuid",
      "from_memory_id": "uuid-1",
      "to_memory_id": "uuid-2",
      "type": "related_to",
      "strength": 0.85,
      "metadata": {},
      "created_at": "2025-11-18T12:00:00.789Z"
    }
  ],
  "count": 5
}
```

---

### Get Relationship Graph

Get the full relationship graph for a memory.

```http
GET /api/v1/relationships/graph/:memoryId
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `depth` | integer | 2 | Graph depth (1-5) |
| `max_nodes` | integer | 50 | Max nodes to include |

**Response:** `200 OK`
```json
{
  "memory_id": "uuid",
  "graph": {
    "nodes": [
      {
        "id": "uuid",
        "text": "Memory content...",
        "tags": ["api"],
        "usage_count": 10,
        "helpfulness_score": 0.8
      }
    ],
    "edges": [
      {
        "from": "uuid-1",
        "to": "uuid-2",
        "type": "related_to",
        "strength": 0.85
      }
    ]
  },
  "depth": 2,
  "node_count": 15,
  "edge_count": 22
}
```

---

### Get Relationship Types

Get all available relationship types.

```http
GET /api/v1/relationships/types
```

**Response:** `200 OK`
```json
{
  "types": [
    {
      "name": "related_to",
      "description": "General relationship",
      "default_strength": 0.5
    },
    {
      "name": "contradicts",
      "description": "Contradictory information",
      "default_strength": 0.8
    },
    {
      "name": "supports",
      "description": "Supporting evidence",
      "default_strength": 0.7
    },
    {
      "name": "caused_by",
      "description": "Causal relationship",
      "default_strength": 0.75
    }
  ]
}
```

---

### Delete Relationship

Delete a specific relationship.

```http
DELETE /api/v1/relationships/:relationshipId
```

**Response:** `200 OK`
```json
{
  "success": true,
  "relationship_id": "rel-uuid",
  "message": "Relationship deleted successfully"
}
```

---

## Collaboration Endpoints

### Register Agent

Register a new AI agent for collaboration.

```http
POST /api/v1/collaboration/agents
```

**Request Body:**
```json
{
  "name": "ResearchBot",
  "capabilities": ["research", "analysis"],
  "metadata": {
    "model": "gpt-4",
    "version": "1.0"
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "agent-uuid",
  "name": "ResearchBot",
  "capabilities": ["research", "analysis"],
  "reputation_score": 0.5,
  "created_at": "2025-11-18T12:00:00.789Z"
}
```

---

### List Agents

Get all registered agents.

```http
GET /api/v1/collaboration/agents
```

**Response:** `200 OK`
```json
{
  "agents": [
    {
      "id": "agent-uuid",
      "name": "ResearchBot",
      "reputation_score": 0.85,
      "contribution_count": 150,
      "created_at": "2025-11-18T12:00:00.789Z"
    }
  ],
  "count": 1
}
```

---

### Contribute Knowledge

Submit a knowledge contribution from an agent.

```http
POST /api/v1/collaboration/contribute
```

**Request Body:**
```json
{
  "agent_id": "agent-uuid",
  "memory_id": "memory-uuid",
  "contribution_type": "enhancement",
  "content": {
    "additional_context": "This feature was added in v2.0"
  }
}
```

**Response:** `201 Created`
```json
{
  "contribution_id": "contrib-uuid",
  "agent_id": "agent-uuid",
  "memory_id": "memory-uuid",
  "status": "pending",
  "created_at": "2025-11-18T12:00:00.789Z"
}
```

---

### Detect Conflicts

Detect conflicts between memories or contributions.

```http
POST /api/v1/collaboration/detect-conflicts
```

**Request Body:**
```json
{
  "memory_ids": ["uuid-1", "uuid-2"]
}
```

**Response:** `200 OK`
```json
{
  "conflicts": [
    {
      "id": "conflict-uuid",
      "memory_id_1": "uuid-1",
      "memory_id_2": "uuid-2",
      "conflict_type": "contradiction",
      "severity": "high",
      "description": "Conflicting pricing information"
    }
  ],
  "count": 1
}
```

---

### Get Collaboration Dashboard

Get collaboration system overview.

```http
GET /api/v1/collaboration/dashboard
```

**Response:** `200 OK`
```json
{
  "total_agents": 5,
  "total_contributions": 250,
  "pending_validations": 12,
  "active_conflicts": 3,
  "avg_reputation": 0.78,
  "contribution_rate": 45.5
}
```

---

## Monitoring Endpoints

### Get SLA Status

Check SLA compliance metrics.

```http
GET /api/v1/monitoring/sla
```

**Response:** `200 OK`
```json
{
  "uptime_percentage": 99.95,
  "avg_response_time_ms": 45,
  "p95_response_time_ms": 120,
  "p99_response_time_ms": 250,
  "error_rate": 0.005,
  "requests_last_hour": 15420,
  "period": "last_24_hours"
}
```

---

### Get Audit Logs

Retrieve system audit logs.

```http
GET /api/v1/monitoring/audit/logs
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Max logs to return (default: 100) |
| `offset` | integer | Pagination offset |
| `action_type` | string | Filter by action type |
| `start_time` | string | Start timestamp (ISO 8601) |
| `end_time` | string | End timestamp (ISO 8601) |

**Response:** `200 OK`
```json
{
  "logs": [
    {
      "id": "log-uuid",
      "timestamp": "2025-11-18T12:00:00.789Z",
      "action_type": "memory_created",
      "user_id": "user-uuid",
      "resource_id": "memory-uuid",
      "details": {},
      "ip_address": "192.168.1.1"
    }
  ],
  "count": 100,
  "total": 5420
}
```

---

### Get Component Health

Check health of specific system components.

```http
GET /api/v1/monitoring/components/:component
```

**Components:** `database`, `learning`, `collaboration`, `relationships`

**Response:** `200 OK`
```json
{
  "component": "database",
  "status": "healthy",
  "latency_ms": 12,
  "last_check": "2025-11-18T12:00:00.789Z",
  "details": {
    "connection_pool": "healthy",
    "active_connections": 5,
    "max_connections": 20
  }
}
```

---

## Health Check Endpoints

### Liveness Check

Basic liveness probe for load balancers.

```http
GET /health
```

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "service": "RecallBricks API",
  "version": "2.1.0",
  "timestamp": "2025-11-18T12:00:00.789Z"
}
```

---

### Readiness Check

Comprehensive readiness check including database connectivity.

```http
GET /health/ready
```

**Response:** `200 OK` (if ready) or `503 Service Unavailable` (if not ready)
```json
{
  "status": "ready",
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 12
    },
    "circuit_breaker": {
      "status": "closed",
      "failures": 0
    }
  },
  "timestamp": "2025-11-18T12:00:00.789Z"
}
```

---

### Prometheus Metrics

Prometheus-formatted metrics for monitoring.

```http
GET /health/metrics
```

**Response:** `200 OK`
```
# HELP recallbricks_http_requests_total Total HTTP requests
# TYPE recallbricks_http_requests_total counter
recallbricks_http_requests_total{method="GET",path="/api/v1/memories",status="200"} 1523

# HELP recallbricks_http_request_duration_seconds HTTP request duration
# TYPE recallbricks_http_request_duration_seconds histogram
recallbricks_http_request_duration_seconds_bucket{le="0.05"} 1200
recallbricks_http_request_duration_seconds_bucket{le="0.1"} 1450
recallbricks_http_request_duration_seconds_bucket{le="0.5"} 1520
recallbricks_http_request_duration_seconds_sum 45.2
recallbricks_http_request_duration_seconds_count 1523
```

---

## Webhooks (Future)

Webhook support is planned for v2.2:
- Memory creation/update/deletion events
- Learning analysis completion
- Conflict detection alerts
- Agent reputation changes

---

## SDK Support (Future)

Official SDKs are in development:
- JavaScript/TypeScript
- Python
- Go
- Ruby

---

## Support

- **Documentation:** https://docs.recallbricks.com
- **API Status:** https://status.recallbricks.com
- **Support Email:** support@recallbricks.com
- **GitHub:** https://github.com/recallbricks/recallbricks-api

---

**Last Updated:** 2025-11-18
**API Version:** v2.1.0

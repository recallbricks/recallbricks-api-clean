# Phase 2: Predictive Recall API Documentation

## Overview

Phase 2 adds predictive and proactive capabilities to the RecallBricks memory system. The system now:

- **Predicts** which memories you'll need next based on patterns
- **Suggests** relevant memories before you ask
- **Learns** temporal patterns (time-of-day, sequences)
- **Adapts** search weights per user automatically
- **Maintains** memory health proactively
- **Tracks** its own improvement velocity

## New Endpoints

### 1. Predictive Memory Prefetching

**Endpoint:** `GET /api/v1/memories/predict`

Analyzes context and predicts which memories will likely be needed next.

**Query Parameters:**
- `current_context` (string, optional): What you're currently working on
- `recent_memories` (string, optional): Comma-separated or JSON array of recently accessed memory IDs
- `limit` (integer, optional): Number of predictions to return (default: 10)

**Example Request:**
```bash
GET /api/v1/memories/predict?current_context=pricing%20strategy&recent_memories=["abc-123","def-456"]&limit=5
```

**Response:**
```json
{
  "predictions": [
    {
      "memory_id": "xyz-789",
      "text": "Competitor pricing analysis for Q4...",
      "confidence": 0.87,
      "reasons": [
        "frequently_accessed_with",
        "related_to_relationship",
        "temporal_pattern_hourly"
      ],
      "related_to": ["abc-123"],
      "helpfulness_score": 0.82,
      "usage_count": 15
    }
  ],
  "count": 5,
  "context": "pricing strategy",
  "recent_memories": ["abc-123", "def-456"]
}
```

**How It Works:**
1. **Co-access patterns**: If you accessed memory A, predicts B, C, D
2. **Relationship strength**: Considers memory relationships
3. **Temporal patterns**: Uses time-of-day and sequence patterns
4. **Context matching**: Semantic similarity to current context
5. **Helpfulness weighting**: Boosts predictions by past helpfulness

---

### 2. Context-Aware Suggestions

**Endpoint:** `POST /api/v1/memories/suggest`

Proactively suggests relevant memories BEFORE you ask for them.

**Request Body:**
```json
{
  "context": "planning the new feature rollout",
  "include_reasoning": true,
  "limit": 5,
  "min_confidence": 0.6
}
```

**Response:**
```json
{
  "suggestions": [
    {
      "memory_id": "mem-001",
      "text": "Feature rollout checklist from last release...",
      "similarity": 0.85,
      "suggestion_score": 0.92,
      "analytics": {
        "usage_count": 23,
        "helpfulness_score": 0.88,
        "recency_score": 0.95,
        "access_frequency": "high",
        "days_since_access": 2
      },
      "reasoning": {
        "semantic_match": "high",
        "frequently_used": true,
        "recently_accessed": true,
        "high_helpfulness": true,
        "weights_applied": {
          "usage_weight": 0.32,
          "recency_weight": 0.18,
          "helpfulness_weight": 0.50,
          "relationship_weight": 0.20
        }
      },
      "related_memories": [
        {
          "related_memory_id": "mem-002",
          "relationship_type": "follows",
          "strength": 0.85
        }
      ]
    }
  ],
  "count": 5,
  "context": "planning the new feature rollout",
  "weights_used": {
    "usage_weight": 0.32,
    "recency_weight": 0.18,
    "helpfulness_weight": 0.50,
    "relationship_weight": 0.20
  },
  "min_confidence": 0.6
}
```

**Key Features:**
- Uses **adaptive per-user weights** learned from your behavior
- Includes **reasoning** explaining why each memory was suggested
- Shows **related memories** for context
- Filters by **minimum confidence threshold**

---

### 3. Proactive Maintenance Suggestions

**Endpoint:** `GET /api/v1/learning/maintenance-suggestions`

Identifies memory health issues and suggests maintenance actions.

**Response:**
```json
{
  "duplicates": [
    {
      "memory_ids": ["mem-123", "mem-456"],
      "similarity": 0.92,
      "suggestion": "merge",
      "texts": [
        "How to deploy to production using...",
        "Production deployment steps using..."
      ]
    }
  ],
  "outdated": [
    {
      "id": "mem-789",
      "text": "Old pricing model from 2023...",
      "helpfulness_score": 0.25,
      "days_since_access": 120,
      "suggestion": "update_or_remove"
    }
  ],
  "archive_candidates": [
    {
      "id": "mem-321",
      "text": "Temporary workaround for...",
      "days_since_access": 200,
      "usage_count": 0,
      "suggestion": "archive"
    }
  ],
  "broken_relationships": 3,
  "summary": {
    "total_duplicates": 5,
    "total_outdated": 8,
    "total_archive_candidates": 12,
    "total_broken_relationships": 3
  }
}
```

**What It Detects:**
- **Duplicates**: Near-identical memories (similarity >= 85%)
- **Outdated**: Low helpfulness + not accessed in 90+ days
- **Archive Candidates**: Never used + 180+ days old
- **Broken Relationships**: References to deleted memories

---

### 4. Learning Velocity Tracking

**Endpoint:** `GET /api/v1/learning/metrics`

Shows how the system is improving over time.

**Query Parameters:**
- `days` (integer, optional): Time range in days (default: 30)
- `metric_type` (string, optional): Filter by specific metric type

**Response:**
```json
{
  "time_series": [
    {
      "metric_type": "avg_helpfulness",
      "data": [
        { "value": 0.52, "recorded_at": "2025-10-20T10:00:00Z" },
        { "value": 0.58, "recorded_at": "2025-10-27T10:00:00Z" },
        { "value": 0.65, "recorded_at": "2025-11-03T10:00:00Z" }
      ]
    }
  ],
  "trends": {
    "avg_helpfulness": {
      "first_value": 0.52,
      "last_value": 0.65,
      "change": 0.13,
      "percent_change": 25.0,
      "trend": "improving",
      "data_points": 3
    }
  },
  "current_stats": {
    "avg_helpfulness": 0.68,
    "total_usage": 456,
    "active_memories": 89,
    "total_memories": 120
  },
  "learning_params": {
    "usage_weight": 0.32,
    "recency_weight": 0.18,
    "helpfulness_weight": 0.50,
    "relationship_weight": 0.20
  },
  "active_patterns": 15,
  "time_range": {
    "days": 30,
    "from": "2025-10-18T10:00:00Z",
    "to": "2025-11-18T10:00:00Z"
  }
}
```

**Tracked Metrics:**
- `search_accuracy`: How often search results are helpful
- `prediction_accuracy`: How accurate predictions are
- `avg_helpfulness`: Average helpfulness score across memories
- `user_satisfaction`: User satisfaction with results
- `relationship_quality`: Quality of detected relationships

---

### 5. Enhanced Learning Analysis

**Endpoint:** `POST /api/v1/learning/analyze-enhanced`

Runs the complete Phase 2 learning cycle including temporal pattern detection.

**Request Body:**
```json
{
  "auto_apply": false
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "timestamp": "2025-11-18T10:30:00Z",
    "phase1": {
      "clusters_detected": 12,
      "relationship_suggestions": [...],
      "weight_adjustments": {...},
      "stale_memory_count": 8
    },
    "phase2": {
      "temporal_patterns_detected": 15,
      "temporal_patterns_stored": 15,
      "duplicate_groups_found": 5,
      "duplicates": [...]
    },
    "processing_time_ms": 3456
  }
}
```

---

## Enhanced Existing Endpoints

### Updated: POST /api/v1/memories/search

Now supports **adaptive weighting** using per-user learned weights.

**New Parameter:**
- `adaptive_weights` (boolean, optional): Enable adaptive per-user weights (default: true)

**Example:**
```json
{
  "query": "database optimization",
  "limit": 10,
  "weight_by_usage": true,
  "adaptive_weights": true
}
```

When `adaptive_weights` is enabled:
- Uses your personal learned weights instead of defaults
- Weights automatically adjust based on your feedback
- Every 10 searches, weights are re-optimized

---

## How Adaptive Weighting Works

### Initial Weights (Default)
```json
{
  "usage_weight": 0.3,
  "recency_weight": 0.2,
  "helpfulness_weight": 0.5,
  "relationship_weight": 0.2
}
```

### Learning Process

1. **Feedback Collection**: When you mark memories helpful/unhelpful
2. **Pattern Detection**: System tracks which weights lead to better results
3. **Weight Adjustment**: Every 10 searches, weights are optimized
4. **Personalization**: Each user gets their own learned weights

**Example Evolution:**
```
Week 1: usage=0.30, recency=0.20, helpfulness=0.50
Week 2: usage=0.28, recency=0.22, helpfulness=0.50  (you prefer recent)
Week 4: usage=0.25, recency=0.25, helpfulness=0.50  (confirmed pattern)
```

---

## Temporal Patterns

The system learns **when** you access memories:

### Pattern Types

1. **Hourly**: "User accesses pricing memories at 9 AM"
2. **Daily**: "Code reviews happen on Fridays"
3. **Weekly**: "Planning docs accessed on Mondays"
4. **Sequence**: "After accessing A, user usually needs B then C"
5. **Co-access**: "Memories X and Y are always accessed together"

### Pattern Confidence

Confidence increases with each observation:
- 3 occurrences: confidence = 0.3
- 10 occurrences: confidence = 0.7
- 20+ occurrences: confidence = 0.9+

---

## Database Tables (Phase 2)

### temporal_patterns
Stores detected time-based access patterns.

```sql
CREATE TABLE temporal_patterns (
  id UUID PRIMARY KEY,
  user_id UUID,
  pattern_type TEXT, -- hourly, daily, sequence, etc.
  pattern_data JSONB,
  confidence FLOAT,
  occurrences INTEGER,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP
);
```

### user_learning_params
Per-user adaptive weights.

```sql
CREATE TABLE user_learning_params (
  user_id UUID PRIMARY KEY,
  usage_weight FLOAT,
  recency_weight FLOAT,
  helpfulness_weight FLOAT,
  relationship_weight FLOAT,
  total_searches INTEGER,
  positive_feedback_count INTEGER,
  avg_search_satisfaction FLOAT
);
```

### learning_metrics
Time-series tracking of system improvement.

```sql
CREATE TABLE learning_metrics (
  id UUID PRIMARY KEY,
  user_id UUID,
  metric_type TEXT,
  metric_value FLOAT,
  context JSONB,
  recorded_at TIMESTAMP
);
```

### prediction_cache
Performance optimization for predictions.

```sql
CREATE TABLE prediction_cache (
  id UUID PRIMARY KEY,
  user_id UUID,
  cache_key TEXT,
  predictions JSONB,
  context_hash TEXT,
  hit_count INTEGER,
  expires_at TIMESTAMP
);
```

---

## Example Use Cases

### Use Case 1: Predictive Prefetching

```javascript
// User is working on pricing
const recentMemories = ['pricing-doc-1', 'competitor-analysis-2'];

const response = await fetch('/api/v1/memories/predict', {
  method: 'GET',
  params: {
    current_context: 'updating pricing strategy',
    recent_memories: JSON.stringify(recentMemories),
    limit: 5
  }
});

// System predicts you'll need:
// - Previous pricing decisions
// - Competitor data
// - Customer feedback on pricing
```

### Use Case 2: Proactive Suggestions

```javascript
// As user types in their note-taking app
const context = document.querySelector('#editor').value;

const response = await fetch('/api/v1/memories/suggest', {
  method: 'POST',
  body: JSON.stringify({
    context: context.substring(0, 500),
    include_reasoning: true,
    limit: 3,
    min_confidence: 0.7
  })
});

// Show suggestions in sidebar BEFORE user searches
```

### Use Case 3: Weekly Maintenance

```javascript
// Run weekly maintenance check
const maintenance = await fetch('/api/v1/learning/maintenance-suggestions');

// Present user with:
// "Found 5 duplicate memories - merge them?"
// "8 memories haven't been used in 90 days - archive?"
```

---

## Performance Considerations

### Prediction Cache
- Predictions are cached for 1 hour
- Cache key includes context hash
- Hit count tracks cache effectiveness

### Background Jobs
- Temporal pattern detection runs hourly
- Weight adjustments happen every 10 searches
- Maintenance suggestions update every 6 hours

### Optimization Tips
1. Use `limit` parameter to control result size
2. Enable `adaptive_weights` for better personalization
3. Provide `recent_memories` for better predictions
4. Set appropriate `min_confidence` thresholds

---

## Migration Guide

### Step 1: Run Migration
```bash
psql -d your_database -f migrations/20251118_phase2_predictive.sql
```

### Step 2: Initialize User Weights
All users start with default weights. They'll adapt automatically as users provide feedback.

### Step 3: Enable Features
All Phase 2 features are backward compatible. Existing API calls work unchanged.

---

## Success Metrics

After Phase 2 deployment, monitor:

1. **Search Satisfaction**: User feedback on search results
2. **Prediction Accuracy**: % of predictions that were actually used
3. **Weight Convergence**: Time for weights to stabilize per user
4. **Pattern Detection**: Number of active patterns per user
5. **Maintenance Actions**: Duplicates merged, memories archived

---

## Next Steps

### Potential Phase 3 Features
- Cross-user pattern sharing (with privacy)
- Advanced sequence prediction (LSTM models)
- Context-aware automatic tagging
- Smart memory summarization
- Collaborative filtering for suggestions

---

## Support

For questions or issues:
- GitHub: [RecallBricks Issues](https://github.com/your-repo/issues)
- Docs: [Full API Documentation](./API_DOCS.md)
- Phase 1: [Metacognition Documentation](./METACOGNITION_PHASE1.md)

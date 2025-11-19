# Phase 3: Multi-Agent Collaboration API Reference

Complete API documentation for RecallBricks Phase 3 collaboration features.

## Table of Contents

- [Agent Profile Management](#agent-profile-management)
- [Multi-Agent Contributions](#multi-agent-contributions)
- [Knowledge Synthesis](#knowledge-synthesis)
- [Conflict Detection & Resolution](#conflict-detection--resolution)
- [Cross-Agent Learning](#cross-agent-learning)
- [Collaboration Dashboard](#collaboration-dashboard)

---

## Agent Profile Management

### Create Agent Profile

**POST** `/api/v1/collaboration/agents`

Create a new agent profile for multi-agent collaboration.

**Request Body:**
```json
{
  "agent_name": "code-agent-1",
  "agent_type": "code",
  "expertise_domains": ["typescript", "node.js", "testing"],
  "confidence_threshold": 0.7,
  "agent_metadata": {
    "version": "1.0.0",
    "capabilities": ["code-review", "test-generation"]
  }
}
```

**Fields:**
- `agent_name` (string, required): Unique name for the agent
- `agent_type` (string, required): One of: `code`, `research`, `documentation`, `test`, `general`, `specialized`
- `expertise_domains` (array, optional): List of expertise areas
- `confidence_threshold` (float, optional): Minimum confidence for contributions (default: 0.7)
- `agent_metadata` (object, optional): Custom metadata

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "agent_name": "code-agent-1",
  "agent_type": "code",
  "reputation_score": 0.5,
  "total_contributions": 0,
  "accepted_contributions": 0,
  "rejected_contributions": 0,
  "expertise_domains": ["typescript", "node.js", "testing"],
  "confidence_threshold": 0.7,
  "is_active": true,
  "created_at": "2025-11-18T...",
  "updated_at": "2025-11-18T..."
}
```

---

### List Agents

**GET** `/api/v1/collaboration/agents`

List all agents for the authenticated user.

**Response:**
```json
{
  "agents": [
    {
      "id": "uuid",
      "agent_name": "code-agent-1",
      "agent_type": "code",
      "reputation_score": 0.87,
      "total_contributions": 142,
      "last_contribution": "2025-11-18T...",
      "is_active": true
    }
  ],
  "count": 1
}
```

---

### Get Agent Profile

**GET** `/api/v1/collaboration/agents/:id`

Get detailed information about a specific agent.

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "agent_name": "code-agent-1",
  "agent_type": "code",
  "reputation_score": 0.87,
  "total_contributions": 142,
  "accepted_contributions": 135,
  "rejected_contributions": 7,
  "expertise_domains": ["typescript", "node.js"],
  "first_contribution": "2025-11-01T...",
  "last_contribution": "2025-11-18T...",
  "is_active": true
}
```

---

### Get Agent Performance

**GET** `/api/v1/collaboration/agents/:id/performance`

Get detailed performance metrics for an agent.

**Response:**
```json
{
  "agent_id": "uuid",
  "agent_name": "code-agent-1",
  "reputation_score": 0.87,
  "acceptance_rate": 0.95,
  "total_contributions": 142,
  "syntheses_created": 12,
  "conflicts_resolved": 5,
  "activity_status": "active",
  "days_since_contribution": 0
}
```

**Activity Status:**
- `active`: Contributed in last 24 hours
- `recent`: Contributed in last 7 days
- `inactive`: Contributed in last 30 days
- `dormant`: No contributions in 30+ days

---

### Recalculate Agent Reputation

**POST** `/api/v1/collaboration/agents/:id/recalculate-reputation`

Manually trigger reputation score recalculation.

**Response:**
```json
{
  "agent_id": "uuid",
  "reputation_score": 0.87
}
```

---

## Multi-Agent Contributions

### Agent Contribute Memory

**POST** `/api/v1/collaboration/contribute`

Agent contributes a new memory to the system.

**Request Body:**
```json
{
  "agent_id": "uuid",
  "text": "TypeScript provides compile-time type checking",
  "contribution_type": "create",
  "confidence": 0.9,
  "source": "agent",
  "project_id": "typescript-docs",
  "tags": ["typescript", "types", "compile-time"],
  "metadata": {
    "context": "documentation-review",
    "verified": true
  }
}
```

**Fields:**
- `agent_id` (string, required): Agent making the contribution
- `text` (string, required): Memory content
- `contribution_type` (string, optional): `create`, `update`, or `enrich` (default: `create`)
- `confidence` (float, optional): Agent's confidence level (0.0-1.0, default: 0.8)
- `source`, `project_id`, `tags`, `metadata`: Standard memory fields

**Response:**
```json
{
  "memory": {
    "id": "uuid",
    "user_id": "uuid",
    "text": "TypeScript provides compile-time type checking",
    "source": "agent",
    "created_at": "2025-11-18T..."
  },
  "contribution": {
    "id": "uuid",
    "memory_id": "uuid",
    "agent_id": "uuid",
    "contribution_type": "create",
    "confidence": 0.9,
    "validation_status": "accepted",
    "created_at": "2025-11-18T..."
  }
}
```

---

### Validate Contribution

**POST** `/api/v1/collaboration/contributions/:id/validate`

Validate or reject an agent's contribution.

**Request Body:**
```json
{
  "validation_status": "accepted",
  "validation_notes": "High quality contribution with accurate information"
}
```

**Fields:**
- `validation_status` (string, required): `accepted`, `rejected`, or `disputed`
- `validation_notes` (string, optional): Notes about the validation decision

**Response:**
```json
{
  "success": true,
  "contribution_id": "uuid",
  "validation_status": "accepted"
}
```

---

## Knowledge Synthesis

### Synthesize Knowledge

**POST** `/api/v1/collaboration/synthesize`

Combine multiple memories into synthesized knowledge.

**Request Body:**
```json
{
  "agent_id": "uuid",
  "source_memory_ids": [
    "uuid-1",
    "uuid-2",
    "uuid-3"
  ],
  "synthesis_method": "multi_source",
  "include_relationships": true
}
```

**Fields:**
- `agent_id` (string, required): Agent performing the synthesis
- `source_memory_ids` (array, required): At least 2 memory IDs to synthesize
- `synthesis_method` (string, optional): Method used for synthesis
- `include_relationships` (boolean, optional): Create relationships to sources

**Response:**
```json
{
  "synthesized_memory": {
    "id": "uuid",
    "text": "SYNTHESIZED KNOWLEDGE:\n\nSource 1: ...\nSource 2: ...\n[Synthesized by code-agent-1]",
    "source": "synthesis",
    "metadata": {
      "synthesized_from": ["uuid-1", "uuid-2", "uuid-3"],
      "synthesized_by": "uuid",
      "source_count": 3
    }
  },
  "synthesis_history": {
    "id": "uuid",
    "synthesized_memory_id": "uuid",
    "source_memory_ids": ["uuid-1", "uuid-2", "uuid-3"],
    "synthesizing_agent_id": "uuid",
    "synthesis_method": "multi_source",
    "synthesis_confidence": 0.8,
    "created_at": "2025-11-18T..."
  }
}
```

---

## Conflict Detection & Resolution

### Detect Conflicts

**POST** `/api/v1/collaboration/detect-conflicts`

Detect conflicts for a specific memory.

**Request Body:**
```json
{
  "memory_id": "uuid",
  "conflict_threshold": 0.7
}
```

**Fields:**
- `memory_id` (string, required): Memory to check for conflicts
- `conflict_threshold` (float, optional): Similarity threshold (default: 0.7)

**Response:**
```json
{
  "conflicts": [
    {
      "conflict_id": "uuid",
      "conflicting_memory_id": "uuid",
      "conflict_type": "duplicate",
      "severity": 0.8
    }
  ],
  "count": 1,
  "memory_id": "uuid"
}
```

**Conflict Types:**
- `contradiction`: Memories contradict each other
- `outdated`: One memory is newer/better than the other
- `duplicate`: Nearly identical memories
- `inconsistent`: Memories have inconsistent information

---

### List Conflicts

**GET** `/api/v1/collaboration/conflicts`

List all unresolved conflicts for the user.

**Response:**
```json
{
  "conflicts": [
    {
      "id": "uuid",
      "memory_a_id": "uuid",
      "memory_b_id": "uuid",
      "conflict_type": "duplicate",
      "severity": 0.85,
      "detected_at": "2025-11-18T...",
      "detection_method": "auto_detect"
    }
  ],
  "count": 1
}
```

---

### Resolve Conflict

**POST** `/api/v1/collaboration/conflicts/:id/resolve`

Resolve a detected conflict.

**Request Body:**
```json
{
  "resolution_strategy": "trust_higher_rep",
  "resolved_by": "uuid"
}
```

**Resolution Strategies:**
- `trust_higher_rep`: Trust the agent with higher reputation
- `merge`: Merge both memories (triggers synthesis)
- `keep_both`: Keep both memories as-is
- `manual`: Manually resolved by user

**Response:**
```json
{
  "success": true,
  "conflict_id": "uuid",
  "resolution_strategy": "trust_higher_rep"
}
```

---

## Cross-Agent Learning

### Transfer Learning

**POST** `/api/v1/collaboration/share-learning`

Transfer learned patterns from one agent to another.

**Request Body:**
```json
{
  "source_agent_id": "uuid",
  "target_agent_id": "uuid",
  "pattern_types": ["hourly", "daily", "sequence"],
  "min_confidence": 0.6
}
```

**Fields:**
- `source_agent_id` (string, required): Agent to transfer from
- `target_agent_id` (string, required): Agent to transfer to
- `pattern_types` (array, optional): Specific pattern types to transfer
- `min_confidence` (float, optional): Minimum pattern confidence (default: 0.6)

**Response:**
```json
{
  "transferred_patterns": [
    {
      "pattern_type": "hourly",
      "pattern_data": {
        "hour": 9,
        "memories": ["uuid-1", "uuid-2"]
      },
      "confidence": 0.72,
      "source_agent": "code-agent-1"
    }
  ],
  "count": 1
}
```

---

## Collaboration Dashboard

### Get Dashboard

**GET** `/api/v1/collaboration/dashboard`

Get comprehensive collaboration metrics and statistics.

**Response:**
```json
{
  "total_agents": 5,
  "active_agents_24h": 3,
  "memory_pools": [
    {
      "name": "shared",
      "memories": 1420,
      "contributors": 4,
      "synthesis_count": 47
    }
  ],
  "recent_syntheses": [
    {
      "id": "uuid",
      "synthesized_memory_id": "uuid",
      "source_memory_ids": ["uuid-1", "uuid-2"],
      "synthesizing_agent_id": "uuid",
      "created_at": "2025-11-18T..."
    }
  ],
  "top_contributors": [
    {
      "agent_name": "code-agent-1",
      "reputation_score": 0.92,
      "total_contributions": 248
    }
  ],
  "conflict_resolution_rate": 0.94,
  "unresolved_conflicts": 3
}
```

---

## Enhanced Memory Endpoints

### Create Memory with Agent Attribution

**POST** `/api/v1/memories`

Existing memory creation endpoint now supports `agent_id` parameter.

**Request Body:**
```json
{
  "text": "Memory content",
  "agent_id": "uuid",
  "source": "agent",
  "tags": ["tag1", "tag2"]
}
```

When `agent_id` is provided:
- Contribution is automatically recorded
- Agent statistics are updated
- Agent metadata is added to memory

---

### Get Memory with Contributors

**GET** `/api/v1/memories/:id`

Memory retrieval now includes contributor information.

**Response Enhancement:**
```json
{
  "id": "uuid",
  "text": "Memory content",
  "...": "other fields",
  "contributors": [
    {
      "id": "contribution-uuid",
      "contribution_type": "create",
      "confidence": 0.9,
      "validation_status": "accepted",
      "agent_profiles": {
        "id": "agent-uuid",
        "agent_name": "code-agent-1",
        "agent_type": "code",
        "reputation_score": 0.87
      }
    }
  ]
}
```

---

## Error Codes

### Phase 3 Specific Errors

- **400 Bad Request**: Invalid parameters (e.g., duplicate agent name, insufficient source memories)
- **403 Forbidden**: Agent does not belong to user
- **404 Not Found**: Agent or conflict not found
- **500 Internal Server Error**: Database or processing error

---

## Rate Limiting

All collaboration endpoints use the same rate limiting as other API endpoints:
- 100 requests per minute for authenticated users
- Burst allowance of 20 requests

---

## Best Practices

### Agent Design

1. **Specialization**: Create agents with specific expertise domains
2. **Confidence Thresholds**: Set appropriate thresholds (0.7-0.8 for most cases)
3. **Naming**: Use descriptive names (e.g., "typescript-doc-agent", "test-generator")

### Contributions

1. **High Confidence**: Only contribute when confidence > 0.7
2. **Clear Context**: Include metadata about contribution context
3. **Validation**: Monitor validation status and adjust agent behavior

### Synthesis

1. **Related Sources**: Only synthesize closely related memories
2. **Minimum Sources**: Use at least 3 sources for better synthesis
3. **Review Output**: Check synthesized content quality

### Conflict Resolution

1. **Auto-Resolution**: Use `trust_higher_rep` for most automated scenarios
2. **Manual Review**: Use `manual` for critical conflicts
3. **Merge Strategy**: Reserve `merge` for truly complementary information

---

## Examples

### Complete Multi-Agent Workflow

```bash
# 1. Create agents
curl -X POST https://api.recallbricks.com/api/v1/collaboration/agents \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_name": "code-reviewer",
    "agent_type": "code",
    "expertise_domains": ["code-review", "typescript"]
  }'

# 2. Agent contributes memory
curl -X POST https://api.recallbricks.com/api/v1/collaboration/contribute \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "uuid",
    "text": "Always use const for immutable variables",
    "confidence": 0.95,
    "tags": ["typescript", "best-practices"]
  }'

# 3. Synthesize related memories
curl -X POST https://api.recallbricks.com/api/v1/collaboration/synthesize \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "uuid",
    "source_memory_ids": ["uuid-1", "uuid-2", "uuid-3"]
  }'

# 4. Check dashboard
curl https://api.recallbricks.com/api/v1/collaboration/dashboard \
  -H "X-API-Key: $API_KEY"
```

---

For deployment instructions, see [PHASE3_DEPLOYMENT.md](./PHASE3_DEPLOYMENT.md).
For collaboration strategies, see [COLLABORATION_GUIDE.md](./COLLABORATION_GUIDE.md).
For conflict resolution details, see [CONFLICT_RESOLUTION.md](./CONFLICT_RESOLUTION.md).

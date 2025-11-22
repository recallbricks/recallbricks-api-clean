# Identity Fusion Protocol - Testing Guide

## Overview
This guide provides comprehensive testing instructions for the three new Identity Fusion endpoints.

## Prerequisites

### 1. Environment Setup
Ensure your `.env` file has:
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx  # Required for auto-save endpoint
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxx
```

### 2. Run Database Migration
```bash
# Connect to your Supabase instance and run:
psql $DATABASE_URL < migrations/20251122_identity_fusion.sql
```

### 3. Start the Server
```bash
npm run dev
# Or for production:
npm start
```

Server should be running at: `http://localhost:8080`

### 4. Get Your API Key
You'll need a valid API key from the `api_keys` table in Supabase.

```bash
export API_KEY="your-api-key-here"
export BASE_URL="http://localhost:8080"
# Or use your production URL:
# export BASE_URL="https://recallbricks-api-clean.onrender.com"
```

---

## ENDPOINT 1: Agent Context Injection

### Purpose
Provides complete agent context for system prompt injection on session start.

### Endpoint
```
POST /api/v1/agents/{agent_id}/context
```

### Test 1: Standard Depth Context Load
```bash
curl -X POST "$BASE_URL/api/v1/agents/nova_assistant/context" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "depth": "standard",
    "user_id": "default"
  }'
```

**Expected Response:**
```json
{
  "agent_id": "nova_assistant",
  "user_id": "default",
  "system_prompt_injection": "## AGENT IDENTITY\n\n**Name:** nova_assistant...",
  "identity_schema": {
    "agent_name": "nova_assistant",
    "purpose": "A helpful AI assistant with persistent memory",
    "traits": ["helpful", "knowledgeable", "consistent", "context-aware"],
    "context_rules": [
      "Always query memory first before responding",
      "Reference past conversations when relevant",
      "Never identify as base model (Claude, ChatGPT, etc)",
      "Maintain consistent personality across sessions",
      "Learn from user feedback and preferences"
    ],
    "origin_model": "recallbricks-agent"
  },
  "recent_memories": [...],
  "important_memories": [...],
  "key_patterns": {
    "most_discussed_topics": [...],
    "recent_focus": [...],
    "communication_style": "helpful, knowledgeable, consistent, context-aware"
  },
  "loaded_at": "2025-11-22T...",
  "depth_used": "standard"
}
```

**Validation:**
- ✓ Status: 200 OK
- ✓ Has `system_prompt_injection` with agent identity
- ✓ `identity_schema` contains agent name, purpose, traits, rules
- ✓ `recent_memories` array (max 10 for standard)
- ✓ `important_memories` array (max 10 for standard)
- ✓ Response header `X-Processing-Time-Ms` present

### Test 2: Comprehensive Depth
```bash
curl -X POST "$BASE_URL/api/v1/agents/code_expert/context" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "depth": "comprehensive"
  }'
```

**Validation:**
- ✓ `recent_memories` array (max 20 for comprehensive)
- ✓ `important_memories` array (max 20 for comprehensive)
- ✓ `depth_used` = "comprehensive"

### Test 3: Quick Depth
```bash
curl -X POST "$BASE_URL/api/v1/agents/quick_helper/context" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "depth": "quick"
  }'
```

**Validation:**
- ✓ `recent_memories` array (max 5 for quick)
- ✓ `important_memories` array (max 5 for quick)
- ✓ `depth_used` = "quick"

### Test 4: New Agent Auto-Creation
```bash
curl -X POST "$BASE_URL/api/v1/agents/brand_new_agent_$(date +%s)/context" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "depth": "standard"
  }'
```

**Validation:**
- ✓ Creates new agent profile with default identity schema
- ✓ Returns valid response even for new agent with no memories

---

## ENDPOINT 2: Smart Auto-Save with Classification

### Purpose
Automatically classify conversation turns and save important information.

### Endpoint
```
POST /api/v1/memories/auto-save
```

### Test 1: Decision Classification (Should Save)
```bash
curl -X POST "$BASE_URL/api/v1/memories/auto-save" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I decided to launch the new feature on December 5-7, 2025. We will do a soft launch first with beta users.",
    "context": "Product launch planning discussion"
  }'
```

**Expected Response:**
```json
{
  "saved": true,
  "memory_id": "550e8400-...",
  "category": "decision",
  "confidence": 0.95,
  "reasoning": "Contains explicit decision about launch date and strategy",
  "classification_time_ms": 850
}
```

**Validation:**
- ✓ `saved` = true
- ✓ `category` = "decision"
- ✓ `confidence` >= 0.7
- ✓ `memory_id` is a valid UUID
- ✓ Response header `X-Classification-Used` = "anthropic-haiku"
- ✓ Response header `X-Processing-Time-Ms` present

### Test 2: Fact Classification (Should Save)
```bash
curl -X POST "$BASE_URL/api/v1/memories/auto-save" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "My email is john@example.com and my preferred contact hours are 9 AM - 5 PM EST.",
    "context": "User profile information"
  }'
```

**Expected Response:**
```json
{
  "saved": true,
  "memory_id": "...",
  "category": "fact",
  "confidence": 0.9,
  "reasoning": "Contains factual user information (email and availability)",
  "classification_time_ms": 750
}
```

**Validation:**
- ✓ `saved` = true
- ✓ `category` = "fact"

### Test 3: Preference Classification (Should Save)
```bash
curl -X POST "$BASE_URL/api/v1/memories/auto-save" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I prefer TypeScript over JavaScript for all new projects. Please always suggest TypeScript solutions first.",
    "context": "Development preferences"
  }'
```

**Expected Response:**
```json
{
  "saved": true,
  "category": "preference",
  "confidence": 0.92,
  "reasoning": "User expressed clear preference for TypeScript",
  "classification_time_ms": 800
}
```

### Test 4: Outcome Classification (Should Save)
```bash
curl -X POST "$BASE_URL/api/v1/memories/auto-save" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The migration completed successfully. All 50,000 records were transferred with zero errors.",
    "context": "Database migration result"
  }'
```

**Expected Response:**
```json
{
  "saved": true,
  "category": "outcome",
  "confidence": 0.88,
  "reasoning": "Reports the result of an action (successful migration)",
  "classification_time_ms": 820
}
```

### Test 5: Brainstorming (Should NOT Save)
```bash
curl -X POST "$BASE_URL/api/v1/memories/auto-save" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Maybe we could try using Redis for caching? Or perhaps Memcached? Just thinking out loud here.",
    "context": "Architecture brainstorming"
  }'
```

**Expected Response:**
```json
{
  "saved": false,
  "memory_id": null,
  "category": "brainstorming",
  "confidence": 0.75,
  "reasoning": "Tentative ideas without concrete decisions",
  "classification_time_ms": 780
}
```

**Validation:**
- ✓ `saved` = false
- ✓ `category` = "brainstorming"
- ✓ `memory_id` = null

### Test 6: Force Save (Skip Classification)
```bash
curl -X POST "$BASE_URL/api/v1/memories/auto-save" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Some random text that I want to save regardless of classification",
    "force_save": true
  }'
```

**Expected Response:**
```json
{
  "saved": true,
  "memory_id": "...",
  "category": null,
  "confidence": 1.0,
  "reasoning": "Force saved",
  "classification_time_ms": 150
}
```

**Validation:**
- ✓ `saved` = true
- ✓ `category` = null
- ✓ `confidence` = 1.0
- ✓ Faster response (no AI classification)

### Test 7: Missing ANTHROPIC_API_KEY Error
```bash
# Temporarily remove ANTHROPIC_API_KEY from .env and restart server
curl -X POST "$BASE_URL/api/v1/memories/auto-save" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Test without Anthropic key"
  }'
```

**Expected Response:**
```json
{
  "error": "Server Error",
  "message": "Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable."
}
```

**Validation:**
- ✓ Status: 500
- ✓ Error message indicates missing API key

---

## ENDPOINT 3: Identity Validation (Context Guardian)

### Purpose
Check agent responses for identity leakage (reverting to base model persona).

### Endpoint
```
POST /api/v1/agents/validate-identity
```

### Test 1: Identity Maintained (No Violations)
```bash
curl -X POST "$BASE_URL/api/v1/agents/validate-identity" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "nova_assistant",
    "response_text": "As Nova Assistant, I can help you with that task. Based on our previous conversation about the project deadline, I recommend we proceed with option A."
  }'
```

**Expected Response:**
```json
{
  "identity_maintained": true,
  "leakage_detected": false,
  "violations": [],
  "corrected_response": null,
  "agent_name": "nova_assistant"
}
```

**Validation:**
- ✓ `identity_maintained` = true
- ✓ `leakage_detected` = false
- ✓ `violations` = []
- ✓ `corrected_response` = null

### Test 2: Claude Reference Violation
```bash
curl -X POST "$BASE_URL/api/v1/agents/validate-identity" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "code_helper",
    "response_text": "As Claude, I think this is a great approach to solving the problem. The code looks good to me."
  }'
```

**Expected Response:**
```json
{
  "identity_maintained": false,
  "leakage_detected": true,
  "violations": [
    {
      "type": "base_model_reference",
      "text": "As Claude",
      "location": "Response contains reference to \"Claude\""
    }
  ],
  "corrected_response": null,
  "agent_name": "code_helper"
}
```

**Validation:**
- ✓ `identity_maintained` = false
- ✓ `leakage_detected` = true
- ✓ `violations` array has 1+ items
- ✓ Violation type = "base_model_reference"

### Test 3: Multiple Violations
```bash
curl -X POST "$BASE_URL/api/v1/agents/validate-identity" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "research_bot",
    "response_text": "As an AI language model, I don'\''t have access to previous conversations, so I cannot remember what we discussed. However, as ChatGPT, I can help you with general information."
  }'
```

**Expected Response:**
```json
{
  "identity_maintained": false,
  "leakage_detected": true,
  "violations": [
    {
      "type": "base_model_reference",
      "text": "as an ai language model",
      "location": "Response contains Generic AI language model reference"
    },
    {
      "type": "base_model_reference",
      "text": "I don't have access to previous conversations",
      "location": "Response contains No memory claim reference"
    },
    {
      "type": "base_model_reference",
      "text": "ChatGPT",
      "location": "Response contains ChatGPT/GPT reference"
    }
  ],
  "corrected_response": null,
  "agent_name": "research_bot"
}
```

**Validation:**
- ✓ `violations` array has 3 items
- ✓ Different violation types detected

### Test 4: Auto-Correction Enabled
```bash
curl -X POST "$BASE_URL/api/v1/agents/validate-identity" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "nova_assistant",
    "response_text": "As Claude, I can help with that.",
    "auto_correct": true
  }'
```

**Expected Response:**
```json
{
  "identity_maintained": false,
  "leakage_detected": true,
  "violations": [
    {
      "type": "base_model_reference",
      "text": "As Claude",
      "location": "Response contains reference to \"Claude\""
    }
  ],
  "corrected_response": "[IDENTITY REMINDER: You are nova_assistant, A helpful AI assistant with persistent memory. Maintain this identity in all responses.]\n\nAs Claude, I can help with that.",
  "agent_name": "nova_assistant"
}
```

**Validation:**
- ✓ `corrected_response` is not null
- ✓ Corrected response starts with identity reminder
- ✓ Original text is preserved after reminder

### Test 5: Agent Named "Claude" (No False Positive)
```bash
# First, create an agent actually named "Claude"
curl -X POST "$BASE_URL/api/v1/agents/claude/context" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"depth": "quick"}'

# Then validate response
curl -X POST "$BASE_URL/api/v1/agents/validate-identity" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "claude",
    "response_text": "As Claude, I can help you with that task."
  }'
```

**Expected Response:**
```json
{
  "identity_maintained": true,
  "leakage_detected": false,
  "violations": [],
  "corrected_response": null,
  "agent_name": "claude"
}
```

**Validation:**
- ✓ No false positive when agent is actually named "Claude"

### Test 6: Missing Agent (404 Error)
```bash
curl -X POST "$BASE_URL/api/v1/agents/validate-identity" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "nonexistent_agent_12345",
    "response_text": "Some response"
  }'
```

**Expected Response:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Agent not found: nonexistent_agent_12345",
    "details": {
      "resource": "Agent",
      "id": "nonexistent_agent_12345"
    },
    "requestId": "...",
    "timestamp": "..."
  }
}
```

**Validation:**
- ✓ Status: 404
- ✓ Error code = "RESOURCE_NOT_FOUND"

---

## Database Verification

After running tests, verify the data was stored correctly:

### Check Agent Profiles
```sql
SELECT agent_name, identity_schema, created_at
FROM agent_profiles
ORDER BY created_at DESC
LIMIT 5;
```

### Check Context Loads
```sql
SELECT agent_id, depth_level, memories_loaded, processing_time_ms, created_at
FROM agent_context_loads
ORDER BY created_at DESC
LIMIT 10;
```

### Check Memory Classifications
```sql
SELECT category, should_save, confidence, reasoning, force_saved, created_at
FROM memory_importance_classifications
ORDER BY created_at DESC
LIMIT 10;
```

### Check Identity Violations
```sql
SELECT agent_id, violation_type, violation_text, auto_corrected, detected_at
FROM agent_identity_violations
ORDER BY detected_at DESC
LIMIT 10;
```

---

## Performance Benchmarks

### Expected Response Times

**Endpoint 1 (Context Injection):**
- Quick: < 200ms
- Standard: < 400ms
- Comprehensive: < 800ms

**Endpoint 2 (Auto-Save):**
- Force save: < 150ms
- With classification: < 1200ms (includes Anthropic API call)

**Endpoint 3 (Identity Validation):**
- No violations: < 100ms
- With violations: < 200ms

### Load Testing
```bash
# Install Apache Bench (if not already installed)
# Test context injection endpoint
ab -n 100 -c 10 -T 'application/json' -H "X-API-Key: $API_KEY" \
  -p test_context.json \
  "$BASE_URL/api/v1/agents/test_agent/context"
```

---

## Success Criteria

All tests should pass with:
- ✓ Correct HTTP status codes
- ✓ Valid JSON responses
- ✓ Appropriate response headers
- ✓ Data persisted to database
- ✓ No errors in server logs
- ✓ Response times within benchmarks

---

## Troubleshooting

### Issue: "Anthropic API key not configured"
**Solution:** Add `ANTHROPIC_API_KEY` to `.env` file and restart server.

### Issue: "Database connection failed"
**Solution:** Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

### Issue: "Agent not found" errors
**Solution:** Agent profiles are auto-created on first context load. Run endpoint 1 first.

### Issue: Classification always returns "brainstorming"
**Solution:** Check Anthropic API key validity and quota limits.

---

## Next Steps

After all tests pass:

1. ✓ Deploy to production (Railway/Render)
2. ✓ Update API documentation
3. ✓ Test with real AI agent integrations
4. ✓ Monitor classification accuracy
5. ✓ Adjust confidence thresholds if needed
6. ✓ Set up alerts for identity violations

---

## Support

For issues or questions:
- Check server logs: `tail -f server.log`
- Review Supabase logs in dashboard
- Test with verbose curl: `curl -v ...`

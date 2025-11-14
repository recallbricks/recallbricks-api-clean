#!/bin/bash

# ==============================================================================
# Memory Relationship Detection - Integration Test
# ==============================================================================

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:10000}"
API_KEY="${API_KEY:-your-api-key-here}"

echo "=============================================="
echo "Memory Relationship Detection - Test Script"
echo "=============================================="
echo ""
echo "API Base URL: $API_BASE_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo "Test 1: Checking relationship detection health..."
HEALTH=$(curl -s -X GET "$API_BASE_URL/api/v1/relationships/health" \
  -H "X-API-Key: $API_KEY")

HEALTHY=$(echo "$HEALTH" | grep -o '"healthy":[^,}]*' | cut -d: -f2)
ENABLED=$(echo "$HEALTH" | grep -o '"enabled":[^,}]*' | cut -d: -f2)
API_KEY_CONFIGURED=$(echo "$HEALTH" | grep -o '"apiKeyConfigured":[^,}]*' | cut -d: -f2)

echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"
echo ""

if [[ "$ENABLED" == "true" ]]; then
  echo -e "${GREEN}✓ Relationship detection is ENABLED${NC}"
else
  echo -e "${RED}✗ Relationship detection is DISABLED${NC}"
  exit 1
fi

if [[ "$API_KEY_CONFIGURED" == "true" ]]; then
  echo -e "${GREEN}✓ Anthropic API key is configured${NC}"
else
  echo -e "${YELLOW}⚠ Anthropic API key is NOT configured${NC}"
fi

echo ""

# Test 2: Create First Memory
echo "Test 2: Creating first memory..."
MEMORY1=$(curl -s -X POST "$API_BASE_URL/api/v1/memories" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Implemented PostgreSQL connection pooling using pg-pool to handle 1000+ concurrent connections",
    "project_id": "test-relationships",
    "tags": ["database", "postgresql", "performance"]
  }')

MEMORY1_ID=$(echo "$MEMORY1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "$MEMORY1" | python3 -m json.tool 2>/dev/null || echo "$MEMORY1"
echo ""

if [[ -n "$MEMORY1_ID" ]]; then
  echo -e "${GREEN}✓ First memory created: $MEMORY1_ID${NC}"
else
  echo -e "${RED}✗ Failed to create first memory${NC}"
  exit 1
fi

echo ""

# Test 3: Create Second Related Memory
echo "Test 3: Creating second related memory..."
MEMORY2=$(curl -s -X POST "$API_BASE_URL/api/v1/memories" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Configured pgBouncer as connection pooler for PostgreSQL with transaction pooling mode",
    "project_id": "test-relationships",
    "tags": ["database", "postgresql", "pgbouncer"]
  }')

MEMORY2_ID=$(echo "$MEMORY2" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "$MEMORY2" | python3 -m json.tool 2>/dev/null || echo "$MEMORY2"
echo ""

if [[ -n "$MEMORY2_ID" ]]; then
  echo -e "${GREEN}✓ Second memory created: $MEMORY2_ID${NC}"
else
  echo -e "${RED}✗ Failed to create second memory${NC}"
  exit 1
fi

echo ""

# Test 4: Create Third Related Memory
echo "Test 4: Creating third related memory..."
MEMORY3=$(curl -s -X POST "$API_BASE_URL/api/v1/memories" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Optimized PostgreSQL query performance by adding indexes on frequently queried columns",
    "project_id": "test-relationships",
    "tags": ["database", "postgresql", "optimization"]
  }')

MEMORY3_ID=$(echo "$MEMORY3" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "$MEMORY3" | python3 -m json.tool 2>/dev/null || echo "$MEMORY3"
echo ""

if [[ -n "$MEMORY3_ID" ]]; then
  echo -e "${GREEN}✓ Third memory created: $MEMORY3_ID${NC}"
else
  echo -e "${RED}✗ Failed to create third memory${NC}"
  exit 1
fi

echo ""

# Wait for async relationship detection
echo -e "${YELLOW}⏱ Waiting 5 seconds for async relationship detection...${NC}"
sleep 5
echo ""

# Test 5: Query Relationships for Second Memory
echo "Test 5: Querying relationships for second memory..."
RELATIONSHIPS=$(curl -s -X GET "$API_BASE_URL/api/v1/relationships/memory/$MEMORY2_ID" \
  -H "X-API-Key: $API_KEY")

REL_COUNT=$(echo "$RELATIONSHIPS" | grep -o '"count":[0-9]*' | cut -d: -f2)
echo "$RELATIONSHIPS" | python3 -m json.tool 2>/dev/null || echo "$RELATIONSHIPS"
echo ""

if [[ "$REL_COUNT" -gt 0 ]]; then
  echo -e "${GREEN}✓ Found $REL_COUNT relationship(s)!${NC}"
else
  echo -e "${YELLOW}⚠ No relationships detected yet (may need more time or more similar memories)${NC}"
fi

echo ""

# Test 6: Query Relationship Types Statistics
echo "Test 6: Querying relationship type statistics..."
TYPES=$(curl -s -X GET "$API_BASE_URL/api/v1/relationships/types" \
  -H "X-API-Key: $API_KEY")

TOTAL_RELS=$(echo "$TYPES" | grep -o '"totalRelationships":[0-9]*' | cut -d: -f2)
echo "$TYPES" | python3 -m json.tool 2>/dev/null || echo "$TYPES"
echo ""

if [[ "$TOTAL_RELS" -gt 0 ]]; then
  echo -e "${GREEN}✓ Total relationships in system: $TOTAL_RELS${NC}"
else
  echo -e "${YELLOW}⚠ No relationships in system yet${NC}"
fi

echo ""

# Test 7: Query Relationship Graph
echo "Test 7: Querying relationship graph..."
GRAPH=$(curl -s -X GET "$API_BASE_URL/api/v1/relationships/graph/$MEMORY2_ID?depth=2" \
  -H "X-API-Key: $API_KEY")

NODE_COUNT=$(echo "$GRAPH" | grep -o '"nodeCount":[0-9]*' | cut -d: -f2)
EDGE_COUNT=$(echo "$GRAPH" | grep -o '"edgeCount":[0-9]*' | cut -d: -f2)
echo "$GRAPH" | python3 -m json.tool 2>/dev/null || echo "$GRAPH"
echo ""

if [[ "$NODE_COUNT" -gt 1 ]]; then
  echo -e "${GREEN}✓ Graph contains $NODE_COUNT nodes and $EDGE_COUNT edges${NC}"
else
  echo -e "${YELLOW}⚠ Graph has limited connections${NC}"
fi

echo ""

# Summary
echo "=============================================="
echo "Test Summary"
echo "=============================================="
echo ""
echo "Created Memories:"
echo "  1. $MEMORY1_ID (PostgreSQL connection pooling)"
echo "  2. $MEMORY2_ID (pgBouncer configuration)"
echo "  3. $MEMORY3_ID (PostgreSQL query optimization)"
echo ""
echo "Detection Status:"
if [[ "$ENABLED" == "true" ]]; then
  echo -e "  ${GREEN}✓ Service enabled and running${NC}"
else
  echo -e "  ${RED}✗ Service disabled${NC}"
fi

if [[ "$REL_COUNT" -gt 0 ]]; then
  echo -e "  ${GREEN}✓ Relationships detected: $REL_COUNT${NC}"
else
  echo -e "  ${YELLOW}⚠ No relationships detected yet${NC}"
  echo "    This could be because:"
  echo "    - Detection is still processing (wait longer)"
  echo "    - Memories are not semantically similar enough"
  echo "    - Anthropic API key is not configured"
  echo "    - Check logs for errors"
fi

echo ""
echo "Next steps:"
echo "  - Check server logs: grep 'relationship detection' logs/*.log"
echo "  - View metrics: curl $API_BASE_URL/metrics | grep relationship"
echo "  - Review documentation: cat RELATIONSHIP_DETECTION.md"
echo ""

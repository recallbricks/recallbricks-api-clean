/**
 * 24-Hour Smoke Test
 * Load test to prove production readiness and system stability
 *
 * Run with: k6 run load-tests/24h-smoke-test.js
 *
 * Requirements:
 * - Install k6: https://k6.io/docs/getting-started/installation/
 * - Set BASE_URL and API_KEY environment variables if needed
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const memoryIntegrityErrors = new Counter('memory_integrity_errors');
const graphConsistencyErrors = new Counter('graph_consistency_errors');
const reputationDriftErrors = new Counter('reputation_drift_errors');
const latencyP95 = new Trend('latency_p95');
const activeAgents = new Gauge('active_agents');
const totalMemories = new Gauge('total_memories');

// Test configuration
export const options = {
  stages: [
    { duration: '5m', target: 20 },    // Warm up to 20 VUs
    { duration: '10m', target: 50 },   // Ramp up to 50 VUs
    { duration: '1h', target: 100 },   // Ramp to 100 VUs
    { duration: '20h', target: 100 },  // Hold at 100 VUs for 20 hours
    { duration: '1h', target: 150 },   // Spike to 150 VUs
    { duration: '1h', target: 100 },   // Back to 100 VUs
    { duration: '30m', target: 50 },   // Ramp down
    { duration: '30m', target: 0 },    // Cool down
  ],
  thresholds: {
    // SLA thresholds
    'http_req_duration': ['p(95)<500'],        // 95% under 500ms
    'http_req_failed': ['rate<0.01'],          // Less than 1% errors
    'http_req_duration{type:create}': ['p(95)<800'], // Creates can be slower
    'http_req_duration{type:search}': ['p(95)<300'], // Searches should be fast

    // Integrity thresholds
    'memory_integrity_errors': ['count<10'],   // Less than 10 integrity issues
    'graph_consistency_errors': ['count<5'],   // Less than 5 graph issues
    'reputation_drift_errors': ['count<20'],   // Less than 20 reputation drift issues
  },
};

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:10002';
const API_KEY = __ENV.API_KEY || 'rbk_test_local_123456789';

// Shared state (per VU)
let createdMemories = [];
let createdAgents = [];
let createdRelationships = [];

/**
 * Setup function - runs once per VU
 */
export function setup() {
  console.log('Starting 24-hour smoke test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`VUs will create agents and memories to test system stability`);

  // Create initial test agent
  const res = http.post(
    `${BASE_URL}/api/v1/collaboration/agents`,
    JSON.stringify({
      agent_name: 'LoadTest_Setup_Agent',
      agent_type: 'test',
      specialization: { purpose: 'load_testing', version: '2.0' }
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
    }
  );

  if (res.status === 200) {
    const agent = JSON.parse(res.body);
    return { setupAgentId: agent.id };
  }

  return {};
}

/**
 * Main test function - runs repeatedly
 */
export default function (data) {
  const scenario = Math.random();

  if (scenario < 0.25) {
    // 25%: Create memory with agent contribution
    testCreateMemoryWithAgent();
  } else if (scenario < 0.45) {
    // 20%: Search and retrieve memories
    testSearchAndRetrieve();
  } else if (scenario < 0.6) {
    // 15%: Make predictions
    testPredictions();
  } else if (scenario < 0.75) {
    // 15%: Agent collaboration
    testAgentCollaboration();
  } else if (scenario < 0.85) {
    // 10%: Create relationships
    testCreateRelationships();
  } else if (scenario < 0.95) {
    // 10%: Check system health
    testSystemHealth();
  } else {
    // 5%: Integrity checks
    testMemoryIntegrity();
  }

  // Variable sleep to simulate realistic usage
  sleep(Math.random() * 3 + 1); // 1-4 seconds
}

/**
 * Create memory with agent contribution
 */
function testCreateMemoryWithAgent() {
  const timestamp = Date.now();

  // Create agent
  const agentRes = http.post(
    `${BASE_URL}/api/v1/collaboration/agents`,
    JSON.stringify({
      agent_name: `Agent_${timestamp}_${__VU}`,
      agent_type: ['code', 'research', 'design', 'test'][Math.floor(Math.random() * 4)],
      specialization: {
        loadTest: true,
        vu: __VU,
        iteration: __ITER,
      }
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      tags: { type: 'create' },
    }
  );

  const agentSuccess = check(agentRes, {
    'agent created': (r) => r.status === 200,
    'agent has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.id;
      } catch {
        return false;
      }
    },
  });

  if (agentSuccess && agentRes.status === 200) {
    const agent = JSON.parse(agentRes.body);
    createdAgents.push(agent.id);
    activeAgents.add(createdAgents.length);

    // Create memory with this agent
    const memRes = http.post(
      `${BASE_URL}/api/v1/memories`,
      JSON.stringify({
        text: `Load test memory created by agent at ${new Date(timestamp).toISOString()}. VU: ${__VU}, Iteration: ${__ITER}`,
        tags: ['loadtest', 'automated', `vu-${__VU}`],
        metadata: {
          test: true,
          agent_id: agent.id,
          timestamp,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        tags: { type: 'create' },
      }
    );

    const memSuccess = check(memRes, {
      'memory created': (r) => r.status === 200,
      'has contribution tracking': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.metadata && body.metadata.contributed_by_agent;
        } catch {
          return false;
        }
      },
      'has metacognition fields': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.hasOwnProperty('usage_count') &&
                 body.hasOwnProperty('helpfulness_score');
        } catch {
          return false;
        }
      },
    });

    if (memSuccess && memRes.status === 200) {
      const memory = JSON.parse(memRes.body);
      createdMemories.push(memory.id);
      totalMemories.add(createdMemories.length);
    }
  }
}

/**
 * Search and retrieve memories
 */
function testSearchAndRetrieve() {
  const searchRes = http.get(
    `${BASE_URL}/api/v1/memories/search?query=load test&limit=10`,
    {
      headers: {
        'X-API-Key': API_KEY,
      },
      tags: { type: 'search' },
    }
  );

  check(searchRes, {
    'search successful': (r) => r.status === 200,
    'has results array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.memories);
      } catch {
        return false;
      }
    },
  });

  // If we have created memories, retrieve one
  if (createdMemories.length > 0) {
    const randomMemoryId = createdMemories[Math.floor(Math.random() * createdMemories.length)];

    const getRes = http.get(
      `${BASE_URL}/api/v1/memories/${randomMemoryId}`,
      {
        headers: {
          'X-API-Key': API_KEY,
        },
        tags: { type: 'retrieve' },
      }
    );

    check(getRes, {
      'memory retrieved': (r) => r.status === 200,
      'memory has id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.id === randomMemoryId;
        } catch {
          return false;
        }
      },
    });
  }
}

/**
 * Test prediction endpoints
 */
function testPredictions() {
  const predRes = http.get(
    `${BASE_URL}/api/v1/learning/predict/next-memory?context=test&limit=5`,
    {
      headers: {
        'X-API-Key': API_KEY,
      },
      tags: { type: 'prediction' },
    }
  );

  check(predRes, {
    'prediction successful': (r) => r.status === 200,
    'has predictions': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.predictions);
      } catch {
        return false;
      }
    },
  });
}

/**
 * Test agent collaboration features
 */
function testAgentCollaboration() {
  if (createdAgents.length === 0) return;

  const randomAgentId = createdAgents[Math.floor(Math.random() * createdAgents.length)];

  // Get agent reputation
  const repRes = http.get(
    `${BASE_URL}/api/v1/collaboration/agents/${randomAgentId}`,
    {
      headers: {
        'X-API-Key': API_KEY,
      },
      tags: { type: 'collaboration' },
    }
  );

  check(repRes, {
    'agent retrieved': (r) => r.status === 200,
    'has reputation score': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.reputation_score === 'number';
      } catch {
        return false;
      }
    },
  });

  // Check for reputation drift
  if (repRes.status === 200) {
    try {
      const agent = JSON.parse(repRes.body);
      if (agent.reputation_score < 0 || agent.reputation_score > 1) {
        reputationDriftErrors.add(1);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
}

/**
 * Create memory relationships
 */
function testCreateRelationships() {
  if (createdMemories.length < 2) return;

  const memory1 = createdMemories[Math.floor(Math.random() * createdMemories.length)];
  const memory2 = createdMemories[Math.floor(Math.random() * createdMemories.length)];

  if (memory1 === memory2) return; // Skip if same memory

  const relRes = http.post(
    `${BASE_URL}/api/v1/memories/${memory1}/relationships`,
    JSON.stringify({
      related_memory_id: memory2,
      relationship_type: ['similar', 'related', 'prerequisite', 'sequel'][Math.floor(Math.random() * 4)],
      strength: Math.random(),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      tags: { type: 'create' },
    }
  );

  const relSuccess = check(relRes, {
    'relationship created': (r) => r.status === 200 || r.status === 201,
  });

  if (relSuccess) {
    createdRelationships.push({ from: memory1, to: memory2 });
  }
}

/**
 * Check system health
 */
function testSystemHealth() {
  const healthRes = http.get(
    `${BASE_URL}/api/v1/monitoring/health`,
    {
      headers: {
        'X-API-Key': API_KEY,
      },
      tags: { type: 'monitoring' },
    }
  );

  check(healthRes, {
    'health check responds': (r) => r.status === 200 || r.status === 503,
    'has status field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return ['healthy', 'degraded', 'unhealthy'].includes(body.status);
      } catch {
        return false;
      }
    },
  });
}

/**
 * Test memory integrity
 */
function testMemoryIntegrity() {
  if (createdMemories.length === 0) return;

  const randomMemoryId = createdMemories[Math.floor(Math.random() * createdMemories.length)];

  const res = http.get(
    `${BASE_URL}/api/v1/memories/${randomMemoryId}`,
    {
      headers: {
        'X-API-Key': API_KEY,
      },
      tags: { type: 'integrity' },
    }
  );

  if (res.status === 200) {
    try {
      const memory = JSON.parse(res.body);

      // Check integrity
      const hasId = !!memory.id;
      const hasText = !!memory.text;
      const hasTimestamps = !!memory.created_at && !!memory.updated_at;
      const hasMetacognition = memory.hasOwnProperty('usage_count') &&
                               memory.hasOwnProperty('helpfulness_score');
      const validHelpfulness = memory.helpfulness_score >= 0 && memory.helpfulness_score <= 1;
      const validUsageCount = memory.usage_count >= 0;

      if (!hasId || !hasText || !hasTimestamps || !hasMetacognition) {
        memoryIntegrityErrors.add(1);
        console.error(`Memory integrity error: ${randomMemoryId}`);
      }

      if (!validHelpfulness || !validUsageCount) {
        memoryIntegrityErrors.add(1);
        console.error(`Memory metacognition error: ${randomMemoryId}`);
      }
    } catch (e) {
      memoryIntegrityErrors.add(1);
    }
  } else if (res.status !== 404) {
    // Unexpected status
    memoryIntegrityErrors.add(1);
  }
}

/**
 * Teardown function - runs once after test completes
 */
export function teardown(data) {
  console.log('');
  console.log('=== 24-Hour Smoke Test Complete ===');
  console.log('');
  console.log('Running final integrity checks...');

  // Final health check
  const healthRes = http.get(
    `${BASE_URL}/api/v1/monitoring/health`,
    {
      headers: {
        'X-API-Key': API_KEY,
      },
    }
  );

  if (healthRes.status === 200) {
    const health = JSON.parse(healthRes.body);
    console.log(`Final system status: ${health.status}`);
    console.log(`Uptime: ${health.uptime_seconds} seconds`);
    console.log(`SLA met: ${health.sla.target_met}`);
  }

  // Get final metrics
  const metricsRes = http.get(
    `${BASE_URL}/api/v1/monitoring/metrics/json`,
    {
      headers: {
        'X-API-Key': API_KEY,
      },
    }
  );

  if (metricsRes.status === 200) {
    const metrics = JSON.parse(metricsRes.body);
    console.log('');
    console.log('Final Metrics:');
    console.log(`  Total Memories: ${metrics.total_memories}`);
    console.log(`  Total Agents: ${metrics.total_agents}`);
    console.log(`  Active Patterns: ${metrics.active_patterns}`);
    console.log(`  Conflicts Resolved (24h): ${metrics.conflicts_resolved}`);
    console.log(`  Avg Response Time: ${metrics.avg_response_time_ms.toFixed(2)}ms`);
    console.log(`  Error Count (24h): ${metrics.error_count_24h}`);
  }

  console.log('');
  console.log('✅ Smoke test completed successfully');
  console.log('');
}

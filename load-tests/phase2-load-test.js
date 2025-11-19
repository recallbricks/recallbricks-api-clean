/**
 * Phase 2 Enterprise Load Testing Suite
 * Target: 150% expected load
 *
 * Run: k6 run load-tests/phase2-load-test.js
 *
 * Expected Load:
 * - 1000 concurrent users
 * - 100 RPS baseline
 * - 150 RPS peak (150% load)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const predictionLatency = new Trend('prediction_latency');
const suggestionLatency = new Trend('suggestion_latency');
const searchLatency = new Trend('search_latency');
const maintenanceLatency = new Trend('maintenance_latency');
const metricsLatency = new Trend('metrics_latency');
const requestCount = new Counter('requests');

// Configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';
const API_KEY = __ENV.API_KEY || 'test-api-key';

// Load test stages - gradual ramp to 150%
export const options = {
  stages: [
    // Warm-up
    { duration: '2m', target: 50 },   // Ramp to 50 users

    // Normal load (100%)
    { duration: '5m', target: 100 },  // Ramp to 100 users
    { duration: '10m', target: 100 }, // Stay at 100 users

    // Peak load (150%)
    { duration: '3m', target: 150 },  // Ramp to 150 users (150% load)
    { duration: '10m', target: 150 }, // Stay at 150 users

    // Spike test (200%)
    { duration: '2m', target: 200 },  // Spike to 200 users
    { duration: '5m', target: 200 },  // Hold spike

    // Scale down
    { duration: '3m', target: 100 },  // Back to normal
    { duration: '2m', target: 0 },    // Ramp down
  ],

  thresholds: {
    // Error rate must be below 1%
    'errors': ['rate<0.01'],

    // 95th percentile response times (enterprise SLA)
    'prediction_latency': ['p(95)<500'],
    'suggestion_latency': ['p(95)<400'],
    'search_latency': ['p(95)<300'],
    'maintenance_latency': ['p(95)<2000'],
    'metrics_latency': ['p(95)<500'],

    // Overall success rate > 99%
    'checks': ['rate>0.99'],

    // HTTP request duration
    'http_req_duration': ['p(95)<600', 'p(99)<1000'],

    // HTTP request failures < 1%
    'http_req_failed': ['rate<0.01'],
  },
};

// Test data
const testMemoryIds = [];
const testContexts = [
  'pricing strategy for enterprise customers',
  'database optimization techniques',
  'API authentication best practices',
  'microservices architecture patterns',
  'customer feedback analysis',
  'feature roadmap planning',
  'security vulnerability assessment',
  'performance monitoring setup',
];

// Setup function - runs once per VU
export function setup() {
  console.log('Setting up load test...');

  // Create test memories
  const memories = [];
  for (let i = 0; i < 10; i++) {
    const response = http.post(
      `${BASE_URL}/memories`,
      JSON.stringify({
        text: `Load test memory ${i}: ${testContexts[i % testContexts.length]}`,
        tags: ['loadtest', `test-${i}`],
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
      }
    );

    if (response.status === 201) {
      const data = JSON.parse(response.body);
      memories.push(data.id);
    }
  }

  console.log(`Created ${memories.length} test memories`);
  return { memoryIds: memories };
}

// Main test function
export default function(data) {
  const memoryIds = data.memoryIds || [];

  group('Phase 2 Endpoint Load Tests', () => {

    // Test 1: Predictive Prefetching (40% of traffic)
    if (Math.random() < 0.4) {
      testPredictivePrefeching(memoryIds);
      sleep(1);
    }

    // Test 2: Context Suggestions (30% of traffic)
    if (Math.random() < 0.3) {
      testContextSuggestions();
      sleep(1);
    }

    // Test 3: Enhanced Search (20% of traffic)
    if (Math.random() < 0.2) {
      testEnhancedSearch();
      sleep(1);
    }

    // Test 4: Maintenance Suggestions (5% of traffic)
    if (Math.random() < 0.05) {
      testMaintenanceSuggestions();
      sleep(2);
    }

    // Test 5: Learning Metrics (5% of traffic)
    if (Math.random() < 0.05) {
      testLearningMetrics();
      sleep(1);
    }
  });

  // Random sleep between requests (0.5-2 seconds)
  sleep(Math.random() * 1.5 + 0.5);
}

function testPredictivePrefeching(memoryIds) {
  group('Predictive Prefetching', () => {
    const recentMemories = memoryIds.slice(0, Math.floor(Math.random() * 3) + 1);
    const context = testContexts[Math.floor(Math.random() * testContexts.length)];

    const url = `${BASE_URL}/memories/predict?` +
      `recent_memories=${encodeURIComponent(JSON.stringify(recentMemories))}` +
      `&current_context=${encodeURIComponent(context)}` +
      `&limit=10`;

    const start = Date.now();
    const response = http.get(url, {
      headers: { 'X-API-Key': API_KEY },
      tags: { name: 'predict' },
    });
    const duration = Date.now() - start;

    predictionLatency.add(duration);
    requestCount.add(1);

    const success = check(response, {
      'predict: status 200': (r) => r.status === 200,
      'predict: has predictions': (r) => {
        try {
          const data = JSON.parse(r.body);
          return data.predictions !== undefined;
        } catch {
          return false;
        }
      },
      'predict: response time < 500ms': () => duration < 500,
    });

    if (!success) errorRate.add(1);
    else errorRate.add(0);
  });
}

function testContextSuggestions() {
  group('Context Suggestions', () => {
    const context = testContexts[Math.floor(Math.random() * testContexts.length)];

    const start = Date.now();
    const response = http.post(
      `${BASE_URL}/memories/suggest`,
      JSON.stringify({
        context: context,
        include_reasoning: Math.random() > 0.5,
        limit: 5,
        min_confidence: 0.6,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        tags: { name: 'suggest' },
      }
    );
    const duration = Date.now() - start;

    suggestionLatency.add(duration);
    requestCount.add(1);

    const success = check(response, {
      'suggest: status 200': (r) => r.status === 200,
      'suggest: has suggestions': (r) => {
        try {
          const data = JSON.parse(r.body);
          return data.suggestions !== undefined;
        } catch {
          return false;
        }
      },
      'suggest: response time < 400ms': () => duration < 400,
    });

    if (!success) errorRate.add(1);
    else errorRate.add(0);
  });
}

function testEnhancedSearch() {
  group('Enhanced Search', () => {
    const query = testContexts[Math.floor(Math.random() * testContexts.length)];

    const start = Date.now();
    const response = http.post(
      `${BASE_URL}/memories/search`,
      JSON.stringify({
        query: query,
        limit: 10,
        weight_by_usage: true,
        adaptive_weights: true,
        learning_mode: false,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        tags: { name: 'search' },
      }
    );
    const duration = Date.now() - start;

    searchLatency.add(duration);
    requestCount.add(1);

    const success = check(response, {
      'search: status 200': (r) => r.status === 200,
      'search: has memories': (r) => {
        try {
          const data = JSON.parse(r.body);
          return data.memories !== undefined;
        } catch {
          return false;
        }
      },
      'search: response time < 300ms': () => duration < 300,
    });

    if (!success) errorRate.add(1);
    else errorRate.add(0);
  });
}

function testMaintenanceSuggestions() {
  group('Maintenance Suggestions', () => {
    const start = Date.now();
    const response = http.get(
      `${BASE_URL}/learning/maintenance-suggestions`,
      {
        headers: { 'X-API-Key': API_KEY },
        tags: { name: 'maintenance' },
      }
    );
    const duration = Date.now() - start;

    maintenanceLatency.add(duration);
    requestCount.add(1);

    const success = check(response, {
      'maintenance: status 200': (r) => r.status === 200,
      'maintenance: has duplicates': (r) => {
        try {
          const data = JSON.parse(r.body);
          return data.duplicates !== undefined;
        } catch {
          return false;
        }
      },
      'maintenance: response time < 2000ms': () => duration < 2000,
    });

    if (!success) errorRate.add(1);
    else errorRate.add(0);
  });
}

function testLearningMetrics() {
  group('Learning Metrics', () => {
    const days = [7, 30, 90][Math.floor(Math.random() * 3)];

    const start = Date.now();
    const response = http.get(
      `${BASE_URL}/learning/metrics?days=${days}`,
      {
        headers: { 'X-API-Key': API_KEY },
        tags: { name: 'metrics' },
      }
    );
    const duration = Date.now() - start;

    metricsLatency.add(duration);
    requestCount.add(1);

    const success = check(response, {
      'metrics: status 200': (r) => r.status === 200,
      'metrics: has time_series': (r) => {
        try {
          const data = JSON.parse(r.body);
          return data.time_series !== undefined;
        } catch {
          return false;
        }
      },
      'metrics: response time < 500ms': () => duration < 500,
    });

    if (!success) errorRate.add(1);
    else errorRate.add(0);
  });
}

// Teardown function - cleanup
export function teardown(data) {
  console.log('Cleaning up test data...');

  // Delete test memories
  if (data.memoryIds) {
    data.memoryIds.forEach(id => {
      http.del(`${BASE_URL}/memories/${id}`, {
        headers: { 'X-API-Key': API_KEY },
      });
    });
  }

  console.log('Load test complete!');
}

// Handle summary at the end
export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const colors = options.enableColors || false;

  let summary = '\n' + indent + '================== LOAD TEST SUMMARY ==================\n\n';

  // Test duration
  const duration = data.state.testRunDurationMs / 1000;
  summary += indent + `Test Duration: ${duration.toFixed(2)}s\n\n`;

  // Request stats
  const iterations = data.metrics.iterations.values.count;
  const requests = data.metrics.http_reqs.values.count;
  const rps = (requests / duration).toFixed(2);

  summary += indent + `Total Iterations: ${iterations}\n`;
  summary += indent + `Total Requests: ${requests}\n`;
  summary += indent + `Requests/sec: ${rps}\n\n`;

  // Response times
  summary += indent + 'Response Times (p95):\n';
  summary += indent + `  Predict:      ${data.metrics.prediction_latency.values['p(95)'].toFixed(2)}ms\n`;
  summary += indent + `  Suggest:      ${data.metrics.suggestion_latency.values['p(95)'].toFixed(2)}ms\n`;
  summary += indent + `  Search:       ${data.metrics.search_latency.values['p(95)'].toFixed(2)}ms\n`;
  summary += indent + `  Maintenance:  ${data.metrics.maintenance_latency.values['p(95)'].toFixed(2)}ms\n`;
  summary += indent + `  Metrics:      ${data.metrics.metrics_latency.values['p(95)'].toFixed(2)}ms\n\n`;

  // Error rate
  const errorRate = (data.metrics.errors.values.rate * 100).toFixed(2);
  summary += indent + `Error Rate: ${errorRate}%\n`;

  // Check success rate
  const checkRate = (data.metrics.checks.values.rate * 100).toFixed(2);
  summary += indent + `Check Success Rate: ${checkRate}%\n\n`;

  // Thresholds
  summary += indent + 'Threshold Results:\n';
  Object.keys(data.thresholds).forEach(key => {
    const passed = data.thresholds[key].ok ? '✓ PASS' : '✗ FAIL';
    summary += indent + `  ${key}: ${passed}\n`;
  });

  summary += '\n' + indent + '========================================================\n';

  return summary;
}

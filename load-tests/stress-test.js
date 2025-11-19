/**
 * Stress Test - Break Point Testing
 * Finds the maximum capacity before system degrades
 *
 * Run: k6 run load-tests/stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api/v1';
const API_KEY = __ENV.API_KEY || 'test-api-key';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Normal
    { duration: '5m', target: 200 },   // 200%
    { duration: '5m', target: 300 },   // 300%
    { duration: '5m', target: 400 },   // 400%
    { duration: '5m', target: 500 },   // 500% - find break point
    { duration: '10m', target: 500 },  // Hold at break point
    { duration: '3m', target: 0 },     // Recovery
  ],

  thresholds: {
    'errors': ['rate<0.05'],  // Allow 5% errors in stress test
    'http_req_duration': ['p(95)<1000', 'p(99)<2000'],
  },
};

export default function() {
  const endpoints = [
    {
      name: 'predict',
      weight: 0.4,
      fn: () => http.get(
        `${BASE_URL}/memories/predict?limit=5`,
        { headers: { 'X-API-Key': API_KEY } }
      ),
    },
    {
      name: 'suggest',
      weight: 0.3,
      fn: () => http.post(
        `${BASE_URL}/memories/suggest`,
        JSON.stringify({ context: 'test', limit: 5 }),
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
        }
      ),
    },
    {
      name: 'search',
      weight: 0.3,
      fn: () => http.post(
        `${BASE_URL}/memories/search`,
        JSON.stringify({ query: 'test', limit: 10 }),
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
        }
      ),
    },
  ];

  // Weighted random endpoint selection
  const rand = Math.random();
  let cumulative = 0;
  let endpoint;

  for (const ep of endpoints) {
    cumulative += ep.weight;
    if (rand <= cumulative) {
      endpoint = ep;
      break;
    }
  }

  const start = Date.now();
  const response = endpoint.fn();
  const duration = Date.now() - start;

  responseTime.add(duration);

  const success = check(response, {
    'status is 200 or 500': (r) => r.status === 200 || r.status === 500,
  });

  if (!success || response.status >= 500) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(0.1); // Minimal sleep in stress test
}

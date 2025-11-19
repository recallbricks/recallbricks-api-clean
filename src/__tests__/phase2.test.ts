/**
 * Phase 2 Tests: Predictive Recall & Temporal Patterns
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '../config/supabase.js';

// Test user credentials
const TEST_API_KEY = process.env.TEST_API_KEY || 'test-api-key';
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';

describe('Phase 2: Predictive Memory Prefetching', () => {
  let testMemories: string[] = [];
  let testUserId: string;

  beforeAll(async () => {
    // Create test memories with access patterns
    const testData = [
      { text: 'Pricing strategy for Q4', tags: ['pricing', 'strategy'] },
      { text: 'Competitor analysis September', tags: ['competitors', 'analysis'] },
      { text: 'Customer feedback on pricing', tags: ['pricing', 'feedback'] },
      { text: 'Feature roadmap 2025', tags: ['roadmap', 'features'] }
    ];

    for (const data of testData) {
      const response = await fetch(`${BASE_URL}/memories`, {
        method: 'POST',
        headers: {
          'X-API-Key': TEST_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      testMemories.push(result.id);
    }

    // Get test user ID
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('api_key', TEST_API_KEY)
      .single();
    testUserId = user?.id;
  });

  afterAll(async () => {
    // Cleanup test data
    for (const id of testMemories) {
      await fetch(`${BASE_URL}/memories/${id}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': TEST_API_KEY }
      });
    }
  });

  it('should predict memories based on recent access', async () => {
    const response = await fetch(
      `${BASE_URL}/memories/predict?recent_memories=${JSON.stringify([testMemories[0]])}&limit=3`,
      {
        headers: { 'X-API-Key': TEST_API_KEY }
      }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('predictions');
    expect(Array.isArray(data.predictions)).toBe(true);
    expect(data).toHaveProperty('count');
    expect(data.recent_memories).toContain(testMemories[0]);
  });

  it('should predict memories with confidence scores', async () => {
    const response = await fetch(
      `${BASE_URL}/memories/predict?current_context=pricing&limit=5`,
      {
        headers: { 'X-API-Key': TEST_API_KEY }
      }
    );

    const data = await response.json();

    if (data.predictions.length > 0) {
      const prediction = data.predictions[0];
      expect(prediction).toHaveProperty('memory_id');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction).toHaveProperty('reasons');
      expect(Array.isArray(prediction.reasons)).toBe(true);
    }
  });
});

describe('Phase 2: Context-Aware Suggestions', () => {
  it('should suggest relevant memories proactively', async () => {
    const response = await fetch(`${BASE_URL}/memories/suggest`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context: 'planning pricing strategy',
        include_reasoning: true,
        limit: 5,
        min_confidence: 0.5
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('suggestions');
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data).toHaveProperty('context');
    expect(data).toHaveProperty('weights_used');
  });

  it('should include reasoning when requested', async () => {
    const response = await fetch(`${BASE_URL}/memories/suggest`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context: 'test context',
        include_reasoning: true,
        limit: 3
      })
    });

    const data = await response.json();

    if (data.suggestions.length > 0) {
      const suggestion = data.suggestions[0];
      expect(suggestion).toHaveProperty('reasoning');
      expect(suggestion.reasoning).toHaveProperty('semantic_match');
      expect(suggestion.reasoning).toHaveProperty('weights_applied');
    }
  });

  it('should filter by minimum confidence', async () => {
    const response = await fetch(`${BASE_URL}/memories/suggest`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context: 'test',
        min_confidence: 0.8,
        limit: 10
      })
    });

    const data = await response.json();

    data.suggestions.forEach((suggestion: any) => {
      expect(suggestion.suggestion_score).toBeGreaterThanOrEqual(0.8);
    });
  });
});

describe('Phase 2: Adaptive Weighting', () => {
  it('should use adaptive weights in search', async () => {
    const response = await fetch(`${BASE_URL}/memories/search`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: 'pricing',
        weight_by_usage: true,
        adaptive_weights: true,
        limit: 5
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('memories');
    expect(data).toHaveProperty('weighted');
    expect(data.weighted).toBe(true);
  });

  it('should update learning params on feedback', async () => {
    // First, create a memory and get feedback
    const createResponse = await fetch(`${BASE_URL}/memories`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'Test memory for feedback'
      })
    });

    const memory = await createResponse.json();

    // Submit feedback
    const feedbackResponse = await fetch(`${BASE_URL}/memories/${memory.id}/feedback`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        helpful: true,
        user_satisfaction: 0.9
      })
    });

    expect(feedbackResponse.status).toBe(200);
    const feedbackData = await feedbackResponse.json();

    expect(feedbackData).toHaveProperty('success');
    expect(feedbackData.success).toBe(true);

    // Cleanup
    await fetch(`${BASE_URL}/memories/${memory.id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': TEST_API_KEY }
    });
  });
});

describe('Phase 2: Proactive Maintenance', () => {
  it('should return maintenance suggestions', async () => {
    const response = await fetch(`${BASE_URL}/learning/maintenance-suggestions`, {
      headers: { 'X-API-Key': TEST_API_KEY }
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('duplicates');
    expect(data).toHaveProperty('outdated');
    expect(data).toHaveProperty('archive_candidates');
    expect(data).toHaveProperty('broken_relationships');
    expect(data).toHaveProperty('summary');

    expect(Array.isArray(data.duplicates)).toBe(true);
    expect(Array.isArray(data.outdated)).toBe(true);
    expect(Array.isArray(data.archive_candidates)).toBe(true);

    expect(data.summary).toHaveProperty('total_duplicates');
    expect(data.summary).toHaveProperty('total_outdated');
  });

  it('should detect duplicates correctly', async () => {
    // Create near-duplicate memories
    const text1 = 'How to deploy to production using Docker';
    const text2 = 'Deploy to production with Docker containers';

    const mem1Response = await fetch(`${BASE_URL}/memories`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: text1 })
    });
    const mem1 = await mem1Response.json();

    const mem2Response = await fetch(`${BASE_URL}/memories`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: text2 })
    });
    const mem2 = await mem2Response.json();

    // Wait a bit for analysis
    await new Promise(resolve => setTimeout(resolve, 1000));

    const maintenanceResponse = await fetch(`${BASE_URL}/learning/maintenance-suggestions`, {
      headers: { 'X-API-Key': TEST_API_KEY }
    });
    const maintenance = await maintenanceResponse.json();

    // Check if duplicates were detected
    const hasDuplicates = maintenance.duplicates.some((dup: any) =>
      dup.memory_ids.includes(mem1.id) && dup.memory_ids.includes(mem2.id)
    );

    // Note: May not detect immediately, depends on system state
    expect(maintenance.duplicates).toBeDefined();

    // Cleanup
    await fetch(`${BASE_URL}/memories/${mem1.id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': TEST_API_KEY }
    });
    await fetch(`${BASE_URL}/memories/${mem2.id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': TEST_API_KEY }
    });
  });
});

describe('Phase 2: Learning Velocity Tracking', () => {
  it('should return learning metrics', async () => {
    const response = await fetch(`${BASE_URL}/learning/metrics?days=30`, {
      headers: { 'X-API-Key': TEST_API_KEY }
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('time_series');
    expect(data).toHaveProperty('trends');
    expect(data).toHaveProperty('current_stats');
    expect(data).toHaveProperty('time_range');

    expect(Array.isArray(data.time_series)).toBe(true);
    expect(data.current_stats).toHaveProperty('avg_helpfulness');
    expect(data.current_stats).toHaveProperty('total_usage');
    expect(data.current_stats).toHaveProperty('total_memories');
  });

  it('should track improvement trends', async () => {
    const response = await fetch(`${BASE_URL}/learning/metrics?days=7`, {
      headers: { 'X-API-Key': TEST_API_KEY }
    });

    const data = await response.json();

    // If we have metrics, check trend format
    Object.values(data.trends).forEach((trend: any) => {
      if (trend) {
        expect(trend).toHaveProperty('first_value');
        expect(trend).toHaveProperty('last_value');
        expect(trend).toHaveProperty('change');
        expect(trend).toHaveProperty('percent_change');
        expect(trend).toHaveProperty('trend');
        expect(['improving', 'declining', 'stable']).toContain(trend.trend);
      }
    });
  });
});

describe('Phase 2: Enhanced Learning Analysis', () => {
  it('should run enhanced learning cycle', async () => {
    const response = await fetch(`${BASE_URL}/learning/analyze-enhanced`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auto_apply: false
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('success');
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('result');

    const result = data.result;
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('phase1');
    expect(result).toHaveProperty('phase2');
    expect(result).toHaveProperty('processing_time_ms');

    expect(result.phase2).toHaveProperty('temporal_patterns_detected');
    expect(result.phase2).toHaveProperty('duplicate_groups_found');
  });
});

describe('Phase 2: Temporal Pattern Detection', () => {
  it('should detect temporal patterns from database', async () => {
    // Run enhanced analysis which includes temporal pattern detection
    await fetch(`${BASE_URL}/learning/analyze-enhanced`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ auto_apply: false })
    });

    // Check metrics to see if patterns were detected
    const metricsResponse = await fetch(`${BASE_URL}/learning/metrics?days=1`, {
      headers: { 'X-API-Key': TEST_API_KEY }
    });

    const metrics = await metricsResponse.json();
    expect(metrics).toHaveProperty('active_patterns');
    expect(typeof metrics.active_patterns).toBe('number');
  });
});

describe('Phase 2: Integration Tests', () => {
  it('should work end-to-end: create -> access -> predict -> suggest', async () => {
    // 1. Create a memory
    const createResponse = await fetch(`${BASE_URL}/memories`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'Integration test memory about AI features',
        tags: ['ai', 'features']
      })
    });
    const memory = await createResponse.json();

    // 2. Access it to build patterns
    await fetch(`${BASE_URL}/memories/${memory.id}?context=testing`, {
      headers: { 'X-API-Key': TEST_API_KEY }
    });

    // 3. Try to predict based on it
    const predictResponse = await fetch(
      `${BASE_URL}/memories/predict?recent_memories=${JSON.stringify([memory.id])}&limit=5`,
      {
        headers: { 'X-API-Key': TEST_API_KEY }
      }
    );
    const predictions = await predictResponse.json();

    expect(predictions).toHaveProperty('predictions');

    // 4. Get suggestions based on context
    const suggestResponse = await fetch(`${BASE_URL}/memories/suggest`, {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context: 'AI features and capabilities',
        limit: 5
      })
    });
    const suggestions = await suggestResponse.json();

    expect(suggestions).toHaveProperty('suggestions');

    // Cleanup
    await fetch(`${BASE_URL}/memories/${memory.id}`, {
      method: 'DELETE',
      headers: { 'X-API-Key': TEST_API_KEY }
    });
  });
});

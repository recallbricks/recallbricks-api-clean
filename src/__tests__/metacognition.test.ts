/**
 * Metacognition & Self-Learning Tests
 *
 * Tests for Phase 1: Usage tracking, weighted search, feedback, and pattern analysis
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { supabase } from '../config/supabase.js';

// Test configuration
const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:8080';
const TEST_API_KEY = process.env.TEST_API_KEY || 'test-key';

describe('Metacognition - Phase 1: Usage Tracking', () => {
  let testMemoryId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user and memory
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single();

    testUserId = user?.id || 'test-user-id';

    // Create a test memory
    const response = await request(API_BASE_URL)
      .post('/api/v1/memories')
      .set('X-API-Key', TEST_API_KEY)
      .send({
        text: 'Test memory for metacognition',
        tags: ['test', 'metacognition'],
        source: 'api'
      });

    testMemoryId = response.body.id;
  });

  describe('GET /api/v1/memories/:id - Usage Tracking', () => {
    it('should track usage when memory is accessed', async () => {
      // Access the memory
      const response = await request(API_BASE_URL)
        .get(`/api/v1/memories/${testMemoryId}`)
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testMemoryId);

      // Wait for async tracking to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that usage_count was incremented
      const { data } = await supabase
        .from('memories')
        .select('usage_count, last_accessed')
        .eq('id', testMemoryId)
        .single();

      expect(data?.usage_count).toBeGreaterThan(0);
      expect(data?.last_accessed).toBeTruthy();
    });

    it('should include learning_metadata in response', async () => {
      const response = await request(API_BASE_URL)
        .get(`/api/v1/memories/${testMemoryId}`)
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.learning_metadata).toBeDefined();
      expect(response.body.learning_metadata.access_frequency).toBeDefined();
    });

    it('should track context when provided', async () => {
      const response = await request(API_BASE_URL)
        .get(`/api/v1/memories/${testMemoryId}?context=pricing_query`)
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check access_pattern was updated
      const { data } = await supabase
        .from('memories')
        .select('access_pattern')
        .eq('id', testMemoryId)
        .single();

      const accessPattern = data?.access_pattern || {};
      expect(accessPattern.contexts?.pricing_query).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/memories/search - Weighted Search', () => {
    let frequentMemoryId: string;
    let rareMemoryId: string;

    beforeAll(async () => {
      // Create two similar memories
      const response1 = await request(API_BASE_URL)
        .post('/api/v1/memories')
        .set('X-API-Key', TEST_API_KEY)
        .send({ text: 'Product pricing information', tags: ['pricing'] });

      frequentMemoryId = response1.body.id;

      const response2 = await request(API_BASE_URL)
        .post('/api/v1/memories')
        .set('X-API-Key', TEST_API_KEY)
        .send({ text: 'Pricing details and structure', tags: ['pricing'] });

      rareMemoryId = response2.body.id;

      // Simulate frequent access to first memory
      await supabase
        .from('memories')
        .update({
          usage_count: 50,
          helpfulness_score: 0.9,
          last_accessed: new Date().toISOString()
        })
        .eq('id', frequentMemoryId);

      // Simulate rare access to second memory
      await supabase
        .from('memories')
        .update({
          usage_count: 1,
          helpfulness_score: 0.5,
          last_accessed: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', rareMemoryId);
    });

    it('should return results without weighting by default', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/v1/memories/search')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          query: 'pricing',
          limit: 10
        });

      expect(response.status).toBe(200);
      expect(response.body.weighted).toBe(false);
      expect(response.body.memories).toBeDefined();
    });

    it('should apply usage-based weighting when requested', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/v1/memories/search')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          query: 'pricing',
          limit: 10,
          weight_by_usage: true
        });

      expect(response.status).toBe(200);
      expect(response.body.weighted).toBe(true);

      const memories = response.body.memories;
      expect(memories.length).toBeGreaterThan(0);

      // Frequently accessed memory should rank higher
      const frequentMem = memories.find((m: any) => m.id === frequentMemoryId);
      expect(frequentMem).toBeDefined();
      expect(frequentMem.boosted_by_usage).toBe(true);
      expect(frequentMem.weighted_score).toBeGreaterThan(frequentMem.base_similarity);
    });

    it('should apply recency decay when requested', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/v1/memories/search')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          query: 'pricing',
          limit: 10,
          decay_old_memories: true
        });

      expect(response.status).toBe(200);
      expect(response.body.weighted).toBe(true);

      const memories = response.body.memories;
      const staleMem = memories.find((m: any) => m.id === rareMemoryId);

      if (staleMem) {
        expect(staleMem.penalized_by_age).toBe(true);
      }
    });

    it('should filter by minimum helpfulness score', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/v1/memories/search')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          query: 'pricing',
          limit: 10,
          weight_by_usage: true,
          min_helpfulness_score: 0.8
        });

      expect(response.status).toBe(200);

      const memories = response.body.memories;
      memories.forEach((mem: any) => {
        expect(mem.helpfulness_score).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should track search results in learning mode', async () => {
      const initialUsageCount = (await supabase
        .from('memories')
        .select('usage_count')
        .eq('id', frequentMemoryId)
        .single()).data?.usage_count || 0;

      await request(API_BASE_URL)
        .post('/api/v1/memories/search')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          query: 'pricing',
          limit: 10,
          learning_mode: true
        });

      await new Promise(resolve => setTimeout(resolve, 100));

      const newUsageCount = (await supabase
        .from('memories')
        .select('usage_count')
        .eq('id', frequentMemoryId)
        .single()).data?.usage_count || 0;

      expect(newUsageCount).toBeGreaterThan(initialUsageCount);
    });
  });

  describe('POST /api/v1/memories/:id/feedback', () => {
    it('should accept positive feedback and increase helpfulness score', async () => {
      const initialScore = (await supabase
        .from('memories')
        .select('helpfulness_score')
        .eq('id', testMemoryId)
        .single()).data?.helpfulness_score || 0.5;

      const response = await request(API_BASE_URL)
        .post(`/api/v1/memories/${testMemoryId}/feedback`)
        .set('X-API-Key', TEST_API_KEY)
        .send({
          helpful: true,
          context: 'Very useful for pricing questions'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.new_helpfulness_score).toBeGreaterThan(initialScore);
    });

    it('should accept negative feedback and decrease helpfulness score', async () => {
      const initialScore = (await supabase
        .from('memories')
        .select('helpfulness_score')
        .eq('id', testMemoryId)
        .single()).data?.helpfulness_score || 0.5;

      const response = await request(API_BASE_URL)
        .post(`/api/v1/memories/${testMemoryId}/feedback`)
        .set('X-API-Key', TEST_API_KEY)
        .send({
          helpful: false,
          context: 'Not relevant to my query'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.new_helpfulness_score).toBeLessThan(initialScore);
    });

    it('should accept user satisfaction scores', async () => {
      const response = await request(API_BASE_URL)
        .post(`/api/v1/memories/${testMemoryId}/feedback`)
        .set('X-API-Key', TEST_API_KEY)
        .send({
          helpful: true,
          user_satisfaction: 0.95
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.feedback.user_satisfaction).toBe(0.95);
    });

    it('should validate user_satisfaction is between 0 and 1', async () => {
      const response = await request(API_BASE_URL)
        .post(`/api/v1/memories/${testMemoryId}/feedback`)
        .set('X-API-Key', TEST_API_KEY)
        .send({
          helpful: true,
          user_satisfaction: 1.5
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bad Request');
    });

    it('should store feedback context in access_pattern', async () => {
      await request(API_BASE_URL)
        .post(`/api/v1/memories/${testMemoryId}/feedback`)
        .set('X-API-Key', TEST_API_KEY)
        .send({
          helpful: true,
          context: 'Helped with customer support'
        });

      const { data } = await supabase
        .from('memories')
        .select('access_pattern')
        .eq('id', testMemoryId)
        .single();

      const accessPattern = data?.access_pattern || {};
      expect(accessPattern.feedback_contexts).toBeDefined();
      expect(Array.isArray(accessPattern.feedback_contexts)).toBe(true);
    });
  });

  describe('GET /api/v1/memories/meta/patterns', () => {
    it('should return pattern analysis', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/v1/memories/meta/patterns')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.most_useful_tags).toBeDefined();
      expect(Array.isArray(response.body.most_useful_tags)).toBe(true);
      expect(response.body.frequently_accessed_together).toBeDefined();
      expect(response.body.underutilized_memories).toBeDefined();
      expect(response.body.summary).toBeDefined();
    });

    it('should include summary statistics', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/v1/memories/meta/patterns')
        .set('X-API-Key', TEST_API_KEY);

      const summary = response.body.summary;
      expect(summary.total_memories).toBeGreaterThanOrEqual(0);
      expect(summary.total_accesses).toBeGreaterThanOrEqual(0);
      expect(summary.avg_helpfulness).toBeGreaterThanOrEqual(0);
      expect(summary.avg_helpfulness).toBeLessThanOrEqual(1);
    });

    it('should identify underutilized memories', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/v1/memories/meta/patterns')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.body.underutilized_memories).toBeDefined();
      expect(Array.isArray(response.body.underutilized_memories)).toBe(true);
    });

    it('should calculate optimal relationship types', async () => {
      const response = await request(API_BASE_URL)
        .get('/api/v1/memories/meta/patterns')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.body.optimal_relationship_types).toBeDefined();
      expect(typeof response.body.optimal_relationship_types).toBe('object');
    });
  });

  describe('POST /api/v1/learning/analyze', () => {
    it('should trigger learning analysis', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/v1/learning/analyze')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          auto_apply: false
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.clusters_detected).toBeGreaterThanOrEqual(0);
      expect(response.body.result.relationship_suggestions).toBeDefined();
      expect(Array.isArray(response.body.result.relationship_suggestions)).toBe(true);
    });

    it('should generate relationship suggestions', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/v1/learning/analyze')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          auto_apply: false
        });

      const suggestions = response.body.result.relationship_suggestions;
      expect(Array.isArray(suggestions)).toBe(true);

      if (suggestions.length > 0) {
        const suggestion = suggestions[0];
        expect(suggestion.memory_id).toBeDefined();
        expect(suggestion.related_memory_id).toBeDefined();
        expect(suggestion.suggested_type).toBeDefined();
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate relationship usefulness', async () => {
      const response = await request(API_BASE_URL)
        .post('/api/v1/learning/analyze')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          auto_apply: false
        });

      const weights = response.body.result.weight_adjustments;
      expect(weights).toBeDefined();
      expect(typeof weights).toBe('object');
    });
  });

  afterAll(async () => {
    // Clean up test data
    if (testMemoryId) {
      await supabase
        .from('memories')
        .delete()
        .eq('id', testMemoryId);
    }
  });
});

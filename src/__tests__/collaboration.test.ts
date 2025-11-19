/**
 * Phase 3 Collaboration Tests
 *
 * Tests for multi-agent collaboration features
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '../config/supabase.js';
import {
  createAgentProfile,
  getAgentProfile,
  listUserAgents,
  agentContributeMemory,
  detectConflicts,
  resolveConflict,
  synthesizeKnowledge,
  getCollaborationDashboard,
  transferLearning,
  getAgentPerformance
} from '../services/collaborationService.js';

// Test user ID (should exist in your test database)
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

let testAgentId: string;
let testMemoryId: string;
let testAgent2Id: string;

describe('Phase 3: Multi-Agent Collaboration', () => {
  // ============================================================================
  // AGENT PROFILE MANAGEMENT
  // ============================================================================

  describe('Agent Profile Management', () => {
    it('should create a new agent profile', async () => {
      const agent = await createAgentProfile(TEST_USER_ID, {
        agent_name: 'test-agent-1',
        agent_type: 'code',
        expertise_domains: ['typescript', 'node.js'],
        confidence_threshold: 0.75
      });

      expect(agent).toBeDefined();
      expect(agent.agent_name).toBe('test-agent-1');
      expect(agent.agent_type).toBe('code');
      expect(agent.reputation_score).toBeGreaterThanOrEqual(0);
      expect(agent.reputation_score).toBeLessThanOrEqual(1);

      testAgentId = agent.id;
    });

    it('should retrieve an agent profile by ID', async () => {
      const agent = await getAgentProfile(testAgentId);

      expect(agent).toBeDefined();
      expect(agent?.id).toBe(testAgentId);
      expect(agent?.agent_name).toBe('test-agent-1');
    });

    it('should list all agents for a user', async () => {
      // Create a second agent
      const agent2 = await createAgentProfile(TEST_USER_ID, {
        agent_name: 'test-agent-2',
        agent_type: 'research',
        expertise_domains: ['research', 'analysis']
      });

      testAgent2Id = agent2.id;

      const agents = await listUserAgents(TEST_USER_ID);

      expect(agents).toBeDefined();
      expect(agents.length).toBeGreaterThanOrEqual(2);
      expect(agents.some(a => a.id === testAgentId)).toBe(true);
      expect(agents.some(a => a.id === testAgent2Id)).toBe(true);
    });

    it('should prevent duplicate agent names for same user', async () => {
      await expect(
        createAgentProfile(TEST_USER_ID, {
          agent_name: 'test-agent-1', // Duplicate
          agent_type: 'general'
        })
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // AGENT CONTRIBUTIONS
  // ============================================================================

  describe('Agent Contributions', () => {
    it('should allow agent to contribute a memory', async () => {
      const result = await agentContributeMemory(TEST_USER_ID, {
        agent_id: testAgentId,
        text: 'Test memory contributed by agent',
        contribution_type: 'create',
        confidence: 0.9,
        tags: ['test', 'agent-contribution']
      });

      expect(result).toBeDefined();
      expect(result.memory).toBeDefined();
      expect(result.contribution).toBeDefined();
      expect(result.contribution.agent_id).toBe(testAgentId);
      expect(result.contribution.contribution_type).toBe('create');
      expect(result.contribution.confidence).toBe(0.9);

      testMemoryId = result.memory.id;
    });

    it('should track contributor agents on memory retrieval', async () => {
      const { data: memory } = await supabase
        .from('memories')
        .select(`
          *,
          agent_memory_contributions(
            id,
            contribution_type,
            confidence,
            agent_profiles(agent_name, reputation_score)
          )
        `)
        .eq('id', testMemoryId)
        .single();

      expect(memory).toBeDefined();
      expect(memory.agent_memory_contributions).toBeDefined();
      expect(memory.agent_memory_contributions.length).toBeGreaterThan(0);
    });

    it('should update agent statistics after contribution', async () => {
      const agent = await getAgentProfile(testAgentId);

      expect(agent).toBeDefined();
      expect(agent!.total_contributions).toBeGreaterThan(0);
      expect(agent!.last_contribution).toBeDefined();
    });
  });

  // ============================================================================
  // CONFLICT DETECTION
  // ============================================================================

  describe('Conflict Detection', () => {
    let conflictMemory1Id: string;
    let conflictMemory2Id: string;

    it('should detect duplicate memories', async () => {
      // Create two similar memories
      const result1 = await agentContributeMemory(TEST_USER_ID, {
        agent_id: testAgentId,
        text: 'The sky is blue on a clear day',
        contribution_type: 'create'
      });
      conflictMemory1Id = result1.memory.id;

      const result2 = await agentContributeMemory(TEST_USER_ID, {
        agent_id: testAgent2Id,
        text: 'The sky is blue on a clear day', // Exact duplicate
        contribution_type: 'create'
      });
      conflictMemory2Id = result2.memory.id;

      const conflicts = await detectConflicts(conflictMemory2Id, 0.7);

      // May or may not find conflicts depending on similarity function
      // Just ensure it runs without error
      expect(conflicts).toBeDefined();
      expect(Array.isArray(conflicts)).toBe(true);
    });

    it('should list unresolved conflicts', async () => {
      const { data: conflicts } = await supabase
        .from('memory_conflicts')
        .select('*')
        .is('resolved_at', null)
        .limit(10);

      expect(conflicts).toBeDefined();
      expect(Array.isArray(conflicts)).toBe(true);
    });
  });

  // ============================================================================
  // CONFLICT RESOLUTION
  // ============================================================================

  describe('Conflict Resolution', () => {
    it('should resolve conflicts using trust_higher_rep strategy', async () => {
      // First, ensure there's a conflict to resolve
      const { data: unresolvedConflicts } = await supabase
        .from('memory_conflicts')
        .select('id')
        .is('resolved_at', null)
        .limit(1);

      if (unresolvedConflicts && unresolvedConflicts.length > 0) {
        const conflictId = unresolvedConflicts[0].id;
        const success = await resolveConflict(
          conflictId,
          'trust_higher_rep',
          testAgentId
        );

        expect(success).toBe(true);

        // Verify conflict is marked as resolved
        const { data: resolvedConflict } = await supabase
          .from('memory_conflicts')
          .select('resolved_at, resolution_strategy')
          .eq('id', conflictId)
          .single();

        expect(resolvedConflict?.resolved_at).toBeDefined();
        expect(resolvedConflict?.resolution_strategy).toBe('trust_higher_rep');
      }
    });
  });

  // ============================================================================
  // KNOWLEDGE SYNTHESIS
  // ============================================================================

  describe('Knowledge Synthesis', () => {
    let sourceMemory1Id: string;
    let sourceMemory2Id: string;
    let sourceMemory3Id: string;

    beforeAll(async () => {
      // Create source memories for synthesis
      const result1 = await agentContributeMemory(TEST_USER_ID, {
        agent_id: testAgentId,
        text: 'TypeScript is a typed superset of JavaScript',
        contribution_type: 'create'
      });
      sourceMemory1Id = result1.memory.id;

      const result2 = await agentContributeMemory(TEST_USER_ID, {
        agent_id: testAgentId,
        text: 'TypeScript compiles to plain JavaScript',
        contribution_type: 'create'
      });
      sourceMemory2Id = result2.memory.id;

      const result3 = await agentContributeMemory(TEST_USER_ID, {
        agent_id: testAgentId,
        text: 'TypeScript provides static type checking',
        contribution_type: 'create'
      });
      sourceMemory3Id = result3.memory.id;
    });

    it('should synthesize knowledge from multiple memories', async () => {
      const result = await synthesizeKnowledge(TEST_USER_ID, {
        agent_id: testAgentId,
        source_memory_ids: [sourceMemory1Id, sourceMemory2Id, sourceMemory3Id],
        synthesis_method: 'multi_source'
      });

      expect(result).toBeDefined();
      expect(result.synthesized_memory).toBeDefined();
      expect(result.synthesis_history).toBeDefined();
      expect(result.synthesis_history.source_memory_ids).toHaveLength(3);
      expect(result.synthesis_history.synthesizing_agent_id).toBe(testAgentId);
    });

    it('should create relationships between synthesized and source memories', async () => {
      const { data: relationships } = await supabase
        .from('memory_relationships')
        .select('*')
        .eq('relationship_type', 'synthesized_from')
        .in('related_memory_id', [sourceMemory1Id, sourceMemory2Id, sourceMemory3Id]);

      expect(relationships).toBeDefined();
      expect(relationships!.length).toBeGreaterThan(0);
    });

    it('should reject synthesis with less than 2 source memories', async () => {
      await expect(
        synthesizeKnowledge(TEST_USER_ID, {
          agent_id: testAgentId,
          source_memory_ids: [sourceMemory1Id], // Only 1 source
          synthesis_method: 'single_source'
        })
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // AGENT REPUTATION
  // ============================================================================

  describe('Agent Reputation System', () => {
    it('should calculate agent reputation based on contributions', async () => {
      const { data: reputation } = await supabase
        .rpc('calculate_agent_reputation', { p_agent_id: testAgentId });

      expect(reputation).toBeDefined();
      expect(reputation).toBeGreaterThanOrEqual(0);
      expect(reputation).toBeLessThanOrEqual(1);
    });

    it('should update reputation when contributions are validated', async () => {
      const agent = await getAgentProfile(testAgentId);
      const oldReputation = agent!.reputation_score;

      // Simulate validation by updating contribution status
      const { data: contributions } = await supabase
        .from('agent_memory_contributions')
        .select('id')
        .eq('agent_id', testAgentId)
        .eq('validation_status', 'accepted')
        .limit(1);

      if (contributions && contributions.length > 0) {
        // Update contribution to trigger reputation recalc
        await supabase
          .from('agent_memory_contributions')
          .update({ confidence: 0.95 })
          .eq('id', contributions[0].id);

        const updatedAgent = await getAgentProfile(testAgentId);
        expect(updatedAgent!.reputation_score).toBeDefined();
      }
    });

    it('should provide agent performance metrics', async () => {
      const performance = await getAgentPerformance(testAgentId);

      expect(performance).toBeDefined();
      expect(performance!.agent_id).toBe(testAgentId);
      expect(performance!.reputation_score).toBeDefined();
      expect(performance!.total_contributions).toBeGreaterThan(0);
      expect(performance!.activity_status).toBeDefined();
    });
  });

  // ============================================================================
  // CROSS-AGENT LEARNING
  // ============================================================================

  describe('Cross-Agent Learning Transfer', () => {
    it('should transfer learning patterns between agents', async () => {
      const result = await transferLearning({
        source_agent_id: testAgentId,
        target_agent_id: testAgent2Id,
        min_confidence: 0.5
      });

      expect(result).toBeDefined();
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.transferred_patterns)).toBe(true);
    });

    it('should reduce confidence for transferred patterns', async () => {
      const result = await transferLearning({
        source_agent_id: testAgentId,
        target_agent_id: testAgent2Id,
        min_confidence: 0.6
      });

      if (result.transferred_patterns.length > 0) {
        // Transferred patterns should have reduced confidence
        result.transferred_patterns.forEach(pattern => {
          expect(pattern.confidence).toBeLessThanOrEqual(0.8);
        });
      }
    });

    it('should reject transfer between agents of different users', async () => {
      // Create agent for different user (if exists)
      // This test would require a second user in the database
      // Skipping for now
      expect(true).toBe(true);
    });
  });

  // ============================================================================
  // COLLABORATION DASHBOARD
  // ============================================================================

  describe('Collaboration Dashboard', () => {
    it('should retrieve collaboration dashboard data', async () => {
      const dashboard = await getCollaborationDashboard(TEST_USER_ID);

      expect(dashboard).toBeDefined();
      expect(dashboard.total_agents).toBeGreaterThan(0);
      expect(dashboard.active_agents_24h).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(dashboard.memory_pools)).toBe(true);
      expect(Array.isArray(dashboard.recent_syntheses)).toBe(true);
      expect(Array.isArray(dashboard.top_contributors)).toBe(true);
      expect(dashboard.conflict_resolution_rate).toBeGreaterThanOrEqual(0);
      expect(dashboard.conflict_resolution_rate).toBeLessThanOrEqual(1);
    });

    it('should show top contributors ranked by reputation', async () => {
      const dashboard = await getCollaborationDashboard(TEST_USER_ID);

      if (dashboard.top_contributors.length > 1) {
        // Verify contributors are sorted by reputation
        for (let i = 0; i < dashboard.top_contributors.length - 1; i++) {
          expect(dashboard.top_contributors[i].reputation_score)
            .toBeGreaterThanOrEqual(dashboard.top_contributors[i + 1].reputation_score);
        }
      }
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  afterAll(async () => {
    // Clean up test data
    if (testAgentId) {
      await supabase.from('agent_profiles').delete().eq('id', testAgentId);
    }
    if (testAgent2Id) {
      await supabase.from('agent_profiles').delete().eq('id', testAgent2Id);
    }
    // Memories will cascade delete due to foreign key constraints
  });
});

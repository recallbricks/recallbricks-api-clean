# Multi-Agent Collaboration Guide

Learn how to effectively use RecallBricks Phase 3 collaboration features to build intelligent multi-agent systems.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Agent Design Patterns](#agent-design-patterns)
- [Collaboration Workflows](#collaboration-workflows)
- [Best Practices](#best-practices)
- [Use Cases](#use-cases)
- [Advanced Patterns](#advanced-patterns)

---

## Core Concepts

### Agent Profiles

Agents are autonomous entities that contribute to your memory system. Each agent has:

- **Identity**: Name and type
- **Expertise**: Specialized domains
- **Reputation**: Score based on contribution quality
- **Activity**: Contribution history and patterns

### Contribution Types

- **Create**: Agent creates a new memory
- **Update**: Agent modifies existing memory
- **Validate**: Agent verifies another's contribution
- **Synthesize**: Agent combines multiple memories
- **Enrich**: Agent adds context to memory

### Reputation System

Reputation scores (0.0-1.0) are calculated from:
- **Acceptance Rate** (60%): Ratio of accepted contributions
- **Helpfulness** (40%): Average helpfulness of contributions
- **Experience Bonus** (up to 20%): Reward for consistent contributions

---

## Agent Design Patterns

### 1. Specialized Agents

Create agents focused on specific domains:

```typescript
// Code Review Agent
const codeReviewerAgent = await createAgent({
  agent_name: 'code-reviewer-main',
  agent_type: 'code',
  expertise_domains: ['typescript', 'code-review', 'best-practices'],
  confidence_threshold: 0.8 // High confidence for code reviews
});

// Documentation Agent
const docsAgent = await createAgent({
  agent_name: 'docs-writer',
  agent_type: 'documentation',
  expertise_domains: ['technical-writing', 'api-docs'],
  confidence_threshold: 0.7
});

// Test Agent
const testAgent = await createAgent({
  agent_name: 'test-generator',
  agent_type: 'test',
  expertise_domains: ['unit-testing', 'integration-testing'],
  confidence_threshold: 0.75
});
```

### 2. Hierarchical Agents

Create agent hierarchies with different responsibilities:

```typescript
// Senior agent with high authority
const seniorAgent = await createAgent({
  agent_name: 'senior-developer',
  agent_type: 'code',
  expertise_domains: ['architecture', 'design-patterns'],
  confidence_threshold: 0.85
});

// Junior agents for specific tasks
const juniorAgent = await createAgent({
  agent_name: 'junior-developer-1',
  agent_type: 'code',
  expertise_domains: ['typescript'],
  confidence_threshold: 0.6
});

// Transfer learning from senior to junior
await transferLearning({
  source_agent_id: seniorAgent.id,
  target_agent_id: juniorAgent.id,
  min_confidence: 0.7
});
```

### 3. Validation Agents

Create agents specifically for validation:

```typescript
const validatorAgent = await createAgent({
  agent_name: 'contribution-validator',
  agent_type: 'specialized',
  expertise_domains: ['validation', 'quality-assurance'],
  confidence_threshold: 0.9 // Very high threshold
});

// Use validator to check other agents' contributions
async function validateContribution(contributionId: string) {
  const validation = await analyzeContribution(contributionId);

  await validateContribution(contributionId, {
    validation_status: validation.passed ? 'accepted' : 'rejected',
    validation_notes: validation.notes
  });
}
```

---

## Collaboration Workflows

### Workflow 1: Multi-Agent Development Team

Simulate a development team with specialized agents:

```typescript
// 1. Code agent creates implementation memory
const codeResult = await agentContribute({
  agent_id: codeAgent.id,
  text: 'Implemented JWT authentication using jsonwebtoken library',
  confidence: 0.9,
  tags: ['authentication', 'jwt', 'security']
});

// 2. Test agent creates test memory
const testResult = await agentContribute({
  agent_id: testAgent.id,
  text: 'Created unit tests for JWT authentication with 95% coverage',
  confidence: 0.85,
  tags: ['testing', 'authentication', 'jwt']
});

// 3. Docs agent creates documentation
const docsResult = await agentContribute({
  agent_id: docsAgent.id,
  text: 'Updated API documentation with JWT authentication endpoints and examples',
  confidence: 0.8,
  tags: ['documentation', 'api', 'authentication']
});

// 4. Synthesize all knowledge into comprehensive understanding
const synthesis = await synthesizeKnowledge({
  agent_id: seniorAgent.id,
  source_memory_ids: [
    codeResult.memory.id,
    testResult.memory.id,
    docsResult.memory.id
  ]
});
```

### Workflow 2: Research Collaboration

Multiple research agents contribute findings:

```typescript
// Agent 1: Literature review
const litReview = await agentContribute({
  agent_id: researchAgent1.id,
  text: 'Studies show transformer models excel at long-range dependencies',
  confidence: 0.85,
  tags: ['research', 'transformers', 'nlp']
});

// Agent 2: Experimental results
const expResults = await agentContribute({
  agent_id: researchAgent2.id,
  text: 'Our experiments confirm 15% improvement with attention mechanism',
  confidence: 0.9,
  tags: ['research', 'experiments', 'transformers']
});

// Agent 3: Practical applications
const applications = await agentContribute({
  agent_id: researchAgent3.id,
  text: 'Transformers successfully applied to code generation tasks',
  confidence: 0.8,
  tags: ['research', 'applications', 'code-generation']
});

// Synthesize research findings
const researchSynthesis = await synthesizeKnowledge({
  agent_id: seniorResearcher.id,
  source_memory_ids: [litReview.memory.id, expResults.memory.id, applications.memory.id]
});
```

### Workflow 3: Customer Support Knowledge Base

Support agents build collective knowledge:

```typescript
// Support agent encounters issue
const issue = await agentContribute({
  agent_id: supportAgent1.id,
  text: 'Customer reported CORS error when calling API from localhost',
  confidence: 0.7,
  tags: ['support', 'cors', 'api']
});

// Different agent finds solution
const solution = await agentContribute({
  agent_id: supportAgent2.id,
  text: 'CORS error resolved by adding localhost to CORS_ORIGIN env variable',
  confidence: 0.95,
  tags: ['support', 'cors', 'solution']
});

// Detect if this duplicates existing knowledge
const conflicts = await detectConflicts({
  memory_id: solution.memory.id,
  conflict_threshold: 0.7
});

if (conflicts.length > 0) {
  // Resolve by keeping highest quality solution
  await resolveConflict(conflicts[0].id, {
    resolution_strategy: 'trust_higher_rep'
  });
}
```

---

## Best Practices

### Agent Creation

1. **Clear Naming**: Use descriptive names
   ```typescript
   // Good
   agent_name: 'typescript-linter-agent'

   // Bad
   agent_name: 'agent1'
   ```

2. **Appropriate Thresholds**: Match confidence to use case
   ```typescript
   // Critical systems: high threshold
   confidence_threshold: 0.85

   // Experimental/research: lower threshold
   confidence_threshold: 0.6
   ```

3. **Domain Expertise**: Be specific
   ```typescript
   expertise_domains: ['react', 'typescript', 'testing']  // Good
   expertise_domains: ['programming']                      // Too broad
   ```

### Contribution Quality

1. **Confidence Calibration**: Only contribute when truly confident
   ```typescript
   if (analysisQuality > 0.8) {
     await agentContribute({
       agent_id: agent.id,
       text: finding,
       confidence: analysisQuality
     });
   }
   ```

2. **Rich Metadata**: Include context
   ```typescript
   await agentContribute({
     agent_id: agent.id,
     text: 'Finding...',
     metadata: {
       source: 'code-analysis',
       tool: 'eslint',
       version: '8.0.0',
       context: {
         file: 'src/utils.ts',
         line: 42
       }
     }
   });
   ```

3. **Meaningful Tags**: Enable discovery
   ```typescript
   tags: ['typescript', 'error-handling', 'best-practice', 'async']
   ```

### Synthesis Strategy

1. **Related Content**: Only synthesize related memories
2. **Sufficient Sources**: Use 3+ sources for robust synthesis
3. **Clear Attribution**: Maintain traceability

```typescript
// Good synthesis
const relatedMemories = await searchMemories({
  query: 'authentication security',
  limit: 5
});

if (relatedMemories.length >= 3) {
  const synthesis = await synthesizeKnowledge({
    agent_id: agent.id,
    source_memory_ids: relatedMemories.map(m => m.id),
    synthesis_method: 'security-best-practices'
  });
}
```

### Conflict Management

1. **Proactive Detection**: Check for conflicts before contributing
2. **Quick Resolution**: Resolve conflicts promptly
3. **Learning from Conflicts**: Adjust agent behavior

```typescript
// Detect potential conflicts before contributing
const existingMemories = await searchMemories({
  query: newMemory.text,
  limit: 10
});

const similarMemories = existingMemories.filter(m =>
  similarity(m.text, newMemory.text) > 0.8
);

if (similarMemories.length > 0) {
  // Decide: skip, update existing, or contribute with note
}
```

---

## Use Cases

### 1. Autonomous Development Team

```typescript
class AutonomousDevTeam {
  private agents: Map<string, Agent> = new Map();

  async initialize() {
    // Create specialized agents
    this.agents.set('architect', await createAgent({
      agent_name: 'system-architect',
      agent_type: 'specialized',
      expertise_domains: ['architecture', 'system-design']
    }));

    this.agents.set('developer', await createAgent({
      agent_name: 'typescript-developer',
      agent_type: 'code',
      expertise_domains: ['typescript', 'node.js']
    }));

    this.agents.set('tester', await createAgent({
      agent_name: 'qa-engineer',
      agent_type: 'test',
      expertise_domains: ['testing', 'quality-assurance']
    }));
  }

  async implementFeature(feature: string) {
    // 1. Architect designs
    const design = await this.agents.get('architect')!.contribute({
      text: `System design for ${feature}`,
      contribution_type: 'create'
    });

    // 2. Developer implements
    const implementation = await this.agents.get('developer')!.contribute({
      text: `Implementation of ${feature}`,
      contribution_type: 'create'
    });

    // 3. Tester creates tests
    const tests = await this.agents.get('tester')!.contribute({
      text: `Test suite for ${feature}`,
      contribution_type: 'create'
    });

    // 4. Synthesize complete feature knowledge
    return await synthesizeKnowledge({
      agent_id: this.agents.get('architect')!.id,
      source_memory_ids: [design.id, implementation.id, tests.id]
    });
  }
}
```

### 2. Distributed Research Network

```typescript
class ResearchNetwork {
  async conductResearch(topic: string) {
    // Multiple agents research different aspects
    const aspects = ['theory', 'experiments', 'applications'];
    const findings = [];

    for (const aspect of aspects) {
      const agent = await this.getSpecializedAgent(aspect);
      const finding = await agent.research(topic, aspect);
      findings.push(finding);
    }

    // Synthesize all findings
    const comprehensiveReport = await synthesizeKnowledge({
      agent_id: this.leadResearcher.id,
      source_memory_ids: findings.map(f => f.id)
    });

    // Check for conflicts in findings
    const conflicts = await this.detectConflictingFindings(findings);
    if (conflicts.length > 0) {
      await this.resolveResearchConflicts(conflicts);
    }

    return comprehensiveReport;
  }
}
```

### 3. Knowledge Base Evolution

```typescript
class EvolvingKnowledgeBase {
  async maintainKnowledge() {
    // Periodic cleanup and optimization
    setInterval(async () => {
      // 1. Detect outdated knowledge
      const conflicts = await detectConflicts({
        conflict_threshold: 0.7
      });

      // 2. Resolve with latest information
      for (const conflict of conflicts) {
        if (conflict.conflict_type === 'outdated') {
          await resolveConflict(conflict.id, {
            resolution_strategy: 'trust_higher_rep'
          });
        }
      }

      // 3. Synthesize fragmented knowledge
      const fragmentedTopics = await this.findFragmentedTopics();
      for (const topic of fragmentedTopics) {
        await this.synthesizeTopicKnowledge(topic);
      }

      // 4. Transfer learning to new agents
      await this.bootstrapNewAgents();
    }, 24 * 60 * 60 * 1000); // Daily
  }
}
```

---

## Advanced Patterns

### Pattern 1: Agent Consensus

```typescript
async function getAgentConsensus(
  question: string,
  agents: Agent[]
): Promise<ConsensusResult> {
  const responses = [];

  // Collect responses from all agents
  for (const agent of agents) {
    const response = await agent.answer(question);
    responses.push(response);
  }

  // Check for agreement
  const agreement = calculateAgreement(responses);

  if (agreement > 0.8) {
    // High consensus: synthesize
    return await synthesizeKnowledge({
      agent_id: agents[0].id,
      source_memory_ids: responses.map(r => r.id)
    });
  } else {
    // Low consensus: flag for review
    return {
      consensus: false,
      conflicting_views: responses
    };
  }
}
```

### Pattern 2: Trust Networks

```typescript
async function buildTrustNetwork(agents: Agent[]) {
  // Analyze collaboration history
  for (const agent1 of agents) {
    for (const agent2 of agents) {
      if (agent1.id === agent2.id) continue;

      const collaborations = await getCollaborationHistory(
        agent1.id,
        agent2.id
      );

      const trustScore = calculateTrust(collaborations);

      await createTrustRelationship({
        agent_id: agent1.id,
        trusted_agent_id: agent2.id,
        trust_score: trustScore
      });
    }
  }
}
```

### Pattern 3: Progressive Learning

```typescript
async function progressiveLearning(
  noviceAgent: Agent,
  expertAgent: Agent
) {
  // Phase 1: Direct learning transfer
  await transferLearning({
    source_agent_id: expertAgent.id,
    target_agent_id: noviceAgent.id,
    min_confidence: 0.8
  });

  // Phase 2: Supervised contributions
  noviceAgent.supervisor = expertAgent.id;
  noviceAgent.requireValidation = true;

  // Phase 3: Monitor and adjust
  const performance = await monitorNovicePerformance(noviceAgent);

  if (performance.acceptance_rate > 0.9) {
    // Graduate to autonomous operation
    noviceAgent.requireValidation = false;
  }
}
```

---

## Monitoring and Optimization

### Dashboard Monitoring

```typescript
async function monitorCollaboration() {
  const dashboard = await getCollaborationDashboard();

  // Check health metrics
  if (dashboard.conflict_resolution_rate < 0.8) {
    console.warn('Low conflict resolution rate');
    await initiateConflictResolution();
  }

  if (dashboard.active_agents_24h < dashboard.total_agents * 0.5) {
    console.warn('Low agent activity');
    await reviewInactiveAgents();
  }

  // Monitor top contributors
  const topAgents = dashboard.top_contributors.slice(0, 3);
  console.log('Top contributors:', topAgents);
}
```

### Performance Optimization

```typescript
async function optimizeAgentPerformance(agentId: string) {
  const performance = await getAgentPerformance(agentId);

  // Adjust based on performance
  if (performance.acceptance_rate < 0.7) {
    // Lower confidence threshold or retrain
    await updateAgent(agentId, {
      confidence_threshold: performance.confidence_threshold + 0.1
    });
  }

  // Share knowledge from high performers
  if (performance.reputation_score > 0.9) {
    const otherAgents = await getSimilarAgents(agentId);
    for (const agent of otherAgents) {
      await transferLearning({
        source_agent_id: agentId,
        target_agent_id: agent.id
      });
    }
  }
}
```

---

## Next Steps

1. Review [PHASE3_API.md](./PHASE3_API.md) for complete API reference
2. Read [CONFLICT_RESOLUTION.md](./CONFLICT_RESOLUTION.md) for conflict strategies
3. Check [PHASE3_DEPLOYMENT.md](./PHASE3_DEPLOYMENT.md) for deployment guide
4. Experiment with sample workflows
5. Build your multi-agent system!

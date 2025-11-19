# Conflict Resolution Strategies

Comprehensive guide to detecting, managing, and resolving conflicts in multi-agent memory systems.

## Table of Contents

- [Understanding Conflicts](#understanding-conflicts)
- [Detection Methods](#detection-methods)
- [Resolution Strategies](#resolution-strategies)
- [Automated Resolution](#automated-resolution)
- [Manual Resolution](#manual-resolution)
- [Best Practices](#best-practices)

---

## Understanding Conflicts

### What Are Memory Conflicts?

Conflicts occur when multiple agents contribute memories that:
- **Contradict** each other (conflicting information)
- Are **duplicates** (same or very similar content)
- Represent **outdated** information (newer data available)
- Show **inconsistencies** (subtle differences that matter)

### Conflict Severity

Conflicts are rated on severity (0.0-1.0):
- **0.0-0.3**: Minor (cosmetic differences, formatting)
- **0.4-0.6**: Moderate (notable differences, requires review)
- **0.7-0.9**: Serious (significant conflicts, immediate attention)
- **0.9-1.0**: Critical (direct contradictions, system integrity at risk)

### Why Conflicts Matter

Unresolved conflicts lead to:
- Inconsistent system knowledge
- Reduced trust in agent contributions
- Poor search result quality
- Degraded user experience

---

## Detection Methods

### Automatic Detection

Conflicts are automatically detected using:

1. **Text Similarity**
   - Detects duplicates and near-duplicates
   - Uses Jaccard similarity or embedding distance
   - Threshold: 0.85+ similarity = potential duplicate

2. **Temporal Analysis**
   - Identifies outdated information
   - Compares creation dates and helpfulness scores
   - Newer + more helpful = potential replacement

3. **Semantic Contradiction**
   - Detects negations and opposites
   - Looks for "NOT", "INCORRECT", contradictory statements
   - Requires semantic understanding

4. **Cross-Reference Validation**
   - Checks consistency across related memories
   - Validates relationships and dependencies

### Manual Detection

Trigger manual conflict detection:

```typescript
// Detect conflicts for a specific memory
const conflicts = await detectConflicts({
  memory_id: memoryId,
  conflict_threshold: 0.7
});

// Scan entire knowledge base
const allConflicts = await scanForConflicts({
  user_id: userId,
  conflict_types: ['contradiction', 'duplicate', 'outdated'],
  min_severity: 0.5
});
```

### Detection Configuration

```typescript
interface ConflictDetectionConfig {
  // Similarity threshold for duplicates
  duplicate_threshold: 0.85,

  // Time window for outdated detection (days)
  outdated_window: 90,

  // Minimum severity to report
  min_severity: 0.5,

  // Enable semantic contradiction detection
  semantic_detection: true,

  // Auto-detect on memory creation
  auto_detect: false  // Expensive, use with caution
}
```

---

## Resolution Strategies

### 1. Trust Higher Reputation (`trust_higher_rep`)

**When to use:**
- Agents have different reputation scores
- Quality difference is clear
- Automated resolution is preferred

**How it works:**
1. Compare agent reputations
2. Downgrade memory from lower-reputation agent
3. Keep higher-reputation agent's memory as primary

**Example:**
```typescript
await resolveConflict(conflictId, {
  resolution_strategy: 'trust_higher_rep',
  resolved_by: systemAgentId
});
```

**Outcome:**
- Lower-reputation memory: `helpfulness_score *= 0.7`
- Higher-reputation memory: Unchanged
- Conflict: Marked as resolved

**Best for:**
- Production systems with established agent hierarchy
- Clear quality differences
- Automated workflows

---

### 2. Merge (`merge`)

**When to use:**
- Both memories contain valuable information
- Information is complementary, not contradictory
- Want to preserve all knowledge

**How it works:**
1. Extract information from both memories
2. Create synthesis combining both
3. Link synthesis to original memories
4. Optionally deprecate originals

**Example:**
```typescript
// Resolve conflict by merging
await resolveConflict(conflictId, {
  resolution_strategy: 'merge',
  resolved_by: agentId
});

// This triggers synthesis automatically
// Or manually synthesize:
const synthesis = await synthesizeKnowledge({
  agent_id: agentId,
  source_memory_ids: [memoryAId, memoryBId],
  synthesis_method: 'conflict_resolution'
});
```

**Outcome:**
- New synthesized memory created
- Original memories linked as sources
- Both original memories preserved
- Conflict: Marked as resolved

**Best for:**
- Complementary information
- Research contexts
- Knowledge aggregation

---

### 3. Keep Both (`keep_both`)

**When to use:**
- Memories represent different valid perspectives
- Context matters (both may be correct in different scenarios)
- Uncertainty about which is correct

**How it works:**
1. Mark conflict as resolved
2. Keep both memories active
3. Add metadata noting the alternate view
4. Let search ranking decide which to surface

**Example:**
```typescript
await resolveConflict(conflictId, {
  resolution_strategy: 'keep_both',
  resolved_by: agentId
});

// Optionally add context
await updateMemory(memoryAId, {
  metadata: {
    ...existing,
    alternate_view: memoryBId,
    context: 'Different perspective on same topic'
  }
});
```

**Outcome:**
- Both memories remain active
- Cross-referenced in metadata
- Search uses context and reputation to rank
- Conflict: Marked as resolved

**Best for:**
- Subjective information
- Context-dependent facts
- Evolving knowledge

---

### 4. Manual Resolution (`manual`)

**When to use:**
- Complex conflicts requiring human judgment
- High-stakes decisions
- Unclear resolution path

**How it works:**
1. Present conflict to human reviewer
2. Human decides action (delete, merge, edit, keep)
3. Record decision and reasoning
4. Apply resolution

**Example:**
```typescript
// Mark for manual review
await resolveConflict(conflictId, {
  resolution_strategy: 'manual',
  resolved_by: userId,
  resolution_notes: 'Requires domain expert review'
});

// After human review, update:
await finalizeManualResolution(conflictId, {
  action: 'delete_memory_a',
  reasoning: 'Memory A contained outdated information'
});
```

**Outcome:**
- Depends on human decision
- Full audit trail maintained
- Conflict: Marked as resolved with notes

**Best for:**
- Critical information
- Complex scenarios
- Learning systems (to train automated resolution)

---

## Automated Resolution

### Resolution Decision Tree

```typescript
async function autoResolveConflict(conflict: Conflict): Promise<void> {
  // Step 1: Check conflict type
  switch (conflict.conflict_type) {
    case 'duplicate':
      // For duplicates, trust higher reputation
      if (Math.abs(reputationA - reputationB) > 0.2) {
        await resolveConflict(conflict.id, {
          resolution_strategy: 'trust_higher_rep',
          resolved_by: SYSTEM_AGENT_ID
        });
      } else {
        // Very similar reputations, keep both
        await resolveConflict(conflict.id, {
          resolution_strategy: 'keep_both',
          resolved_by: SYSTEM_AGENT_ID
        });
      }
      break;

    case 'outdated':
      // For outdated info, prefer newer + more helpful
      const ageA = daysSince(memoryA.created_at);
      const ageB = daysSince(memoryB.created_at);

      if (ageB < ageA && memoryB.helpfulness_score > 0.7) {
        await resolveConflict(conflict.id, {
          resolution_strategy: 'trust_higher_rep', // Will favor B
          resolved_by: SYSTEM_AGENT_ID
        });
      }
      break;

    case 'contradiction':
      // For contradictions, require manual review if severe
      if (conflict.severity > 0.8) {
        await resolveConflict(conflict.id, {
          resolution_strategy: 'manual',
          resolved_by: SYSTEM_AGENT_ID,
          resolution_notes: 'High-severity contradiction requires review'
        });
      } else {
        // Trust higher reputation for minor contradictions
        await resolveConflict(conflict.id, {
          resolution_strategy: 'trust_higher_rep',
          resolved_by: SYSTEM_AGENT_ID
        });
      }
      break;

    case 'inconsistent':
      // For inconsistencies, try to merge
      await resolveConflict(conflict.id, {
        resolution_strategy: 'merge',
        resolved_by: SYSTEM_AGENT_ID
      });
      break;
  }
}
```

### Batch Resolution

```typescript
async function resolvePendingConflicts() {
  const conflicts = await listUnresolvedConflicts();

  for (const conflict of conflicts) {
    // Skip high-severity conflicts (require manual review)
    if (conflict.severity > 0.8) continue;

    // Auto-resolve low to moderate severity
    await autoResolveConflict(conflict);

    // Rate limit to avoid overload
    await sleep(100);
  }

  // Report high-severity conflicts
  const criticalConflicts = conflicts.filter(c => c.severity > 0.8);
  if (criticalConflicts.length > 0) {
    await notifyAdmins({
      subject: 'Critical conflicts require review',
      conflicts: criticalConflicts
    });
  }
}
```

---

## Manual Resolution

### Review Interface

Build a UI for manual conflict resolution:

```typescript
interface ConflictReviewUI {
  conflict: Conflict;
  memoryA: Memory;
  memoryB: Memory;
  agentA: AgentProfile;
  agentB: AgentProfile;
  similarMemories: Memory[];
  recommendations: ResolutionRecommendation[];
}

async function getConflictReviewData(
  conflictId: string
): Promise<ConflictReviewUI> {
  const conflict = await getConflict(conflictId);
  const memoryA = await getMemory(conflict.memory_a_id);
  const memoryB = await getMemory(conflict.memory_b_id);

  // Get agent information
  const contributionsA = await getContributions(conflict.memory_a_id);
  const contributionsB = await getContributions(conflict.memory_b_id);

  const agentA = await getAgent(contributionsA[0].agent_id);
  const agentB = await getAgent(contributionsB[0].agent_id);

  // Find similar memories for context
  const similarMemories = await searchMemories({
    query: memoryA.text,
    limit: 5,
    exclude: [memoryA.id, memoryB.id]
  });

  // Generate recommendations
  const recommendations = await generateResolutionRecommendations(
    conflict,
    memoryA,
    memoryB,
    agentA,
    agentB
  );

  return {
    conflict,
    memoryA,
    memoryB,
    agentA,
    agentB,
    similarMemories,
    recommendations
  };
}
```

### Resolution Actions

```typescript
// Delete one memory
async function deleteConflictingMemory(
  conflictId: string,
  memoryIdToDelete: string,
  reason: string
) {
  await deleteMemory(memoryIdToDelete);
  await resolveConflict(conflictId, {
    resolution_strategy: 'manual',
    resolution_notes: `Deleted ${memoryIdToDelete}: ${reason}`
  });
}

// Edit and merge
async function editAndMerge(
  conflictId: string,
  editedText: string,
  agentId: string
) {
  const conflict = await getConflict(conflictId);

  // Create new synthesized memory
  const synthesis = await synthesizeKnowledge({
    agent_id: agentId,
    source_memory_ids: [conflict.memory_a_id, conflict.memory_b_id],
    synthesized_text: editedText
  });

  // Mark conflict as resolved
  await resolveConflict(conflictId, {
    resolution_strategy: 'manual',
    resolution_notes: 'Manually edited and merged',
    resolution_outcome: {
      action: 'edit_and_merge',
      new_memory_id: synthesis.id
    }
  });
}

// Keep one, archive other
async function keepOneArchiveOther(
  conflictId: string,
  keepMemoryId: string,
  archiveMemoryId: string,
  reason: string
) {
  // Archive the less relevant memory
  await updateMemory(archiveMemoryId, {
    metadata: {
      archived: true,
      archived_reason: reason,
      replaced_by: keepMemoryId
    },
    helpfulness_score: 0.1 // Lower ranking
  });

  await resolveConflict(conflictId, {
    resolution_strategy: 'manual',
    resolution_notes: `Kept ${keepMemoryId}, archived ${archiveMemoryId}: ${reason}`
  });
}
```

---

## Best Practices

### 1. Prevention Over Cure

**Prevent conflicts before they occur:**

```typescript
// Before contributing, check for existing similar memories
async function preventDuplicates(
  agentId: string,
  newMemoryText: string
) {
  const existing = await searchMemories({
    query: newMemoryText,
    limit: 5
  });

  const similarity = calculateSimilarity(
    newMemoryText,
    existing[0]?.text
  );

  if (similarity > 0.85) {
    // Don't create duplicate, update existing instead
    await updateMemory(existing[0].id, {
      metadata: {
        ...existing[0].metadata,
        verified_by: agentId,
        last_verification: new Date()
      }
    });
    return { action: 'updated_existing', memoryId: existing[0].id };
  }

  // Safe to create new memory
  return { action: 'create_new' };
}
```

### 2. Regular Conflict Audits

**Schedule periodic conflict reviews:**

```typescript
// Run daily
cron.schedule('0 2 * * *', async () => {
  // Auto-resolve simple conflicts
  await resolvePendingConflicts();

  // Report unresolved conflicts
  const unresolved = await listUnresolvedConflicts();

  if (unresolved.length > 10) {
    await sendAlert({
      type: 'conflict_backlog',
      count: unresolved.length,
      critical: unresolved.filter(c => c.severity > 0.8).length
    });
  }
});
```

### 3. Learn from Resolutions

**Improve agents based on conflict patterns:**

```typescript
async function analyzeConflictPatterns(agentId: string) {
  const conflicts = await getAgentConflicts(agentId);

  const patterns = {
    duplicate_rate: conflicts.filter(c => c.type === 'duplicate').length / conflicts.length,
    contradiction_rate: conflicts.filter(c => c.type === 'contradiction').length / conflicts.length,
    avg_severity: average(conflicts.map(c => c.severity))
  };

  // Adjust agent behavior
  if (patterns.duplicate_rate > 0.3) {
    // Agent creates too many duplicates
    await updateAgent(agentId, {
      agent_metadata: {
        ...existing,
        check_duplicates: true,
        duplicate_threshold: 0.9
      }
    });
  }

  if (patterns.contradiction_rate > 0.2) {
    // Agent contradicts others frequently
    await updateAgent(agentId, {
      confidence_threshold: agent.confidence_threshold + 0.1,
      require_validation: true
    });
  }
}
```

### 4. Weighted Resolution

**Use agent reputation in resolution decisions:**

```typescript
async function weightedResolution(conflict: Conflict) {
  const reputationA = await getAgentReputation(conflict.agent_a_id);
  const reputationB = await getAgentReputation(conflict.agent_b_id);

  const reputationDiff = Math.abs(reputationA - reputationB);

  if (reputationDiff > 0.3) {
    // Clear reputation difference - trust higher
    return 'trust_higher_rep';
  } else if (reputationDiff < 0.1) {
    // Similar reputations - merge or keep both
    return conflict.conflict_type === 'duplicate' ? 'trust_higher_rep' : 'merge';
  } else {
    // Moderate difference - consider other factors
    const helpfulnessA = await getMemoryHelpfulness(conflict.memory_a_id);
    const helpfulnessB = await getMemoryHelpfulness(conflict.memory_b_id);

    return helpfulnessB > helpfulnessA ? 'trust_higher_rep' : 'keep_both';
  }
}
```

### 5. Escalation Rules

**Define when to escalate to manual review:**

```typescript
function shouldEscalate(conflict: Conflict): boolean {
  return (
    // High severity
    conflict.severity > 0.8 ||
    // Multiple attempts failed
    conflict.resolution_attempts > 2 ||
    // Critical domain
    conflict.tags?.includes('critical') ||
    // High-reputation agents disagree
    (conflict.agent_a_reputation > 0.9 && conflict.agent_b_reputation > 0.9)
  );
}

async function handleConflictWithEscalation(conflict: Conflict) {
  if (shouldEscalate(conflict)) {
    await escalateToManual(conflict);
  } else {
    await autoResolveConflict(conflict);
  }
}
```

---

## Metrics and Monitoring

### Key Metrics

```typescript
interface ConflictMetrics {
  // Volume
  total_conflicts: number;
  unresolved_conflicts: number;
  conflicts_per_day: number;

  // Resolution
  resolution_rate: number;
  avg_resolution_time_hours: number;
  auto_resolution_rate: number;

  // Quality
  avg_conflict_severity: number;
  critical_conflicts: number;
  resolution_accuracy: number; // Based on user feedback

  // By Type
  conflict_by_type: {
    duplicate: number;
    contradiction: number;
    outdated: number;
    inconsistent: number;
  };
}

async function getConflictMetrics(
  userId: string,
  timeRange: TimeRange
): Promise<ConflictMetrics> {
  // Implementation
}
```

### Dashboard

```typescript
async function displayConflictDashboard() {
  const metrics = await getConflictMetrics(userId, 'last_30_days');

  console.log('Conflict Resolution Dashboard');
  console.log('=============================');
  console.log(`Total Conflicts: ${metrics.total_conflicts}`);
  console.log(`Unresolved: ${metrics.unresolved_conflicts}`);
  console.log(`Resolution Rate: ${(metrics.resolution_rate * 100).toFixed(1)}%`);
  console.log(`Auto-Resolution: ${(metrics.auto_resolution_rate * 100).toFixed(1)}%`);
  console.log(`Avg Severity: ${metrics.avg_conflict_severity.toFixed(2)}`);
  console.log(`Critical Conflicts: ${metrics.critical_conflicts}`);
}
```

---

## Advanced Techniques

### Conflict Prediction

```typescript
async function predictConflicts(memoryText: string): Promise<number> {
  // Use ML model to predict conflict probability
  const similar = await searchMemories({ query: memoryText, limit: 10 });

  const features = {
    max_similarity: Math.max(...similar.map(m => similarity(memoryText, m.text))),
    topic_saturation: similar.length / 10,
    text_length_variance: calculateVariance(similar.map(m => m.text.length)),
    avg_agent_agreement: calculateAgreement(similar)
  };

  return predictConflictProbability(features);
}
```

### Consensus Building

```typescript
async function buildConsensus(topic: string) {
  // Get all memories on topic
  const memories = await searchMemories({ query: topic, limit: 50 });

  // Group by similarity
  const clusters = clusterSimilarMemories(memories);

  // Synthesize each cluster
  const syntheses = [];
  for (const cluster of clusters) {
    if (cluster.length >= 2) {
      const synthesis = await synthesizeKnowledge({
        agent_id: CONSENSUS_AGENT_ID,
        source_memory_ids: cluster.map(m => m.id)
      });
      syntheses.push(synthesis);
    }
  }

  return syntheses;
}
```

---

## Summary

**Quick Reference:**

| Conflict Type | Recommended Strategy | Auto-Resolve? |
|--------------|---------------------|---------------|
| Duplicate (low severity) | trust_higher_rep | Yes |
| Duplicate (similar reps) | keep_both | Yes |
| Outdated | trust_higher_rep | Yes |
| Contradiction (low severity) | trust_higher_rep | Yes |
| Contradiction (high severity) | manual | No |
| Inconsistent | merge | Sometimes |

**Resolution Priority:**
1. Critical conflicts (manual review)
2. Duplicates (auto-resolve)
3. Outdated information (auto-resolve)
4. Contradictions (auto-resolve if low severity)
5. Inconsistencies (merge or manual)

---

For more information:
- [PHASE3_API.md](./PHASE3_API.md) - API reference
- [COLLABORATION_GUIDE.md](./COLLABORATION_GUIDE.md) - Collaboration patterns
- [PHASE3_DEPLOYMENT.md](./PHASE3_DEPLOYMENT.md) - Deployment guide

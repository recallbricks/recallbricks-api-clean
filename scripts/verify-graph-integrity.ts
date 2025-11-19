/**
 * Graph Integrity Verification Script
 * Run this after load tests to verify graph consistency
 *
 * Usage: npx ts-node scripts/verify-graph-integrity.ts
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

interface IntegrityError {
  type: 'orphaned_relationship' | 'broken_reference' | 'reputation_drift' | 'pattern_inconsistency' | 'metacognition_invalid';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affected_ids: string[];
  details?: any;
}

interface IntegrityReport {
  timestamp: string;
  checks_performed: number;
  checks_passed: number;
  checks_failed: number;
  errors: IntegrityError[];
  summary: {
    total_memories: number;
    total_agents: number;
    total_relationships: number;
    orphaned_relationships: number;
    reputation_issues: number;
    metacognition_issues: number;
  };
}

class GraphIntegrityVerifier {
  private supabase: any;
  private errors: IntegrityError[] = [];
  private checksPerformed = 0;
  private checksPassed = 0;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  /**
   * Run all integrity checks
   */
  async verify(): Promise<IntegrityReport> {
    console.log('🔍 Starting graph integrity verification...\n');

    // Run all checks
    await this.checkOrphanedRelationships();
    await this.checkAgentReputationConsistency();
    await this.checkMemoryMetacognition();
    await this.checkPatternConsistency();
    await this.checkReferentialIntegrity();

    // Get summary stats
    const summary = await this.getSummaryStats();

    const report: IntegrityReport = {
      timestamp: new Date().toISOString(),
      checks_performed: this.checksPerformed,
      checks_passed: this.checksPassed,
      checks_failed: this.errors.length,
      errors: this.errors,
      summary,
    };

    this.printReport(report);
    return report;
  }

  /**
   * Check for orphaned relationships
   */
  private async checkOrphanedRelationships(): Promise<void> {
    console.log('📊 Checking for orphaned relationships...');
    this.checksPerformed++;

    try {
      const { data: orphaned, error } = await this.supabase.rpc('find_orphaned_relationships');

      if (error) {
        console.error('  ❌ Failed to check orphaned relationships:', error);
        return;
      }

      if (orphaned && orphaned.length > 0) {
        this.errors.push({
          type: 'orphaned_relationship',
          severity: 'medium',
          description: `Found ${orphaned.length} relationships pointing to deleted memories`,
          affected_ids: orphaned.map((r: any) => r.relationship_id),
          details: orphaned,
        });
        console.log(`  ⚠️  Found ${orphaned.length} orphaned relationships`);
      } else {
        this.checksPassed++;
        console.log('  ✅ No orphaned relationships found');
      }
    } catch (err: any) {
      console.error('  ❌ Error checking orphaned relationships:', err.message);
    }
  }

  /**
   * Check agent reputation consistency
   */
  private async checkAgentReputationConsistency(): Promise<void> {
    console.log('📊 Checking agent reputation consistency...');
    this.checksPerformed++;

    try {
      const { data: agents, error } = await this.supabase
        .from('agent_profiles')
        .select('id, agent_name, reputation_score, total_contributions, successful_contributions');

      if (error) {
        console.error('  ❌ Failed to check agent reputation:', error);
        return;
      }

      let issuesFound = 0;
      const issues: any[] = [];

      for (const agent of agents || []) {
        // Check reputation is in valid range [0, 1]
        if (agent.reputation_score < 0 || agent.reputation_score > 1) {
          issuesFound++;
          issues.push({
            agent_id: agent.id,
            agent_name: agent.agent_name,
            issue: 'reputation_out_of_range',
            value: agent.reputation_score,
          });
        }

        // Check contribution counts are non-negative
        if (agent.total_contributions < 0 || agent.successful_contributions < 0) {
          issuesFound++;
          issues.push({
            agent_id: agent.id,
            agent_name: agent.agent_name,
            issue: 'negative_contributions',
            total: agent.total_contributions,
            successful: agent.successful_contributions,
          });
        }

        // Check successful <= total
        if (agent.successful_contributions > agent.total_contributions) {
          issuesFound++;
          issues.push({
            agent_id: agent.id,
            agent_name: agent.agent_name,
            issue: 'successful_exceeds_total',
            total: agent.total_contributions,
            successful: agent.successful_contributions,
          });
        }
      }

      if (issuesFound > 0) {
        this.errors.push({
          type: 'reputation_drift',
          severity: 'low',
          description: `Found ${issuesFound} agents with reputation inconsistencies`,
          affected_ids: issues.map((i) => i.agent_id),
          details: issues,
        });
        console.log(`  ⚠️  Found ${issuesFound} reputation inconsistencies`);
      } else {
        this.checksPassed++;
        console.log(`  ✅ All ${agents?.length || 0} agents have consistent reputation scores`);
      }
    } catch (err: any) {
      console.error('  ❌ Error checking reputation consistency:', err.message);
    }
  }

  /**
   * Check memory metacognition consistency
   */
  private async checkMemoryMetacognition(): Promise<void> {
    console.log('📊 Checking memory metacognition consistency...');
    this.checksPerformed++;

    try {
      const { data: memories, error } = await this.supabase
        .from('memories')
        .select('id, usage_count, helpfulness_score, last_accessed, access_pattern')
        .limit(10000); // Check sample

      if (error) {
        console.error('  ❌ Failed to check memory metacognition:', error);
        return;
      }

      let issuesFound = 0;
      const issues: any[] = [];

      for (const memory of memories || []) {
        // Check usage_count is non-negative
        if (memory.usage_count < 0) {
          issuesFound++;
          issues.push({
            memory_id: memory.id,
            issue: 'negative_usage_count',
            value: memory.usage_count,
          });
        }

        // Check helpfulness_score is in valid range [0, 1]
        if (memory.helpfulness_score < 0 || memory.helpfulness_score > 1) {
          issuesFound++;
          issues.push({
            memory_id: memory.id,
            issue: 'helpfulness_out_of_range',
            value: memory.helpfulness_score,
          });
        }

        // Check access_pattern is valid JSON
        if (memory.access_pattern) {
          try {
            if (typeof memory.access_pattern === 'string') {
              JSON.parse(memory.access_pattern);
            }
          } catch {
            issuesFound++;
            issues.push({
              memory_id: memory.id,
              issue: 'invalid_access_pattern_json',
            });
          }
        }
      }

      if (issuesFound > 0) {
        this.errors.push({
          type: 'metacognition_invalid',
          severity: 'high',
          description: `Found ${issuesFound} memories with invalid metacognition values`,
          affected_ids: issues.map((i) => i.memory_id),
          details: issues,
        });
        console.log(`  ⚠️  Found ${issuesFound} metacognition inconsistencies`);
      } else {
        this.checksPassed++;
        console.log(`  ✅ All ${memories?.length || 0} sampled memories have valid metacognition`);
      }
    } catch (err: any) {
      console.error('  ❌ Error checking metacognition:', err.message);
    }
  }

  /**
   * Check pattern consistency
   */
  private async checkPatternConsistency(): Promise<void> {
    console.log('📊 Checking pattern consistency...');
    this.checksPerformed++;

    try {
      const { data: patterns, error } = await this.supabase
        .from('temporal_patterns')
        .select('id, pattern_type, occurrence_count, confidence, first_seen, last_seen');

      if (error) {
        console.error('  ❌ Failed to check patterns:', error);
        return;
      }

      let issuesFound = 0;
      const issues: any[] = [];

      for (const pattern of patterns || []) {
        // Check occurrence_count is positive
        if (pattern.occurrence_count <= 0) {
          issuesFound++;
          issues.push({
            pattern_id: pattern.id,
            issue: 'non_positive_occurrence_count',
            value: pattern.occurrence_count,
          });
        }

        // Check confidence is in valid range [0, 1]
        if (pattern.confidence < 0 || pattern.confidence > 1) {
          issuesFound++;
          issues.push({
            pattern_id: pattern.id,
            issue: 'confidence_out_of_range',
            value: pattern.confidence,
          });
        }

        // Check last_seen >= first_seen
        if (new Date(pattern.last_seen) < new Date(pattern.first_seen)) {
          issuesFound++;
          issues.push({
            pattern_id: pattern.id,
            issue: 'last_seen_before_first_seen',
            first_seen: pattern.first_seen,
            last_seen: pattern.last_seen,
          });
        }
      }

      if (issuesFound > 0) {
        this.errors.push({
          type: 'pattern_inconsistency',
          severity: 'medium',
          description: `Found ${issuesFound} patterns with inconsistent data`,
          affected_ids: issues.map((i) => i.pattern_id),
          details: issues,
        });
        console.log(`  ⚠️  Found ${issuesFound} pattern inconsistencies`);
      } else {
        this.checksPassed++;
        console.log(`  ✅ All ${patterns?.length || 0} patterns are consistent`);
      }
    } catch (err: any) {
      console.error('  ❌ Error checking patterns:', err.message);
    }
  }

  /**
   * Check referential integrity
   */
  private async checkReferentialIntegrity(): Promise<void> {
    console.log('📊 Checking referential integrity...');
    this.checksPerformed++;

    try {
      // Check agent_contributions reference valid agents and memories
      const { data: contributions, error: contribError } = await this.supabase
        .from('agent_contributions')
        .select('id, agent_id, memory_id')
        .limit(1000);

      if (contribError) {
        console.error('  ❌ Failed to check contributions:', contribError);
        return;
      }

      let brokenRefs = 0;
      const brokenRefDetails: any[] = [];

      for (const contrib of contributions || []) {
        // Check agent exists
        const { data: agent } = await this.supabase
          .from('agent_profiles')
          .select('id')
          .eq('id', contrib.agent_id)
          .single();

        if (!agent) {
          brokenRefs++;
          brokenRefDetails.push({
            contribution_id: contrib.id,
            issue: 'agent_not_found',
            agent_id: contrib.agent_id,
          });
        }

        // Check memory exists
        const { data: memory } = await this.supabase
          .from('memories')
          .select('id')
          .eq('id', contrib.memory_id)
          .single();

        if (!memory) {
          brokenRefs++;
          brokenRefDetails.push({
            contribution_id: contrib.id,
            issue: 'memory_not_found',
            memory_id: contrib.memory_id,
          });
        }
      }

      if (brokenRefs > 0) {
        this.errors.push({
          type: 'broken_reference',
          severity: 'high',
          description: `Found ${brokenRefs} broken references in contributions`,
          affected_ids: brokenRefDetails.map((d) => d.contribution_id),
          details: brokenRefDetails,
        });
        console.log(`  ⚠️  Found ${brokenRefs} broken references`);
      } else {
        this.checksPassed++;
        console.log(`  ✅ All ${contributions?.length || 0} sampled contributions have valid references`);
      }
    } catch (err: any) {
      console.error('  ❌ Error checking referential integrity:', err.message);
    }
  }

  /**
   * Get summary statistics
   */
  private async getSummaryStats(): Promise<any> {
    const [
      { count: totalMemories },
      { count: totalAgents },
      { count: totalRelationships },
      { data: orphaned },
    ] = await Promise.all([
      this.supabase.from('memories').select('*', { count: 'exact', head: true }),
      this.supabase.from('agent_profiles').select('*', { count: 'exact', head: true }),
      this.supabase.from('memory_relationships').select('*', { count: 'exact', head: true }),
      this.supabase.rpc('find_orphaned_relationships'),
    ]);

    const reputationIssues = this.errors.filter(e => e.type === 'reputation_drift').reduce(
      (sum, e) => sum + e.affected_ids.length, 0
    );

    const metacognitionIssues = this.errors.filter(e => e.type === 'metacognition_invalid').reduce(
      (sum, e) => sum + e.affected_ids.length, 0
    );

    return {
      total_memories: totalMemories || 0,
      total_agents: totalAgents || 0,
      total_relationships: totalRelationships || 0,
      orphaned_relationships: orphaned?.length || 0,
      reputation_issues: reputationIssues,
      metacognition_issues: metacognitionIssues,
    };
  }

  /**
   * Print the integrity report
   */
  private printReport(report: IntegrityReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('📋 GRAPH INTEGRITY REPORT');
    console.log('='.repeat(60));
    console.log(`\nTimestamp: ${report.timestamp}`);
    console.log(`\nChecks Performed: ${report.checks_performed}`);
    console.log(`Checks Passed: ${report.checks_passed} ✅`);
    console.log(`Checks Failed: ${report.checks_failed} ❌`);

    console.log('\n' + '-'.repeat(60));
    console.log('SUMMARY');
    console.log('-'.repeat(60));
    console.log(`Total Memories:           ${report.summary.total_memories.toLocaleString()}`);
    console.log(`Total Agents:             ${report.summary.total_agents.toLocaleString()}`);
    console.log(`Total Relationships:      ${report.summary.total_relationships.toLocaleString()}`);
    console.log(`Orphaned Relationships:   ${report.summary.orphaned_relationships}`);
    console.log(`Reputation Issues:        ${report.summary.reputation_issues}`);
    console.log(`Metacognition Issues:     ${report.summary.metacognition_issues}`);

    if (report.errors.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('ISSUES FOUND');
      console.log('-'.repeat(60));

      for (const error of report.errors) {
        const severityEmoji = {
          low: '🟡',
          medium: '🟠',
          high: '🔴',
          critical: '🚨',
        }[error.severity];

        console.log(`\n${severityEmoji} ${error.type.toUpperCase()} (${error.severity})`);
        console.log(`   ${error.description}`);
        console.log(`   Affected: ${error.affected_ids.length} items`);

        if (error.details && error.details.length > 0) {
          console.log(`   Sample: ${JSON.stringify(error.details[0], null, 2)}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));

    if (report.checks_failed === 0) {
      console.log('✅ ALL INTEGRITY CHECKS PASSED');
    } else {
      console.log('⚠️  SOME INTEGRITY ISSUES FOUND - REVIEW REQUIRED');
    }

    console.log('='.repeat(60) + '\n');
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const verifier = new GraphIntegrityVerifier();
    const report = await verifier.verify();

    // Save report to file
    const fs = require('fs');
    const reportPath = `integrity-report-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Full report saved to: ${reportPath}\n`);

    // Exit with error code if issues found
    process.exit(report.checks_failed > 0 ? 1 : 0);
  } catch (err: any) {
    console.error('❌ Fatal error during verification:', err.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { GraphIntegrityVerifier, IntegrityReport, IntegrityError };

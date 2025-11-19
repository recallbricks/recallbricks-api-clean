# RecallBricks Monitoring & Observability Guide

Complete guide to monitoring, telemetry, and production readiness for RecallBricks API v2.0.

## Table of Contents

1. [Overview](#overview)
2. [Audit Logging](#audit-logging)
3. [Health Checks](#health-checks)
4. [Metrics & Prometheus](#metrics--prometheus)
5. [SLA Tracking](#sla-tracking)
6. [Load Testing](#load-testing)
7. [Graph Integrity Verification](#graph-integrity-verification)
8. [Alerting & Dashboards](#alerting--dashboards)
9. [Troubleshooting](#troubleshooting)

---

## Overview

RecallBricks v2.0 includes enterprise-grade observability features:

- **Comprehensive Audit Logging** - Every critical operation logged for transparency
- **Multi-Component Health Checks** - Database, learning, collaboration, graph health
- **Prometheus Metrics** - Standard metrics format for monitoring tools
- **SLA Tracking** - Real-time availability, latency, and error rate monitoring
- **24-Hour Load Testing** - Prove production readiness under sustained load
- **Graph Integrity Verification** - Automated consistency checks

---

## Audit Logging

### Overview

All critical operations are logged to the `system_audit_log` table with full context.

### Event Types

| Event Type | Category | Description |
|------------|----------|-------------|
| `contribution` | collaboration | Agent contributes to memory |
| `reputation_update` | collaboration | Agent reputation recalculated |
| `conflict_detected` | collaboration | Memory conflict identified |
| `conflict_resolved` | collaboration | Conflict resolution applied |
| `pattern_learned` | learning | New pattern discovered |
| `prediction_made` | learning | Prediction generated |
| `synthesis_created` | collaboration | Knowledge synthesis created |
| `health_check` | performance | System health check performed |
| `sla_violation` | performance | SLA threshold violated |
| `agent_created` | collaboration | New agent profile created |
| `memory_created` | security | Memory created |
| `memory_updated` | security | Memory modified |
| `memory_deleted` | security | Memory removed |

### Query Audit Logs

**Get all errors in last 24 hours:**

```bash
curl -X GET "http://localhost:10002/api/v1/monitoring/audit/logs?success=false&limit=100" \
  -H "X-API-Key: your-api-key"
```

**Get agent contributions:**

```bash
curl -X GET "http://localhost:10002/api/v1/monitoring/audit/logs?event_type=contribution&limit=50" \
  -H "X-API-Key: your-api-key"
```

**Get audit statistics:**

```bash
curl -X GET "http://localhost:10002/api/v1/monitoring/audit/stats?period=24h" \
  -H "X-API-Key: your-api-key"
```

### Database Queries

**View recent audit events:**

```sql
SELECT
  timestamp,
  event_type,
  event_category,
  severity,
  success,
  event_data
FROM system_audit_log
ORDER BY timestamp DESC
LIMIT 100;
```

**Count events by type (last 24h):**

```sql
SELECT
  event_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE success = false) as errors
FROM system_audit_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY count DESC;
```

**Get error details:**

```sql
SELECT
  timestamp,
  event_type,
  error_message,
  stack_trace,
  event_data
FROM system_audit_log
WHERE success = false
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

---

## Health Checks

### Comprehensive Health Check

**GET /api/v1/monitoring/health**

Returns detailed health status for all system components.

```bash
curl http://localhost:10002/api/v1/monitoring/health
```

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-11-18T12:00:00Z",
  "uptime_seconds": 86400,
  "version": "2.0.0",
  "components": {
    "database": {
      "status": "healthy",
      "last_check": "2025-11-18T12:00:00Z",
      "response_time_ms": 45,
      "error_count_24h": 0,
      "message": "Query time: 45ms"
    },
    "learning_system": {
      "status": "healthy",
      "last_check": "2025-11-18T12:00:00Z",
      "response_time_ms": 120,
      "error_count_24h": 0,
      "message": "15 patterns active, 342 occurrences",
      "details": {
        "active_patterns_24h": 15,
        "total_occurrences": 342
      }
    },
    "collaboration_system": {
      "status": "healthy",
      "last_check": "2025-11-18T12:00:00Z",
      "response_time_ms": 78,
      "error_count_24h": 0,
      "message": "24 agents, avg reputation: 0.82",
      "details": {
        "total_agents": 24,
        "avg_reputation": 0.82,
        "total_contributions": 1247
      }
    },
    "memory_graph": {
      "status": "healthy",
      "last_check": "2025-11-18T12:00:00Z",
      "response_time_ms": 56,
      "error_count_24h": 0,
      "message": "Graph integrity verified",
      "details": {
        "total_relationships": 5432,
        "orphaned_relationships": 0
      }
    }
  },
  "metrics": {
    "requests_per_second": 42.5,
    "avg_response_time_ms": 125,
    "error_rate": 0.02
  },
  "sla": {
    "availability_percent": 99.98,
    "p95_latency_ms": 287,
    "target_met": true
  }
}
```

### Simple Health Check

**GET /api/v1/monitoring/health/simple**

Lightweight health check for load balancers.

```bash
curl http://localhost:10002/api/v1/monitoring/health/simple
```

### Kubernetes Probes

**Liveness Probe:** `GET /api/v1/monitoring/live`

```yaml
livenessProbe:
  httpGet:
    path: /api/v1/monitoring/live
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 30
```

**Readiness Probe:** `GET /api/v1/monitoring/ready`

```yaml
readinessProbe:
  httpGet:
    path: /api/v1/monitoring/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
```

### Component-Specific Health

**GET /api/v1/monitoring/components/{component}**

Check individual components: `database`, `learning`, `collaboration`, `graph`

```bash
curl http://localhost:10002/api/v1/monitoring/components/database
```

---

## Metrics & Prometheus

### Prometheus Endpoint

**GET /api/v1/monitoring/metrics**

Returns metrics in Prometheus exposition format.

```bash
curl http://localhost:10002/api/v1/monitoring/metrics
```

**Sample Output:**

```prometheus
# HELP recallbricks_requests_total Total number of requests by method
# TYPE recallbricks_requests_total counter
recallbricks_requests_total{method="GET"} 45123
recallbricks_requests_total{method="POST"} 12456

# HELP recallbricks_request_duration_seconds Request duration in seconds
# TYPE recallbricks_request_duration_seconds histogram
recallbricks_request_duration_seconds_bucket{le="0.1"} 42000
recallbricks_request_duration_seconds_bucket{le="0.5"} 56000
recallbricks_request_duration_seconds_bucket{le="1.0"} 57200

# HELP recallbricks_memory_total Total memories in system
# TYPE recallbricks_memory_total gauge
recallbricks_memory_total 145678

# HELP recallbricks_agent_reputation_score Agent reputation scores
# TYPE recallbricks_agent_reputation_score gauge
recallbricks_agent_reputation_score{agent_id="abc-123",agent_name="CodeAgent"} 0.85
recallbricks_agent_reputation_score{agent_id="def-456",agent_name="ResearchAgent"} 0.92

# HELP recallbricks_learning_patterns_active Active learning patterns (24h)
# TYPE recallbricks_learning_patterns_active gauge
recallbricks_learning_patterns_active 15

# HELP recallbricks_conflicts_resolved_total Conflicts resolved (24h)
# TYPE recallbricks_conflicts_resolved_total counter
recallbricks_conflicts_resolved_total 8
```

### JSON Metrics

**GET /api/v1/monitoring/metrics/json**

Returns metrics as JSON for easier consumption.

```bash
curl http://localhost:10002/api/v1/monitoring/metrics/json
```

### Prometheus Configuration

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'recallbricks'
    scrape_interval: 30s
    static_configs:
      - targets: ['localhost:10002']
    metrics_path: '/api/v1/monitoring/metrics'
```

### Grafana Dashboard

Import the provided Grafana dashboard (coming soon) or create custom panels:

**Key Metrics to Monitor:**
- Request rate and latency percentiles
- Error rate over time
- Agent reputation scores
- Active learning patterns
- Memory graph size
- Conflict resolution rate

---

## SLA Tracking

### SLA Targets

| Metric | Target | Description |
|--------|--------|-------------|
| Availability | 99.9% | Uptime percentage |
| P95 Latency | <500ms | 95th percentile response time |
| Error Rate | <1.0% | Failed requests percentage |

### Get SLA Metrics

**GET /api/v1/monitoring/sla?period={1h,24h,7d,30d}**

```bash
# Last hour SLA
curl "http://localhost:10002/api/v1/monitoring/sla?period=1h" \
  -H "X-API-Key: your-api-key"

# Last 24 hours
curl "http://localhost:10002/api/v1/monitoring/sla?period=24h" \
  -H "X-API-Key: your-api-key"
```

**Response:**

```json
{
  "period": "24h",
  "availability": {
    "target": 99.9,
    "actual": 99.98,
    "met": true,
    "downtime_minutes": 0.29
  },
  "latency": {
    "p50_ms": 125,
    "p95_ms": 287,
    "p99_ms": 456,
    "target_p95_ms": 500,
    "met": true
  },
  "error_rate": {
    "target": 1.0,
    "actual": 0.12,
    "met": true,
    "total_errors": 34,
    "total_requests": 28456
  },
  "overall_sla_met": true
}
```

### SLA Violations

When SLA targets are not met, violations are automatically logged to the audit log:

```sql
SELECT *
FROM system_audit_log
WHERE event_type = 'sla_violation'
ORDER BY timestamp DESC;
```

---

## Load Testing

### 24-Hour Smoke Test

Comprehensive load test that runs for 24 hours at 100-150 RPS.

**Prerequisites:**

Install k6:
```bash
# macOS
brew install k6

# Windows
choco install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Run the test:**

```bash
# Set environment variables
export BASE_URL="http://localhost:10002"
export API_KEY="rbk_test_local_123456789"

# Run 24-hour test
k6 run load-tests/24h-smoke-test.js

# Run shorter test (5 minutes)
k6 run --duration 5m load-tests/24h-smoke-test.js
```

**Test Coverage:**

The smoke test exercises:
- ✅ Memory creation with agent contributions (25%)
- ✅ Search and retrieval operations (20%)
- ✅ Prediction endpoints (15%)
- ✅ Agent collaboration features (15%)
- ✅ Relationship creation (10%)
- ✅ System health checks (10%)
- ✅ Memory integrity verification (5%)

**Thresholds:**

```javascript
{
  'http_req_duration': ['p(95)<500'],        // 95% under 500ms
  'http_req_failed': ['rate<0.01'],          // Less than 1% errors
  'memory_integrity_errors': ['count<10'],   // Less than 10 issues
  'graph_consistency_errors': ['count<5'],   // Less than 5 graph issues
}
```

**Viewing Results:**

k6 provides real-time output:
```
     ✓ memory created
     ✓ has contribution tracking
     ✓ has metacognition fields

     checks.........................: 98.76% ✓ 45678  ✗ 567
     data_received..................: 145 MB 2.0 MB/s
     data_sent......................: 67 MB  930 kB/s
     http_req_duration..............: avg=187ms min=23ms med=145ms max=2.1s p(95)=456ms
     http_req_failed................: 0.23%  ✓ 156    ✗ 67234
     http_reqs......................: 67390  934/s
     iteration_duration.............: avg=2.4s  min=1.1s med=2.2s max=8.7s p(95)=4.2s
```

---

## Graph Integrity Verification

### Run Integrity Check

After load tests or periodically, verify graph consistency:

```bash
npx ts-node scripts/verify-graph-integrity.ts
```

**What it checks:**

1. **Orphaned Relationships** - Relationships pointing to deleted memories
2. **Agent Reputation Consistency** - Reputation scores in valid range [0, 1]
3. **Memory Metacognition** - Usage counts and helpfulness scores valid
4. **Pattern Consistency** - Temporal patterns have valid data
5. **Referential Integrity** - Contributions reference valid agents/memories

**Sample Output:**

```
🔍 Starting graph integrity verification...

📊 Checking for orphaned relationships...
  ✅ No orphaned relationships found
📊 Checking agent reputation consistency...
  ✅ All 24 agents have consistent reputation scores
📊 Checking memory metacognition consistency...
  ✅ All 10000 sampled memories have valid metacognition
📊 Checking pattern consistency...
  ✅ All 47 patterns are consistent
📊 Checking referential integrity...
  ✅ All 1000 sampled contributions have valid references

============================================================
📋 GRAPH INTEGRITY REPORT
============================================================

Timestamp: 2025-11-18T12:00:00.000Z

Checks Performed: 5
Checks Passed: 5 ✅
Checks Failed: 0 ❌

------------------------------------------------------------
SUMMARY
------------------------------------------------------------
Total Memories:           145,678
Total Agents:             24
Total Relationships:      5,432
Orphaned Relationships:   0
Reputation Issues:        0
Metacognition Issues:     0

============================================================
✅ ALL INTEGRITY CHECKS PASSED
============================================================

📄 Full report saved to: integrity-report-1700312400000.json
```

### Schedule Regular Checks

Add to cron:

```bash
# Daily integrity check at 2 AM
0 2 * * * cd /path/to/recallbricks && npx ts-node scripts/verify-graph-integrity.ts >> /var/log/integrity-check.log 2>&1
```

---

## Alerting & Dashboards

### Prometheus Alerts

Example alert rules (`alerts.yml`):

```yaml
groups:
  - name: recallbricks
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(recallbricks_requests_total{status="error"}[5m]) > 0.01
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}%"

      # High latency
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(recallbricks_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High P95 latency"
          description: "P95 latency is {{ $value }}s"

      # Low availability
      - alert: LowAvailability
        expr: rate(recallbricks_requests_total[5m]) == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service appears down"
          description: "No requests received in 2 minutes"

      # Memory graph issues
      - alert: OrphanedRelationships
        expr: recallbricks_orphaned_relationships > 10
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Graph integrity issues"
          description: "{{ $value }} orphaned relationships detected"
```

### Grafana Dashboards

Create dashboards with these panels:

**System Overview:**
- Request rate (req/s)
- P50, P95, P99 latency
- Error rate percentage
- Total memories, agents, patterns

**Agent Performance:**
- Agent reputation scores (time series)
- Contributions per agent (bar chart)
- Conflict resolution rate

**Learning System:**
- Active patterns (gauge)
- Pattern discovery rate
- Relationship suggestions applied

**SLA Compliance:**
- Availability percentage (gauge)
- P95 latency vs target (time series)
- Error rate vs target (time series)

---

## Troubleshooting

### High Error Rate

**1. Check audit logs for errors:**

```bash
curl -X GET "http://localhost:10002/api/v1/monitoring/audit/logs?success=false&limit=100"
```

**2. Check component health:**

```bash
curl http://localhost:10002/api/v1/monitoring/health
```

**3. Review database errors:**

```sql
SELECT event_type, error_message, COUNT(*)
FROM system_audit_log
WHERE success = false
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY event_type, error_message
ORDER BY count DESC;
```

### High Latency

**1. Check P95 latency by endpoint:**

```sql
SELECT
  event_data->>'endpoint' as endpoint,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_latency
FROM system_audit_log
WHERE duration_ms IS NOT NULL
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY endpoint
ORDER BY p95_latency DESC;
```

**2. Check database performance:**

```bash
curl http://localhost:10002/api/v1/monitoring/components/database
```

**3. Review slow queries in PostgreSQL:**

```sql
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Memory Integrity Issues

**1. Run integrity check:**

```bash
npx ts-node scripts/verify-graph-integrity.ts
```

**2. Find and fix orphaned relationships:**

```sql
-- Find orphaned relationships
SELECT * FROM find_orphaned_relationships();

-- Delete orphaned relationships
DELETE FROM memory_relationships
WHERE id IN (
  SELECT relationship_id FROM find_orphaned_relationships()
);
```

**3. Fix reputation drift:**

```sql
-- Recalculate all agent reputations
SELECT calculate_agent_reputation(id)
FROM agent_profiles;
```

### SLA Violations

**1. Check recent violations:**

```sql
SELECT *
FROM system_audit_log
WHERE event_type = 'sla_violation'
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;
```

**2. Analyze availability issues:**

```bash
curl "http://localhost:10002/api/v1/monitoring/sla?period=24h"
```

**3. Review downtime windows:**

```sql
SELECT
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) FILTER (WHERE success = false) as errors,
  COUNT(*) as total
FROM system_audit_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

---

## Production Checklist

Before deploying to production:

- [ ] Run 24-hour load test successfully
- [ ] Verify all health checks pass
- [ ] Confirm SLA metrics meet targets
- [ ] Run graph integrity verification
- [ ] Set up Prometheus scraping
- [ ] Configure Grafana dashboards
- [ ] Set up alerting rules
- [ ] Test alert delivery
- [ ] Document runbook procedures
- [ ] Train team on monitoring tools

---

## Additional Resources

- [API Documentation](./README.md)
- [Deployment Guide](./DEPLOYMENT_CHECKLIST.md)
- [Metacognition Features](./METACOGNITION_API.md)
- [Collaboration System](./PHASE3_COMPLETE.md)

---

**Questions?** Check the [GitHub Issues](https://github.com/yourusername/recallbricks-api/issues) or reach out to the team.

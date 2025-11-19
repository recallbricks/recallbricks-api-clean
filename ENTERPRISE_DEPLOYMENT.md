# Enterprise Deployment Guide - Phase 2
## 150% Load Testing & Production Readiness

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Database Optimization](#database-optimization)
4. [Application Configuration](#application-configuration)
5. [Load Testing](#load-testing)
6. [Monitoring & Alerting](#monitoring--alerting)
7. [Performance Tuning](#performance-tuning)
8. [High Availability](#high-availability)
9. [Security Hardening](#security-hardening)
10. [Disaster Recovery](#disaster-recovery)

---

## System Requirements

### Minimum Production Specs (100 RPS baseline)

**Application Server:**
- CPU: 4 cores (8 vCPUs recommended)
- RAM: 8 GB (16 GB recommended)
- Storage: 50 GB SSD
- Network: 1 Gbps

**Database Server:**
- CPU: 4 cores (8 vCPUs recommended)
- RAM: 16 GB (32 GB recommended)
- Storage: 100 GB NVMe SSD
- IOPS: 3000+ sustained

### Recommended for 150% Load (150 RPS peak)

**Application Server:**
- CPU: 8 cores / 16 vCPUs
- RAM: 32 GB
- Storage: 100 GB NVMe SSD
- Network: 10 Gbps
- **Horizontal Scaling:** 2-3 instances behind load balancer

**Database Server:**
- CPU: 8 cores / 16 vCPUs
- RAM: 64 GB
- Storage: 500 GB NVMe SSD
- IOPS: 10000+ sustained
- **Read Replicas:** 2 replicas for read scaling

**Redis Cache (Optional but Recommended):**
- RAM: 8 GB
- CPU: 2 cores
- Network: Low latency to app servers

---

## Infrastructure Setup

### 1. Load Balancer Configuration

**NGINX Configuration:**

```nginx
upstream recallbricks_api {
    least_conn;  # Load balancing algorithm
    server app1.recallbricks.com:3000 max_fails=3 fail_timeout=30s;
    server app2.recallbricks.com:3000 max_fails=3 fail_timeout=30s;
    server app3.recallbricks.com:3000 max_fails=3 fail_timeout=30s backup;
}

server {
    listen 443 ssl http2;
    server_name api.recallbricks.com;

    # SSL Configuration
    ssl_certificate /etc/ssl/certs/recallbricks.crt;
    ssl_certificate_key /etc/ssl/private/recallbricks.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Rate Limiting (additional layer)
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
    limit_req zone=api_limit burst=200 nodelay;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Buffer sizes
    client_body_buffer_size 128k;
    client_max_body_size 10M;

    # Compression
    gzip on;
    gzip_vary on;
    gzip_types application/json text/plain;
    gzip_comp_level 6;

    location / {
        proxy_pass http://recallbricks_api;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;

        # Circuit breaker
        proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
        proxy_next_upstream_tries 2;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://recallbricks_api/health;
    }

    # Metrics endpoint (internal only)
    location /metrics {
        allow 10.0.0.0/8;  # Internal network only
        deny all;
        proxy_pass http://recallbricks_api/metrics;
    }
}
```

### 2. Database Setup

**PostgreSQL Configuration (postgresql.conf):**

```ini
# Memory Configuration
shared_buffers = 16GB              # 25% of RAM
effective_cache_size = 48GB        # 75% of RAM
maintenance_work_mem = 2GB
work_mem = 32MB

# Connection Settings
max_connections = 200
superuser_reserved_connections = 3

# Checkpoint Configuration
checkpoint_completion_target = 0.9
wal_buffers = 16MB
min_wal_size = 2GB
max_wal_size = 8GB

# Query Planning
default_statistics_target = 100
random_page_cost = 1.1             # For SSD
effective_io_concurrency = 200     # For SSD

# Logging
log_min_duration_statement = 1000  # Log queries > 1s
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

# Replication (for read replicas)
wal_level = replica
max_wal_senders = 3
max_replication_slots = 3
hot_standby = on
```

**Connection Pooling (PgBouncer):**

```ini
[databases]
recallbricks = host=localhost port=5432 dbname=recallbricks

[pgbouncer]
listen_addr = *
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
min_pool_size = 20
reserve_pool_size = 10
reserve_pool_timeout = 3

server_lifetime = 3600
server_idle_timeout = 600
server_connect_timeout = 15

max_db_connections = 100
max_user_connections = 100
```

### 3. Application Deployment

**PM2 Configuration (ecosystem.config.js):**

```javascript
module.exports = {
  apps: [{
    name: 'recallbricks-api',
    script: './dist/index.js',
    instances: 4,  // Use all CPU cores
    exec_mode: 'cluster',
    max_memory_restart: '1G',

    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,

      // Database
      DATABASE_URL: 'postgresql://user:pass@pgbouncer:6432/recallbricks',
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,

      // Performance
      NODE_OPTIONS: '--max-old-space-size=896',
      UV_THREADPOOL_SIZE: 16,

      // Caching
      CACHE_TTL: 300,
      CACHE_MAX_KEYS: 10000,

      // Rate Limiting
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_WINDOW_MS: 60000,
      RATE_LIMIT_MAX_REQUESTS: 100,
    },

    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,

    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
  }]
};
```

---

## Database Optimization

### 1. Run Performance Optimization

```bash
# Run the optimization script
psql -U postgres -d recallbricks -f migrations/optimize_performance.sql

# Verify indexes
psql -U postgres -d recallbricks -c "
SELECT tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
"
```

### 2. Enable pg_stat_statements

```sql
-- Add to postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
pg_stat_statements.max = 10000

-- Restart PostgreSQL and create extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### 3. Set up Automated Maintenance

```bash
# Add to crontab
0 * * * * psql -U postgres -d recallbricks -c "SELECT cleanup_old_caches();"
*/15 * * * * psql -U postgres -d recallbricks -c "SELECT refresh_stats_caches();"
0 2 * * * psql -U postgres -d recallbricks -c "SELECT maintenance_vacuum_analyze();"
```

---

## Application Configuration

### 1. Install Dependencies

```bash
npm install

# Install k6 for load testing
brew install k6
# OR
wget https://github.com/grafana/k6/releases/download/v0.48.0/k6-v0.48.0-linux-amd64.tar.gz
tar -xzf k6-v0.48.0-linux-amd64.tar.gz
sudo mv k6 /usr/local/bin/
```

### 2. Environment Variables

```bash
# .env.production
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@pgbouncer:6432/recallbricks
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# OpenAI (for embeddings)
OPENAI_API_KEY=sk-...

# Redis (optional, for distributed caching)
REDIS_URL=redis://localhost:6379

# Performance
CACHE_ENABLED=true
CACHE_TTL=300
MAX_CACHE_SIZE=10000

# Rate Limiting
RATE_LIMIT_ENABLED=true
GLOBAL_RATE_LIMIT=1000
USER_RATE_LIMIT=100
EXPENSIVE_RATE_LIMIT=20

# Circuit Breakers
CIRCUIT_BREAKER_ENABLED=true
DB_FAILURE_THRESHOLD=5
OPENAI_FAILURE_THRESHOLD=3

# Monitoring
PROMETHEUS_ENABLED=true
HEALTH_CHECK_INTERVAL=30000
SLA_MONITORING_ENABLED=true

# Graceful Degradation
DEGRADATION_HIGH_LOAD_THRESHOLD=0.8
DEGRADATION_CRITICAL_LOAD_THRESHOLD=0.95
```

### 3. Build and Deploy

```bash
# Build
npm run build

# Test build
npm start

# Deploy with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

---

## Load Testing

### 1. Pre-Load Test Checklist

- [ ] Database backup completed
- [ ] Monitoring dashboards ready
- [ ] Alert channels configured
- [ ] Rollback plan prepared
- [ ] Application logs configured
- [ ] Performance baseline established

### 2. Run Load Tests

**Baseline Test (100 RPS):**

```bash
k6 run --vus 100 --duration 10m load-tests/phase2-load-test.js
```

**150% Load Test (150 RPS):**

```bash
export API_URL=https://api.recallbricks.com
export API_KEY=your-test-key

k6 run --vus 150 --duration 15m load-tests/phase2-load-test.js
```

**Stress Test (Find Break Point):**

```bash
k6 run load-tests/stress-test.js
```

### 3. Expected Load Test Results

**Success Criteria:**

| Metric | Target | Measured |
|--------|--------|----------|
| **Availability** | 99.9% | ___% |
| **Error Rate** | <1% | ___% |
| **P95 Latency (Predict)** | <500ms | ___ms |
| **P95 Latency (Suggest)** | <400ms | ___ms |
| **P95 Latency (Search)** | <300ms | ___ms |
| **P99 Latency (All)** | <1000ms | ___ms |
| **RPS Sustained** | 150 | ___ |
| **Peak RPS** | 200 | ___ |
| **CPU Usage** | <80% | ___% |
| **Memory Usage** | <80% | ___% |
| **DB Connections** | <150 | ___ |

### 4. Analyze Results

```bash
# View results
cat load-test-results.json | jq '.metrics'

# Check for SLA violations
curl https://api.recallbricks.com/sla | jq

# Review alerts
curl https://api.recallbricks.com/alerts | jq
```

---

## Monitoring & Alerting

### 1. Prometheus Configuration

**prometheus.yml:**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'recallbricks-api'
    static_configs:
      - targets:
          - 'app1.recallbricks.com:3000'
          - 'app2.recallbricks.com:3000'
          - 'app3.recallbricks.com:3000'
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - 'alerts.yml'
```

**alerts.yml:**

```yaml
groups:
  - name: recallbricks_alerts
    interval: 30s
    rules:
      # High Error Rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.01
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # High Latency
      - alert: HighLatencyP95
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High P95 latency"
          description: "P95 latency is {{ $value }}s"

      # Circuit Breaker Open
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state > 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Circuit breaker {{ $labels.breaker_name }} is open"

      # Low Cache Hit Rate
      - alert: LowCacheHitRate
        expr: (rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))) < 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Low cache hit rate"
          description: "Cache hit rate is {{ $value | humanizePercentage }}"

      # Database Connection Pool Exhaustion
      - alert: DatabaseConnectionPoolHigh
        expr: db_connections_active > 150
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database connection pool is at {{ $value }} connections"

      # SLA Violation
      - alert: SLAViolation
        expr: (sum(rate(http_requests_total{status_code!~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) < 0.999
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "SLA violation - availability below 99.9%"
```

### 2. Grafana Dashboards

**Import Dashboard:**

```bash
# Use Grafana API to import
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d @grafana-dashboard.json
```

**Key Panels to Monitor:**

1. **Request Rate** (RPS)
2. **Error Rate** (%)
3. **Latency** (P50, P95, P99)
4. **Cache Hit Rate** (%)
5. **Database Connections**
6. **CPU & Memory Usage**
7. **Circuit Breaker States**
8. **Active Patterns Count**

### 3. Log Aggregation

**Using ELK Stack:**

```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/recallbricks-api/*.log
    fields:
      app: recallbricks-api
      env: production
    json.keys_under_root: true
    json.add_error_key: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "recallbricks-api-%{+yyyy.MM.dd}"
```

---

## Performance Tuning

### 1. Node.js Optimization

```javascript
// src/index.ts
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const cpuCount = os.cpus().length;

  for (let i = 0; i < cpuCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  // Start server
  startServer();
}
```

### 2. Database Connection Pooling

```typescript
// src/config/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: 'public',
    },
    auth: {
      persistSession: false,
    },
    global: {
      fetch: customFetch, // Add retry logic
    },
  }
);

// Custom fetch with retry
async function customFetch(url: string, options: any) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      attempts++;
      await sleep(Math.pow(2, attempts) * 100);
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) throw error;
    }
  }
}
```

### 3. Enable Compression

```typescript
// src/index.ts
import compression from 'compression';

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
}));
```

---

## High Availability

### 1. Database Replication

**Primary Server:**

```sql
-- Configure replication
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_senders = 3;
ALTER SYSTEM SET max_replication_slots = 3;

SELECT pg_reload_conf();

-- Create replication user
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'secure-password';
```

**Replica Server:**

```bash
# Stop replica
pg_ctl stop

# Remove data directory
rm -rf /var/lib/postgresql/data/*

# Create base backup
pg_basebackup -h primary.recallbricks.com -D /var/lib/postgresql/data \
  -U replicator -P -v -R -X stream -C -S replica_1

# Start replica
pg_ctl start
```

### 2. Application Failover

**Keepalived Configuration:**

```
vrrp_instance VI_1 {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 101
    advert_int 1

    authentication {
        auth_type PASS
        auth_pass secret
    }

    virtual_ipaddress {
        10.0.0.100
    }

    track_script {
        chk_api
    }
}

vrrp_script chk_api {
    script "/usr/local/bin/check_api.sh"
    interval 2
    fall 3
    rise 2
}
```

---

## Security Hardening

### 1. API Key Rotation

```bash
# Rotate API keys quarterly
psql -U postgres -d recallbricks -c "
UPDATE users
SET api_key = gen_random_uuid()::text,
    updated_at = NOW()
WHERE updated_at < NOW() - INTERVAL '90 days';
"
```

### 2. SSL/TLS Configuration

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
ssl_stapling on;
ssl_stapling_verify on;

add_header Strict-Transport-Security "max-age=63072000" always;
add_header X-Content-Type-Options nosniff;
add_header X-Frame-Options DENY;
add_header X-XSS-Protection "1; mode=block";
```

### 3. Firewall Rules

```bash
# Allow only necessary ports
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 443/tcp   # HTTPS
ufw allow from 10.0.0.0/8 to any port 3000   # Internal API
ufw enable
```

---

## Disaster Recovery

### 1. Backup Strategy

**Automated Backups:**

```bash
#!/bin/bash
# /usr/local/bin/backup-recallbricks.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/recallbricks"
RETENTION_DAYS=30

# Database backup
pg_dump -U postgres -Fc recallbricks > "$BACKUP_DIR/db_$DATE.dump"

# Compress
gzip "$BACKUP_DIR/db_$DATE.dump"

# Upload to S3
aws s3 cp "$BACKUP_DIR/db_$DATE.dump.gz" s3://recallbricks-backups/

# Clean old backups
find "$BACKUP_DIR" -name "db_*.dump.gz" -mtime +$RETENTION_DAYS -delete

# Verify backup
if [ $? -eq 0 ]; then
    echo "Backup completed successfully at $DATE"
else
    echo "Backup failed at $DATE" | mail -s "Backup Alert" admin@recallbricks.com
fi
```

**Schedule with cron:**

```bash
0 1 * * * /usr/local/bin/backup-recallbricks.sh
```

### 2. Recovery Procedure

```bash
# 1. Stop application
pm2 stop all

# 2. Restore database
pg_restore -U postgres -d recallbricks_restored backup.dump

# 3. Verify data integrity
psql -U postgres -d recallbricks_restored -c "SELECT COUNT(*) FROM memories;"

# 4. Switch databases
psql -U postgres -c "ALTER DATABASE recallbricks RENAME TO recallbricks_old;"
psql -U postgres -c "ALTER DATABASE recallbricks_restored RENAME TO recallbricks;"

# 5. Restart application
pm2 start all

# 6. Verify functionality
curl https://api.recallbricks.com/health
```

---

## Post-Deployment Checklist

- [ ] Load tests passed with 150% capacity
- [ ] All metrics within SLA targets
- [ ] Monitoring dashboards configured
- [ ] Alerts firing correctly
- [ ] Backups automated and tested
- [ ] Failover procedures documented
- [ ] Team trained on operations
- [ ] Runbook created for incidents
- [ ] Performance baseline documented
- [ ] Security audit completed

---

## Runbook for Common Issues

### Issue: High Latency

1. Check application metrics: `curl /metrics | grep latency`
2. Check database slow queries: `SELECT * FROM slow_queries;`
3. Check cache hit rate: `curl /sla | jq .cacheHitRate`
4. Scale horizontally if needed
5. Enable graceful degradation if critical

### Issue: Database Connection Pool Exhaustion

1. Check active connections: `SELECT * FROM connection_stats;`
2. Kill long-running queries: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < NOW() - INTERVAL '5 minutes';`
3. Increase pool size in PgBouncer
4. Scale database vertically

### Issue: Circuit Breaker Open

1. Check circuit breaker status: `curl /health`
2. Investigate root cause in logs
3. Reset circuit breaker if issue resolved: Call internal reset endpoint
4. Monitor for repeated failures

---

## Support & Escalation

**Severity Levels:**

- **P1 (Critical):** System down, data loss, security breach
  - Response: Immediate
  - Escalate to: CTO, Lead Engineer

- **P2 (High):** Major feature broken, significant performance degradation
  - Response: 1 hour
  - Escalate to: Engineering Manager

- **P3 (Medium):** Minor feature issue, moderate performance impact
  - Response: 4 hours
  - Escalate to: On-call engineer

- **P4 (Low):** Cosmetic issue, minimal impact
  - Response: Next business day
  - Escalate to: Standard support queue

---

**Deployment Status: ENTERPRISE READY ✅**

Last Updated: 2025-11-18
Version: 2.0.0-enterprise

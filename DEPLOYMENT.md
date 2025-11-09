# Deployment Checklist

Use this checklist to ensure a successful production deployment of RecallBricks API v2.0.

## Pre-Deployment

### Environment Setup

- [ ] **Node.js version** - Verify Node.js 18+ (20+ recommended)
- [ ] **Environment variables** - All required variables set
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `OPENAI_API_KEY`
  - [ ] `API_KEY`
  - [ ] `NODE_ENV=production`
  - [ ] `PORT` (if not using 8080)
  - [ ] `LOG_LEVEL=info` (or warn/error for production)
  - [ ] `CORS_ORIGIN` (set to actual domains, not *)

### Database Setup

- [ ] **Supabase project** created and accessible
- [ ] **Database tables** exist
  - [ ] `memories` table
  - [ ] `users` table (if used)
- [ ] **pgvector extension** enabled
- [ ] **RPC function** `match_memories` exists for vector search
- [ ] **Database connection** tested from deployment environment
- [ ] **Service role key** has appropriate permissions

### Security

- [ ] **API keys** are strong and secure (not test keys)
- [ ] **CORS origins** configured correctly (not wildcard * in production)
- [ ] **Secrets** stored securely (environment variables, not in code)
- [ ] **SSL/TLS** enabled (HTTPS only)
- [ ] **Rate limiting** configured appropriately for expected traffic
- [ ] **Firewall rules** configured (if applicable)

### Build and Test

- [ ] **Build succeeds** - `npm run build` completes without errors
- [ ] **TypeScript compilation** - No TypeScript errors
- [ ] **Dependencies** - All dependencies installed
- [ ] **Health check** - `/health` endpoint returns 200
- [ ] **Readiness check** - `/health/ready` endpoint returns 200
- [ ] **Database connection** - Readiness check shows healthy database
- [ ] **API endpoints** - Test key endpoints work correctly
- [ ] **Error handling** - 404 and 500 errors return correct format
- [ ] **Rate limiting** - Rate limit headers present in responses

## Deployment

### Infrastructure

- [ ] **Hosting platform** ready (Railway, Render, AWS, GCP, etc.)
- [ ] **Container/VM** configured with correct resources
  - [ ] Minimum 512MB RAM recommended
  - [ ] 1 CPU core minimum
- [ ] **Load balancer** configured (if using)
- [ ] **DNS** configured correctly
- [ ] **SSL certificate** installed and valid

### Health Checks

- [ ] **Liveness probe** configured
  - Path: `/health`
  - Initial delay: 10s
  - Period: 30s
  - Timeout: 5s
- [ ] **Readiness probe** configured
  - Path: `/health/ready`
  - Initial delay: 5s
  - Period: 10s
  - Timeout: 10s
  - Success threshold: 1
  - Failure threshold: 3

### Monitoring

- [ ] **Logging** configured
  - [ ] Log aggregation service connected (if using)
  - [ ] JSON logs being captured
  - [ ] Request IDs in logs
  - [ ] Log retention policy configured
- [ ] **Metrics** configured
  - [ ] Prometheus scraping configured (if using)
  - [ ] `/health/metrics` endpoint accessible to monitoring
  - [ ] Alerts configured for key metrics:
    - [ ] HTTP error rate > 5%
    - [ ] Circuit breaker OPEN state
    - [ ] Rate limit hits increasing
    - [ ] Database query latency > 1s
    - [ ] Memory usage > 80%

### Deployment Steps

- [ ] **Deploy application**
  - [ ] Build production image/package
  - [ ] Deploy to hosting platform
  - [ ] Verify deployment completed successfully
- [ ] **Verify health**
  - [ ] `/health` returns 200
  - [ ] `/health/ready` returns 200 with healthy checks
  - [ ] Database status is "connected"
  - [ ] Circuit breaker state is "CLOSED"
- [ ] **Test endpoints**
  - [ ] Root endpoint `/` returns API info
  - [ ] Create memory: `POST /api/v1/memories`
  - [ ] List memories: `GET /api/v1/memories`
  - [ ] Search memories: `GET /api/v1/memories/search?q=test`
  - [ ] Context endpoint: `POST /api/v1/context`
  - [ ] Rate limit status: `GET /api/v1/rate-limit`
- [ ] **Test error handling**
  - [ ] Invalid API key returns 401 with error code
  - [ ] Missing API key returns 401
  - [ ] Invalid request returns 400 with details
  - [ ] Non-existent route returns 404
- [ ] **Test rate limiting**
  - [ ] Rate limit headers present
  - [ ] Rate limit enforced (429 when exceeded)
  - [ ] Retry-After header present on 429

## Post-Deployment

### Monitoring Setup

- [ ] **Alerts configured**
  - [ ] Error rate threshold alerts
  - [ ] Uptime monitoring
  - [ ] Certificate expiration alerts
  - [ ] Database connection alerts
  - [ ] Circuit breaker state alerts
- [ ] **Dashboards created**
  - [ ] HTTP request metrics
  - [ ] Database query metrics
  - [ ] Error rate trends
  - [ ] Rate limit usage
  - [ ] Circuit breaker status

### Performance

- [ ] **Load test** conducted
  - [ ] API handles expected traffic
  - [ ] Response times acceptable (<100ms for most endpoints)
  - [ ] No memory leaks observed
  - [ ] Database queries optimized
- [ ] **Circuit breaker** tested
  - [ ] Fails gracefully when database unavailable
  - [ ] Recovers automatically when database returns
- [ ] **Rate limiting** verified
  - [ ] Limits enforced correctly
  - [ ] Headers returned correctly
  - [ ] Different costs for different methods working

### Documentation

- [ ] **API documentation** updated
- [ ] **Environment variables** documented for ops team
- [ ] **Runbook** created for common issues
- [ ] **Incident response** plan documented
- [ ] **Deployment process** documented

### Security Audit

- [ ] **API keys** rotated after initial deployment
- [ ] **Security headers** verified (use https://securityheaders.com)
- [ ] **CORS** verified working correctly
- [ ] **Rate limiting** protecting against abuse
- [ ] **Input validation** protecting against injection
- [ ] **Error messages** don't leak sensitive information

### Backup and Recovery

- [ ] **Database backups** configured
- [ ] **Backup restoration** tested
- [ ] **Disaster recovery plan** documented
- [ ] **Rollback procedure** documented and tested

## Verification

### Automated Tests

```bash
# Health check
curl https://your-domain.com/health

# Readiness check
curl https://your-domain.com/health/ready

# Create memory (requires API key)
curl -X POST https://your-domain.com/api/v1/memories \
  -H "X-API-Key: your-production-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"Production deployment test"}'

# Check rate limit
curl -H "X-API-Key: your-production-key" \
  https://your-domain.com/api/v1/rate-limit

# Metrics (if accessible)
curl https://your-domain.com/health/metrics
```

### Manual Verification

- [ ] **Access API** from browser/Postman
- [ ] **Create test memory** and verify it's stored
- [ ] **Search for memory** and verify it's found
- [ ] **Check logs** for any errors or warnings
- [ ] **Monitor metrics** for 1 hour after deployment
- [ ] **Test from different geographic locations** (if global)

## Production Checklist Summary

**Critical (Must Have):**
- [x] All environment variables set correctly
- [x] Database connection working
- [x] Health checks returning 200
- [x] SSL/TLS enabled
- [x] Error handling working
- [x] Monitoring configured
- [x] Logs being captured

**Important (Should Have):**
- [ ] Load testing completed
- [ ] Alerts configured
- [ ] Backup strategy in place
- [ ] Runbook created
- [ ] Rollback procedure tested

**Nice to Have:**
- [ ] Prometheus metrics configured
- [ ] Dashboard created
- [ ] Performance optimization completed
- [ ] Geographic redundancy (if needed)

## Common Issues and Solutions

### Issue: Health check returns 503

**Check:**
- Database connection
- Supabase credentials
- Circuit breaker state

**Solution:**
```bash
# Check readiness details
curl https://your-domain.com/health/ready

# Check environment variables
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

### Issue: Rate limit immediately hit

**Check:**
- Global rate limit setting
- API key plan
- Multiple instances sharing same rate limit store

**Solution:**
```bash
# Increase global rate limit
export GLOBAL_RATE_LIMIT=5000

# Check current status
curl -H "X-API-Key: your-key" \
  https://your-domain.com/api/v1/rate-limit
```

### Issue: High memory usage

**Check:**
- Number of concurrent requests
- Circuit breaker memory usage
- Rate limit store size

**Solution:**
- Increase container memory
- Implement Redis for rate limiting (future enhancement)
- Review and optimize memory-intensive operations

### Issue: Slow response times

**Check:**
- Database query performance
- Network latency to Supabase
- OpenAI API response times
- Circuit breaker state

**Solution:**
- Review database indexes
- Move closer to Supabase region
- Implement caching for embeddings
- Monitor /health/metrics for query times

## Rollback Plan

If deployment fails:

1. **Immediate rollback** to previous version
2. **Check logs** for errors
3. **Review health checks** for specific failures
4. **Fix issues** in staging
5. **Re-deploy** when ready

## Success Criteria

Deployment is successful when:

- [ ] All health checks passing
- [ ] API endpoints responding correctly
- [ ] Error rate < 1%
- [ ] Average response time < 200ms
- [ ] No critical alerts
- [ ] Logs showing normal operation
- [ ] Metrics being collected
- [ ] Users able to access API

## Support Contacts

- **Infrastructure:** [Team/Person]
- **Database:** [Team/Person]
- **Security:** [Team/Person]
- **On-call:** [Rotation/Person]

## Post-Deployment Tasks

- [ ] Monitor for 24 hours
- [ ] Review logs daily for first week
- [ ] Performance optimization if needed
- [ ] Update documentation based on learnings
- [ ] Share deployment report with team

---

**Deployment Date:** _________________

**Deployed By:** _________________

**Version:** v2.0.0

**Status:** _________________

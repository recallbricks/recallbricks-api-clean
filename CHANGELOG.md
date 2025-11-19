# Changelog

All notable changes to the RecallBricks API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-11-18

### Added - Metacognition System (Self-Optimizing Memory)

#### Usage-Based Learning
- **Automatic usage tracking** for all memory accesses
  - `usage_count`: Tracks how often each memory is accessed
  - `last_accessed`: Timestamp of most recent access
  - `access_pattern`: JSONB storage for context tracking and co-access patterns
- **Context-aware tracking**: Optional context parameter to categorize access patterns
- **Fire-and-forget tracking**: Async tracking doesn't block response times
- **Analytics view**: Pre-computed metrics for performance insights
  - Access frequency classification (unused, low, medium, high, very_high)
  - Recency scores (0.0-1.0 based on last access time)
  - Days since last access
  - Relationship counts

#### Weighted Search
- **POST /api/v1/memories/search** enhanced with metacognitive parameters:
  - `weight_by_usage`: Boolean - Boost frequently-used memories in results
  - `decay_old_memories`: Boolean - Penalize stale memories (90+ days since access)
  - `learning_mode`: Boolean - Track which results are accessed (builds usage data)
  - `min_helpfulness_score`: Number (0.0-1.0) - Filter by minimum helpfulness
- **Intelligent scoring algorithm**:
  - `weighted_score = base_similarity × (1 + log(usage_count + 1)) × helpfulness_score`
  - Recent memories (≤7 days): +20% boost
  - Stale memories (≥90 days): -30% penalty
- **Detailed result metadata** including boost/penalty indicators

#### Feedback Loop
- **POST /api/v1/memories/:id/feedback** - Submit helpfulness feedback
  - Simple thumbs up/down: `helpful` (boolean)
  - Detailed satisfaction scores: `user_satisfaction` (0.0-1.0)
  - Context tracking: `context` (string) describes how memory was used
- **Exponential moving average** for satisfaction scores
  - Formula: `new_score = 0.3 × user_satisfaction + 0.7 × current_score`
  - Provides stability while favoring recent feedback
- **Helpfulness score updates**:
  - Positive feedback: +0.1 (capped at 1.0)
  - Negative feedback: -0.05 (floored at 0.0)
  - Default starting score: 0.5

#### Pattern Analysis
- **GET /api/v1/memories/meta/patterns** - Analyze usage patterns
  - Most useful tags (by avg helpfulness and usage count)
  - Frequently co-accessed memories (suggesting relationships)
  - Underutilized memories (candidates for archival)
  - Access time patterns (hourly and daily distributions)
  - Optimal relationship types (by effectiveness)
  - Summary statistics (total memories, accesses, avg helpfulness)
- **Configurable time window**: `days` query parameter (default: 30)

#### Self-Learning System
- **POST /api/v1/learning/analyze** - Trigger learning analysis
  - Detects memory clusters based on co-access patterns
  - Suggests new relationships with confidence scores
  - Calculates relationship type effectiveness weights
  - Identifies stale memories (180+ days unused)
  - `auto_apply` option: Automatically create high-confidence relationships (≥0.75)
- **POST /api/v1/learning/apply-suggestions** - Manually apply relationship suggestions
  - Accepts suggestions from previous analysis
  - Configurable minimum confidence threshold
  - Returns count of applied relationships
- **GET /api/v1/learning/status** - Check learning system status
  - Shows enabled state, last run time, next scheduled run
  - Useful for monitoring and debugging

#### Background Learning Scheduler
- **Automatic learning jobs** run on configurable intervals
  - Default: Every 1 hour
  - Runs immediately on startup, then on schedule
  - Analyzes co-access patterns continuously
  - Suggests relationships based on usage
  - Calculates type performance metrics
- **Environment variables**:
  - `ENABLE_LEARNING_SCHEDULER`: Enable/disable scheduler (default: true)
  - `LEARNING_INTERVAL_HOURS`: Hours between runs (default: 1)
  - `LEARNING_AUTO_APPLY`: Auto-create high-confidence relationships (default: false)
- **Graceful startup and shutdown**
  - Integrates with application lifecycle
  - Comprehensive logging for monitoring

#### Enhanced Memory Endpoints
- **GET /api/v1/memories/:id** now includes:
  - Usage count and last accessed timestamp
  - Helpfulness score
  - Access pattern data (contexts used)
  - Learning metadata from analytics view
  - Optional `context` query parameter for tracking
- **All endpoints backward compatible** - New fields are additions only

#### Database Enhancements
- **New columns** in `memories` table:
  - `usage_count INTEGER DEFAULT 0`
  - `last_accessed TIMESTAMP WITH TIME ZONE`
  - `helpfulness_score FLOAT DEFAULT 0.5`
  - `access_pattern JSONB DEFAULT '{}'`
- **New database functions**:
  - `increment_memory_usage(memory_id, context)`: Atomic usage tracking
  - `update_helpfulness_score(memory_id, helpful, user_satisfaction)`: Score updates
- **New analytics view**: `memory_analytics`
  - Pre-computed access frequency classifications
  - Recency scores based on last access
  - Days since access calculations
  - Relationship counts
- **Performance indexes**:
  - `idx_memories_last_accessed` on `last_accessed`
  - `idx_memories_helpfulness_score` on `helpfulness_score`
  - `idx_memories_usage_count` on `usage_count`
  - `idx_memories_helpfulness_recency` composite on `(helpfulness_score, last_accessed)`

#### Additional Learning Endpoints
- **GET /api/v1/learning/maintenance-suggestions** - Get maintenance recommendations
  - Identifies memories that need attention
  - Suggests archival candidates
  - Highlights quality issues
- **GET /api/v1/learning/metrics** - Learning system performance metrics
  - Analysis run statistics
  - Suggestion acceptance rates
  - Overall system health indicators
- **POST /api/v1/learning/analyze-enhanced** - Advanced learning analysis
  - Enhanced pattern detection algorithms
  - More sophisticated clustering
  - Better relationship suggestions

### Documentation

#### New Documentation Files
- **METACOGNITION_API.md** - Complete API reference for all metacognition features
  - Detailed endpoint documentation with request/response examples
  - Usage patterns and best practices
  - Migration guide for existing deployments
  - Performance considerations
  - Troubleshooting guide
- **METACOGNITION_PHASE1.md** - Implementation summary and overview
  - Executive summary of features built
  - Architecture decisions and rationale
  - Success criteria verification
  - File structure and organization
  - Maintenance and monitoring guide
- **README.md** updated to highlight metacognition features
  - New "Metacognitive Features" section
  - Updated endpoint documentation
  - Environment variable reference
  - Link to detailed metacognition docs

### Changed

#### Search Behavior
- **Enhanced search results** include learning metadata when available
- **Better result ordering** when weighted search is enabled
- **Learning mode** option allows building usage data passively

#### Memory Retrieval
- **GET requests now track usage** automatically (fire-and-forget)
- **Enhanced response format** includes learning metadata
- **Context tracking** enables better pattern analysis

### Performance Impact

- **Minimal latency increase**:
  - GET /memories/:id: +5-10ms (analytics view lookup)
  - POST /memories/search (weighted): +20-30ms (3x fetch + re-ranking)
  - POST /memories/:id/feedback: +15-20ms (score calculation)
- **Storage overhead**: ~50 bytes per memory (~50 MB for 1M memories)
- **Index overhead**: 4 new indexes with minimal write impact
- **All within acceptable production ranges**

### Migration

- **100% backward compatible** - No breaking changes
- **Migration script**: `migrations/20251117_add_metacognitive_tracking.sql`
- **Safe to deploy**: All new columns have defaults, new params are optional
- **Existing API calls work unchanged**

### Security

- **All new endpoints require authentication** (JWT or API Key)
- **User isolation enforced** - Can't access other users' data
- **Input validation** on all new parameters
- **Rate limiting** applies to all new endpoints
- **SQL injection protection** via parameterized queries

## [2.0.0] - 2025-01-09

### Added - Production-Grade Features

#### Rate Limiting
- **Enhanced rate limiting middleware** with proper headers
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests in window
  - `X-RateLimit-Reset`: When the rate limit window resets (ISO 8601)
  - `Retry-After`: Seconds to wait before retrying (on 429 responses)
- **Different limits for different endpoints**
  - POST requests: 2x cost (more resource intensive)
  - GET requests: 1x cost
  - PUT/DELETE requests: 1.4x cost
- **Global rate limiting** (1000 req/min) + per-API-key limiting (based on plan)
- **Per-plan rate limits**: Free (100/hr), Pro (1000/hr), Team (5000/hr), Enterprise (50000/hr)
- **Configurable via environment variable**: `GLOBAL_RATE_LIMIT`

#### Request Validation
- **Comprehensive validation middleware** for all request types
  - Memory creation: validates text (max 10K chars), tags (array), metadata (object)
  - Memory queries: validates limit (1-100), offset (>= 0)
  - Search queries: validates query text (max 500 chars)
  - Context requests: validates query, limit, conversation_history
- **Clear validation error messages** with field-specific details
- **Max text length enforcement**: 10,000 characters (configurable)

#### Enhanced Error Responses
- **Consistent error response format** with error codes
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Text too long. Maximum 10000 characters, got 15000",
      "details": { "max": 10000, "actual": 15000 },
      "requestId": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2025-01-09T12:34:56.789Z"
    }
  }
  ```
- **Error codes** for all error types:
  - Authentication: `INVALID_API_KEY`, `MISSING_API_KEY`
  - Validation: `VALIDATION_ERROR`, `INVALID_TEXT_LENGTH`
  - Rate Limiting: `RATE_LIMIT_EXCEEDED`
  - Database: `DATABASE_ERROR`, `DATABASE_CONNECTION_FAILED`
  - Resources: `RESOURCE_NOT_FOUND`, `ROUTE_NOT_FOUND`
  - Server: `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`, `CIRCUIT_BREAKER_OPEN`
- **Request IDs** included in all responses for debugging
- **Stack traces** only in development mode
- **User-friendly error messages** for all error conditions

#### Health Check Endpoints
- **GET /health** - Basic liveness check
  - Returns 200 if service is running
  - Includes version, timestamp, service name
- **GET /health/ready** - Readiness check
  - Returns 200 if ready to accept traffic, 503 if not
  - Checks database connection and circuit breaker state
  - Includes latency metrics and detailed status
- **GET /health/metrics** - Prometheus metrics
  - Standard Prometheus format
  - CPU, memory, event loop metrics
  - Custom application metrics (HTTP requests, DB queries, rate limits, etc.)

#### Structured Logging
- **Request ID** for every request (auto-generated UUID or from X-Request-ID header)
- **JSON-formatted logs** in production mode
- **Human-readable logs** in development mode
- **Log levels**: DEBUG, INFO, WARN, ERROR
- **Configurable via environment**: `LOG_LEVEL`, `NODE_ENV`
- **Request logging** with:
  - Method, path, status code, duration
  - User ID, request ID
  - Error messages (if applicable)
- **Type-specific logging**:
  - `http_request`: HTTP request/response logging
  - `health_check`: Health check results
  - Database query logging with operation and table

#### Circuit Breaker for Database
- **Circuit breaker pattern** protects database from cascading failures
- **Three states**: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
- **Automatic recovery** after timeout (default: 60 seconds)
- **Configurable thresholds**:
  - Failure threshold: 5 consecutive failures (default)
  - Timeout: 60 seconds (default)
  - Environment variables: `CIRCUIT_BREAKER_THRESHOLD`, `CIRCUIT_BREAKER_TIMEOUT`
- **Metrics tracking** for circuit breaker state and failures
- **Graceful degradation**: Returns 503 when circuit is open

#### Graceful Degradation
- **Circuit breaker protection** prevents cascading failures
- **Meaningful error messages** when database is unavailable
- **Graceful shutdown** handling:
  - Stops accepting new connections
  - Allows in-flight requests to complete (30 second timeout)
  - Handles SIGTERM, SIGINT signals
  - Handles uncaught exceptions and unhandled rejections

#### API Versioning
- **API v1 prefix** for all endpoints (`/api/v1/...`)
- **Version in response headers** and health checks
- **Prepared structure** for future v2 API

#### Security Headers
- **Helmet.js** for security headers:
  - X-Content-Type-Options
  - X-Frame-Options
  - X-XSS-Protection
  - Strict-Transport-Security (HSTS)
- **CORS configuration**:
  - Configurable origins via `CORS_ORIGIN` environment variable
  - Proper exposed headers for rate limiting and request IDs
  - Credentials support
  - 24-hour max age
- **API key validation improvements**:
  - Rate limiting by API key (not just IP)
  - Request ID tracking per API key
  - Better error messages
- **Trust proxy** configuration for deployment behind load balancers

#### Observability
- **Prometheus metrics endpoint** at `/health/metrics`
- **Request duration tracking** with histogram buckets
- **Error rate tracking** by error code
- **Database query performance tracking**:
  - Query duration histograms
  - Query success/failure counts
  - Operation and table tracking
- **Rate limit hit tracking**
- **Memory operation counters**:
  - Memories created
  - Memories queried
- **Circuit breaker state metrics**
- **Active database connections gauge**
- **Default system metrics**: CPU, memory, event loop lag

### Changed

#### Logging
- **Replaced console.log with structured logger** throughout codebase
- **All logs now include context** (request ID, user ID, etc.)
- **Consistent log format** across the application

#### Error Handling
- **All errors now use APIError class** with error codes
- **Consistent error response format** across all endpoints
- **Better error messages** for debugging

#### Database Operations
- **All database queries wrapped in circuit breaker**
- **Performance metrics tracking** for all queries
- **Better error messages** for database failures

#### Request Processing
- **Request context middleware** adds request ID and metrics to all requests
- **Request logger middleware** logs all requests with duration
- **Error handler middleware** provides consistent error responses

### Configuration

#### New Environment Variables
- `LOG_LEVEL` - Log level (debug, info, warn, error) - default: info in production, debug in development
- `NODE_ENV` - Environment (development, production) - affects logging format and stack traces
- `GLOBAL_RATE_LIMIT` - Global rate limit (requests per minute) - default: 1000
- `CIRCUIT_BREAKER_THRESHOLD` - Failure threshold before opening circuit - default: 5
- `CIRCUIT_BREAKER_TIMEOUT` - Time to wait before attempting recovery (ms) - default: 60000
- `MAX_MEMORY_TEXT_LENGTH` - Maximum memory text length - default: 10000
- `CORS_ORIGIN` - Allowed CORS origins (comma-separated) - default: *

### Dependencies

#### Added
- `helmet` (^8.0.0) - Security headers
- `prom-client` (^15.1.0) - Prometheus metrics
- `uuid` (^11.0.5) - UUID generation for request IDs

### Deployment

#### Breaking Changes
None - v2.0.0 is fully backward compatible with v1.x API

#### Recommended Actions
1. Set `NODE_ENV=production` in production environment
2. Configure `CORS_ORIGIN` to restrict allowed origins
3. Set up monitoring/alerting on `/health/ready` endpoint
4. Configure log aggregation for JSON logs
5. Set up Prometheus scraping of `/health/metrics`

### Infrastructure

#### Health Checks for Load Balancers
- Liveness probe: `GET /health` (should return 200)
- Readiness probe: `GET /health/ready` (returns 200 when ready, 503 when not)

#### Monitoring
- Metrics endpoint: `GET /health/metrics` (Prometheus format)
- All metrics prefixed with `recallbricks_`

## [1.0.0] - 2025-01-08

### Initial Release
- Basic API endpoints for memory management
- Supabase integration
- OpenAI integration for embeddings
- MCP server for Claude integration
- Basic rate limiting
- Basic authentication

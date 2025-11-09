# Changelog

All notable changes to the RecallBricks API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

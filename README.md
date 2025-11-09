# RecallBricks API v2.0

**The Memory Layer for AI** - Production-Grade API

RecallBricks API is a production-ready, scalable memory management system for AI applications. Store, retrieve, and search through AI memories with semantic search, intelligent context retrieval, and cross-LLM memory sharing.

## Features

### Production-Grade Features (v2.0)

- **Circuit Breaker Protection** - Prevents cascading failures with automatic recovery
- **Advanced Rate Limiting** - Per-API-key and global rate limits with proper headers
- **Structured Logging** - JSON logs with request IDs for production debugging
- **Health Check Endpoints** - Liveness and readiness probes for load balancers
- **Prometheus Metrics** - Comprehensive observability for monitoring
- **Request Validation** - Input validation with clear error messages
- **Enhanced Error Handling** - Consistent error responses with error codes
- **Graceful Shutdown** - Clean shutdown handling for zero-downtime deployments
- **Security Headers** - Helmet.js for production security best practices
- **API Versioning** - Version prefix (/api/v1/) for future compatibility

### Core Features

- **Vector Embeddings** - Semantic search using OpenAI text-embedding-3-small
- **Intelligent Context** - Auto-extracts key information from text
- **Cross-LLM Memory** - Share memories across different AI models
- **Full-Text Search** - PostgreSQL full-text search with relevance scoring
- **MCP Integration** - Model Context Protocol support for Claude

## Quick Start

### Prerequisites

- Node.js 18+ (20+ recommended)
- PostgreSQL (via Supabase)
- OpenAI API key
- RecallBricks API key

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Build
npm run build

# Run in development
npm run dev

# Run in production
npm start
```

### Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key
API_KEY=your-recallbricks-api-key

# Optional
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
GLOBAL_RATE_LIMIT=1000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000
MAX_MEMORY_TEXT_LENGTH=10000
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com
```

## API Documentation

See [CHANGELOG.md](./CHANGELOG.md) for v2.0 features and breaking changes.

### Health Checks

- `GET /health` - Liveness check (returns 200 if running)
- `GET /health/ready` - Readiness check (200 if ready, 503 if not)
- `GET /health/metrics` - Prometheus metrics

### Memory Endpoints

All endpoints require `X-API-Key` header.

- `POST /api/v1/memories` - Create memory
- `GET /api/v1/memories` - List memories
- `GET /api/v1/memories/search` - Semantic search
- `GET /api/v1/memories/:id` - Get memory by ID
- `PUT /api/v1/memories/:id` - Update memory
- `DELETE /api/v1/memories/:id` - Delete memory

### Context Endpoints

- `POST /api/v1/context` - Intelligent context retrieval

### Rate Limiting

- `GET /api/v1/rate-limit` - Check current rate limit status

## Rate Limits

- **Global**: 1000 requests/minute
- **Free**: 100 requests/hour
- **Pro**: 1000 requests/hour
- **Team**: 5000 requests/hour
- **Enterprise**: 50000 requests/hour

POST requests count as 2x cost.

## Monitoring

### Logs

Production logs are JSON-formatted with request IDs:

```json
{
  "timestamp": "2025-01-09T12:34:56.789Z",
  "level": "info",
  "message": "POST /api/v1/memories 201 45ms",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "...",
  "duration": 45
}
```

### Metrics

Prometheus metrics available at `/health/metrics`:
- HTTP request duration and counts
- Database query performance
- Circuit breaker state
- Rate limit hits
- Active connections

## Deployment

### Docker Example

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### Health Checks

**Kubernetes:**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
```

## Circuit Breaker

Protects database from cascading failures:
- **Threshold**: 5 consecutive failures
- **Timeout**: 60 seconds
- **States**: CLOSED → OPEN → HALF_OPEN → CLOSED

## Migration from v1.x

See [MIGRATION.md](./MIGRATION.md) for details.

v2.0 is fully backward compatible - no breaking changes.

## License

MIT

## Version History

- **v2.0.0** (2025-01-09) - Production-grade features
- **v1.0.0** (2025-01-08) - Initial release

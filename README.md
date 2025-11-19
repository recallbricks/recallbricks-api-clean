# RecallBricks API v2.0

**The Memory Layer for AI** - Production-Grade API with Self-Optimizing Intelligence

RecallBricks API is a production-ready, scalable memory management system for AI applications. Store, retrieve, and search through AI memories with semantic search, intelligent context retrieval, cross-LLM memory sharing, and **metacognitive learning** that continuously optimizes itself based on usage patterns and feedback.

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

### Metacognitive Features (Self-Optimizing Memory)

- **Usage-Based Learning** - Tracks which memories are accessed and how often
- **Weighted Search** - Boosts frequently-used, high-value memories in results
- **Feedback Loop** - Learns from user feedback to improve relevance over time
- **Pattern Discovery** - Automatically identifies relationship patterns
- **Self-Scheduling** - Background learning jobs analyze and optimize continuously
- **Performance Analytics** - Insights on memory effectiveness and usage patterns



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

# Metacognition/Learning (optional)
ENABLE_LEARNING_SCHEDULER=true
LEARNING_INTERVAL_HOURS=1
LEARNING_AUTO_APPLY=false
```

## API Documentation

**📚 [Complete API Reference](./API_REFERENCE.md)** - Comprehensive documentation for all endpoints

**📋 [CHANGELOG](./CHANGELOG.md)** - v2.1 features and release notes

**🧠 [Metacognition API](./METACOGNITION_API.md)** - Detailed self-optimizing memory documentation

### Health Checks

- `GET /health` - Liveness check (returns 200 if running)
- `GET /health/ready` - Readiness check (200 if ready, 503 if not)
- `GET /health/metrics` - Prometheus metrics

### Memory Endpoints

All endpoints require `X-API-Key` header.

- `POST /api/v1/memories` - Create memory
- `GET /api/v1/memories` - List memories
- `POST /api/v1/memories/search` - Semantic search (supports `weight_by_usage`, `decay_old_memories`, `learning_mode`, `min_helpfulness_score`)
- `GET /api/v1/memories/:id` - Get memory by ID (tracks usage, returns learning metadata)
- `PUT /api/v1/memories/:id` - Update memory
- `DELETE /api/v1/memories/:id` - Delete memory

### Context Endpoints

- `POST /api/v1/context` - Intelligent context retrieval

### Metacognition Endpoints

- `POST /api/v1/memories/:id/feedback` - Submit feedback on memory helpfulness
- `GET /api/v1/memories/meta/patterns` - Analyze usage patterns and get insights
- `POST /api/v1/learning/analyze` - Trigger learning analysis (discover patterns)
- `POST /api/v1/learning/apply-suggestions` - Apply relationship suggestions
- `GET /api/v1/learning/status` - Check learning system status

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

- **v2.1.0** (2025-11-18) - Metacognition system (Phases 1-4) - Self-optimizing memory with usage tracking, weighted search, feedback loops, and automated learning
- **v2.0.0** (2025-01-09) - Production-grade features
- **v1.0.0** (2025-01-08) - Initial release

# Trade-X Development Environment

## Quick Start with Docker Compose

### Prerequisites

- Docker Desktop installed and running
- Docker Compose V2+
- Git

### Start All Services

```bash
# Start infrastructure + data services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# View specific service logs
docker-compose -f docker-compose.dev.yml logs -f collector-price
docker-compose -f docker-compose.dev.yml logs -f sentiment-service
```

### Stop Services

```bash
docker-compose -f docker-compose.dev.yml down

# Stop and remove volumes (clean slate)
docker-compose -f docker-compose.dev.yml down -v
```

### Service Endpoints

| Service | URL | Description |
|---------|-----|-------------|
| RabbitMQ Management | http://localhost:15672 | User: guest / Pass: guest |
| MongoDB | mongodb://localhost:27017 | User: admin / Pass: password |
| Redis | redis://localhost:6379 | No auth |
| Sentiment Service | http://localhost:8001 | Health: /health |

### Verify Services

```bash
# Check RabbitMQ
curl http://localhost:15672/api/overview -u guest:guest

# Check Sentiment Service
curl http://localhost:8001/health

# Check MongoDB
docker exec tradex-mongodb mongosh --eval "db.adminCommand('ping')"

# Check Redis
docker exec tradex-redis redis-cli ping
```

### View RabbitMQ Messages

1. Open http://localhost:15672
2. Login with guest/guest
3. Go to Exchanges → tradex.prices
4. You should see messages being published

### Rebuild After Changes

```bash
# Rebuild specific service
docker-compose -f docker-compose.dev.yml build collector-price
docker-compose -f docker-compose.dev.yml up -d collector-price

# Rebuild all
docker-compose -f docker-compose.dev.yml build
docker-compose -f docker-compose.dev.yml up -d
```

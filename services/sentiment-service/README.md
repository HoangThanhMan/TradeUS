# Sentiment Service

A FastAPI-based microservice for AI-powered market sentiment analysis in the Trade-X platform.

## Features

- 🚀 FastAPI with async support
- ⚙️ Environment-based configuration
- 🏥 Health check endpoints (Kubernetes-ready)
- 📝 Structured logging
- 🔧 Development mode with auto-reload
- 🐳 Docker support

## Project Structure

```
sentiment-service/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI application entry point
│   ├── config.py        # Configuration management
│   └── health.py        # Health check endpoints
├── tests/               # Test files (optional)
├── .env.example         # Example environment variables
├── Dockerfile           # Docker configuration
├── pyproject.toml       # Project metadata and dependencies (Poetry/pip)
├── requirements.txt     # pip dependencies
└── README.md
```

## Prerequisites

- Python 3.10+
- pip or Poetry

## Installation

### Using pip (Recommended for quick setup)

```bash
# Navigate to service directory
cd services/sentiment-service

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Using Poetry

```bash
# Navigate to service directory
cd services/sentiment-service

# Install dependencies
poetry install

# Activate shell
poetry shell
```

## Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Environment mode | `development` |
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8001` |
| `DEBUG` | Debug mode | `false` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |
| `RABBITMQ_URL` | RabbitMQ connection URL | `amqp://guest:guest@localhost:5672` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |

## Running Locally

### Development Mode (with auto-reload)

```bash
# Using uvicorn directly
uvicorn app.main:app --reload --port 8001

# Or using Python
python -m app.main
```

### Production Mode

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info |
| `/info` | GET | Detailed service info |
| `/health` | GET | Health check |
| `/ready` | GET | Readiness check (K8s) |
| `/live` | GET | Liveness check (K8s) |
| `/docs` | GET | Swagger UI documentation |
| `/redoc` | GET | ReDoc documentation |
| `/api/v1/sentiments/analyze` | POST | Analyze news sentiment |
| `/api/v1/sentiments/{id}` | GET | Get sentiment by ID |
| `/api/v1/sentiments/symbol/{symbol}` | GET | Get sentiments by symbol |
| `/api/v1/sentiments/` | GET | Get recent sentiments |
| `/api/v1/sentiments/symbol/{symbol}/average` | GET | Get average sentiment |
| `/api/v1/sentiments/batch` | POST | Batch analyze articles |
| `/api/v1/collect/reddit` | POST | Collect from Reddit |
| `/api/v1/collect/yahoo` | POST | Collect from Yahoo Finance |
| `/api/v1/collect/all` | POST | Collect from all sources |

## RabbitMQ Integration

The service integrates with RabbitMQ for async communication with other microservices.

### Exchanges & Queues

| Exchange | Type | Description |
|----------|------|-------------|
| `sentiment.exchange` | topic | Publishes sentiment results |
| `news.exchange` | topic | Receives news for analysis |
| `price.exchange` | topic | Receives price updates |

### Routing Keys

- `sentiment.result.{SYMBOL}` - Sentiment analysis results
- `sentiment.alert.{SYMBOL}.{type}` - Extreme sentiment alerts
- `sentiment.batch.complete` - Batch analysis notifications

### Message Flow

```
┌─────────────────┐    news.exchange     ┌──────────────────┐
│ News Collector  │ ──────────────────── │ Sentiment Service │
└─────────────────┘                      └────────┬─────────┘
                                                  │
                                    sentiment.exchange
                                                  │
                    ┌─────────────────────────────┼──────────────────┐
                    ▼                             ▼                  ▼
          ┌─────────────────┐        ┌──────────────────┐   ┌───────────────┐
          │ Trading Service │        │  Alert Service   │   │ API Gateway   │
          └─────────────────┘        └──────────────────┘   └───────────────┘
```

## Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=app tests/
```

## Docker

### Build Image

```bash
docker build -t sentiment-service .
```

### Run Container

```bash
docker run -p 8001:8001 --env-file .env sentiment-service
```

## Future Features (Week 2+)

- 📊 Enhanced sentiment analysis using transformer models
- 📰 More news source integrations
- 🐦 Social media sentiment tracking
- 📈 Real-time sentiment scoring
- 🔄 Advanced correlation analysis with price data

## Development

### Code Formatting

```bash
# Format with Black
black app/

# Lint with Ruff
ruff check app/

# Type checking with MyPy
mypy app/
```

## License

UNLICENSED - Trade-X Internal

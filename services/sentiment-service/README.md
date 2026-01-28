# Sentiment Service

A FastAPI-based microservice for AI-powered market sentiment analysis in the Trade-X platform.

## Prerequisites

- Python 3.10+
- pip or Poetry

## Installation

### Using pip

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

## Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

### Scheduler Configuration

The service includes an automatic news collection scheduler that runs every 5 minutes (configurable):

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_SCHEDULER` | `true` | Enable/disable automatic news collection |
| `COLLECTION_INTERVAL_SECONDS` | `300` | Collection interval in seconds (5 minutes) |
| `COLLECTION_LIMIT` | `10` | Number of items to collect per source |
| `COLLECTION_ANALYZE_IMMEDIATELY` | `true` | Analyze news immediately after collection |

The scheduler automatically:
- Collects news from Reddit and Yahoo Finance every 5 minutes
- Stores new articles in MongoDB with duplicate detection (based on `source_id`)
- Analyzes sentiment for new articles using Google Gemini AI
- Publishes results to RabbitMQ for other services

## Running Locally

### Development Mode

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
| `/sentiments/analyze` | POST | Analyze news sentiment |
| `/sentiments/{id}` | GET | Get sentiment by ID |
| `/sentiments/symbol/{symbol}` | GET | Get sentiments by symbol |
| `/sentiments/` | GET | Get recent sentiments |
| `/sentiments/symbol/{symbol}/average` | GET | Get average sentiment |
| `/sentiments/batch` | POST | Batch analyze articles |
| `/collect/reddit` | POST | Collect from Reddit |
| `/collect/yahoo` | POST | Collect from Yahoo Finance |
| `/collect/all` | POST | Collect from all sources |
| `/collect/pending` | GET | Get pending news for analysis |
| `/collect/analyze-pending` | POST | Analyze all pending news |
| `/collect/status` | GET | Get collection status |

---

## Chi tiết API

### 1. Health Check APIs

#### 1.1 Service Info
```
GET {{base_url}}/info
```

**Response:**
```json
{
  "service": "sentiment-service",
  "version": "0.1.0",
  "environment": "development",
  "features": {
    "sentiment_analysis": "active",
    "llm_provider": "gemini",
    "database": "mongodb",
    "reddit_collector": "mock",
    "yahoo_collector": "active"
  },
  "status": {
    "database": "healthy"
  }
}
```

#### 1.2 Health Check
```
GET {{base_url}}/health
```

---

### 2. Sentiment Analysis APIs

#### 2.1 Phân tích sentiment một bài viết

```
POST {{base_url}}/sentiments/analyze
Content-Type: application/json
```

**Body:**
```json
{
  "title": "Bitcoin Surges Past $100,000 as Institutional Investors Flood In",
  "content": "Bitcoin has reached a new all-time high of $102,000 today, driven by massive institutional buying. Major hedge funds and corporations are now allocating significant portions of their portfolios to cryptocurrency.",
  "link": "https://example.com/news/btc-surge",
  "published_date": "2026-01-15T10:00:00Z"
}
```

**Response (201 Created):**
```json
{
  "id": "696870e4a6bf01775baee4ee",
  "title": "Bitcoin Surges Past $100,000 as Institutional Investors Flood In",
  "published": "2026-01-15T10:00:00Z",
  "link": "https://example.com/news/btc-surge",
  "symbol": "BTCUSDT",
  "sentiment": 0.92,
  "emotion": "Excitement",
  "reason": "High enthusiasm around BTCUSDT developments and announcements.",
  "created_at": "2026-01-15T04:45:24.378598"
}
```

#### 2.2 Lấy danh sách sentiment gần đây

```
GET {{base_url}}/sentiments/?limit=10&skip=0
```

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 10 | Số lượng kết quả |
| `skip` | int | 0 | Số bản ghi bỏ qua (pagination) |

**Response:**
```json
{
  "value": [
    {
      "id": "696871569172db6bb87d46fd",
      "title": "Small-cap gains, silver's new record, bitcoin: Market Takeaways",
      "published": "2026-01-14T22:17:00",
      "link": "https://finance.yahoo.com/...",
      "symbol": "BTCUSDT",
      "sentiment": 0.33,
      "emotion": "Optimism",
      "reason": "Positive outlook for BTCUSDT based on favorable market conditions.",
      "created_at": "2026-01-15T04:47:18.588000"
    }
  ],
  "Count": 1
}
```

#### 2.3 Lấy sentiment theo symbol

```
GET {{base_url}}/sentiments/symbol/BTCUSDT?limit=5
```

#### 2.4 Lấy sentiment trung bình theo symbol

```
GET {{base_url}}/sentiments/symbol/BTCUSDT/average
```

**Response:**
```json
{
  "symbol": "BTCUSDT",
  "average_sentiment": 0.75,
  "count": 10,
  "period": "24h"
}
```

#### 2.5 Lấy sentiment theo ID

```
GET {{base_url}}/sentiments/696870e4a6bf01775baee4ee
```

#### 2.6 Phân tích batch nhiều bài viết

```
POST {{base_url}}/sentiments/batch
Content-Type: application/json
```

**Body:**
```json
{
  "articles": [
    {
      "title": "Ethereum hits new ATH",
      "content": "Ethereum price surges to $5000...",
      "link": "https://example.com/eth-ath",
      "published_date": "2026-01-15T08:00:00Z"
    },
    {
      "title": "Solana network outage concerns",
      "content": "Solana experienced downtime...",
      "link": "https://example.com/sol-outage",
      "published_date": "2026-01-15T09:00:00Z"
    }
  ]
}
```

---

### 3. Data Collection APIs

#### 3.1 Thu thập tin từ Yahoo Finance

```
POST {{base_url}}/collect/yahoo
Content-Type: application/json
```

**Body:**
```json
{
  "symbols": ["BTC-USD", "ETH-USD"],
  "limit": 5,
  "analyze_immediately": true
}
```

**Response:**
```json
{
  "source": "yahoo",
  "collected_count": 10,
  "new_count": 8,
  "analyzed_count": 8,
  "errors": [],
  "duration_seconds": 2.45
}
```

| Field | Description |
|-------|-------------|
| `symbols` | Mã chứng khoán Yahoo Finance (VD: BTC-USD, ETH-USD, AAPL) |
| `limit` | Số tin tối đa mỗi symbol |
| `analyze_immediately` | Phân tích sentiment ngay sau thu thập |

#### 3.2 Thu thập tin từ Reddit

```
POST {{base_url}}/collect/reddit
Content-Type: application/json
```

**Body:**
```json
{
  "subreddits": ["cryptocurrency", "bitcoin", "ethereum"],
  "time_filter": "day",
  "limit": 10,
  "analyze_immediately": true
}
```

**Response:**
```json
{
  "source": "reddit",
  "collected_count": 30,
  "new_count": 25,
  "analyzed_count": 25,
  "errors": [],
  "duration_seconds": 5.12
}
```

| Field | Description |
|-------|-------------|
| `subreddits` | Danh sách subreddit (default: cryptocurrency, bitcoin, ethereum) |
| `time_filter` | Bộ lọc thời gian: hour, day, week, month, year, all |
| `limit` | Số bài viết tối đa mỗi subreddit |

> **Lưu ý:** Cần cấu hình `REDDIT_CLIENT_ID` và `REDDIT_CLIENT_SECRET` trong `.env` để dùng Reddit thật. Nếu không có, service sẽ dùng mock data.

#### 3.3 Thu thập từ tất cả nguồn

```
POST {{base_url}}/collect/all
Content-Type: application/json
```

**Body:**
```json
{
  "yahoo_symbols": ["BTC-USD"],
  "reddit_subreddits": ["cryptocurrency"],
  "analyze_immediately": true
}
```

#### 3.4 Lấy tin chưa phân tích

```
GET {{base_url}}/collect/pending?limit=20
```

#### 3.5 Phân tích tất cả tin pending

```
POST {{base_url}}/collect/analyze-pending
```

#### 3.6 Xem trạng thái collection

```
GET {{base_url}}/collect/status
```
---

### 4. Sentiment Score Interpretation

| Score Range | Interpretation | Emotion Examples |
|-------------|----------------|------------------|
| 0.7 → 1.0 | Rất tích cực (Bullish) | Excitement, Euphoria |
| 0.3 → 0.7 | Tích cực | Optimism, Hope |
| -0.3 → 0.3 | Trung lập | Neutral, Uncertainty |
| -0.7 → -0.3 | Tiêu cực | Pessimism, Concern |
| -1.0 → -0.7 | Rất tiêu cực (Bearish) | Fear, Panic |

---

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

## Docker

```bash
# Run in root directory
docker-compose -f docker-compose.dev.yml up -d sentiment-service
```
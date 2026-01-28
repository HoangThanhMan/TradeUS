# Prediction Service

Real-time cryptocurrency price prediction service using LSTM models with price and sentiment data.

## Overview

The Prediction Service is part of the Trade-X microservices architecture. It:

1. **Subscribes** to real-time price data from `collector-price` via RabbitMQ
2. **Receives** sentiment analysis results from `sentiment-service` via RabbitMQ
3. **Predicts** future prices using a trained LSTM model
4. **Publishes** predictions back to RabbitMQ for real-time UI updates

## Architecture

```
┌─────────────────┐     RabbitMQ      ┌────────────────────┐
│ collector-price │ ───────────────▶  │ prediction-service │
└─────────────────┘   price.exchange  │                    │
                                      │  ┌──────────────┐  │
                                      │  │ LSTM Model   │  │
┌──────────────────┐   HTTP API       │  │              │  │
│ sentiment-service│ ◀─────────────── │  └──────────────┘  │
└──────────────────┘                  │         │          │
                                      │         ▼          │
                                      │  ┌──────────────┐  │
                                      │  │  Prediction  │  │
                                      │  └──────────────┘  │
                                      └────────┬───────────┘
                                               │
                                          HTTP API
                                               │
                                      ┌────────▼────────┐
                                      │   API Gateway   │
                                      └────────┬────────┘
                                               │
                                               ▼
                                          Frontend
```

## Data Flow

1. **Price Data**: `collector-price` → RabbitMQ → `prediction-service`
2. **Sentiment Data**: `prediction-service` → HTTP API → `sentiment-service`
3. **Predictions**: `API Gateway` → HTTP API → `prediction-service`
4. **Frontend**: `Frontend` → `API Gateway` → Prediction Results

## Features

- **Real-time Predictions**: Generates price predictions as new data arrives
- **Sentiment Integration**: Combines price data with sentiment analysis
- **Multiple Intervals**: Supports 1h, 4h, 1d time frames
- **Trading Signals**: Provides BUY/SELL/HOLD signals with confidence levels
- **Price Buffers**: Maintains sliding window of price data for predictions

## API Endpoints

### Health Checks
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness check (model + RabbitMQ)
- `GET /health/live` - Liveness check

### Predictions
- `GET /api/predictions/predict?symbol=BTCUSDT&interval=1h` - Get prediction
- `GET /api/predictions/buffer-status` - Check data buffer status
- `GET /api/predictions/model-info` - Get model information
- `GET /api/predictions/symbols` - List available symbols
- `POST /api/predictions/update-sentiment` - Manual sentiment update

## Setup

### Prerequisites

- Python 3.11+
- RabbitMQ server
- Trained model file (`.pt` checkpoint)

### Installation

```bash
# Navigate to service directory
cd services/prediction-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
.\venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
```

### Configuration

Copy `.env.example` to `.env` and configure:

```env
# Service
SERVICE_NAME=prediction-service
PORT=8002

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Model
MODEL_PATH=models/crypto_predictor_btcusdt.pt

# Sentiment Service
SENTIMENT_SERVICE_URL=http://localhost:8001
```

### Training the Model

Use the Jupyter notebook at `notebook/train_v2.ipynb` to train the model:

1. Prepare sentiment data (CSV with Date and Accurate Sentiments columns)
2. Run all cells in the notebook
3. Model will be saved to `services/prediction-service/models/`

### Running

```bash
# Development
uvicorn app.main:app --reload --port 8002

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8002 --workers 4
```

## Docker

```bash
# Build
docker build -t tradex/prediction-service .

# Run
docker run -p 8002:8002 --env-file .env tradex/prediction-service
```

## RabbitMQ Exchanges

### Subscribed (from collector-price)
- `price.exchange` (topic) - Price updates from collector
  - Routing key: `price.update.#`

### Published
- `prediction.exchange` (topic) - Prediction results (optional, for real-time broadcasting)
  - Routing key: `prediction.{symbol}.{interval}`
  - Routing key: `prediction.alert.{symbol}`

## HTTP APIs

### Consumed (from sentiment-service)
- `GET /api/sentiments/latest?symbol={symbol}` - Get latest sentiment

### Exposed (for API Gateway)
- `GET /api/predictions/predict?symbol={symbol}&interval={interval}` - Get prediction
- `GET /api/predictions/buffer-status` - Check data buffer status
- `GET /api/predictions/model-info` - Get model information

## Response Format

### Prediction Response

```json
{
  "symbol": "BTCUSDT",
  "interval": "1h",
  "current_price": 43250.50,
  "predicted_price": 43450.25,
  "price_change": 199.75,
  "price_change_percent": 0.46,
  "signal": "BUY",
  "signal_color": "lightgreen",
  "message": "Giá có xu hướng tăng nhẹ",
  "sentiment": 0.25,
  "timestamp": "2024-01-15T10:30:00Z",
  "model_info": {
    "window_size": 24,
    "buffer_size": 100
  }
}
```

## Development

```bash
# Run tests
pytest tests/

# Format code
black app/
ruff check app/

# Type checking
mypy app/
```

## Related Services

- [collector-price](../collector-price/README.md) - Price data collection
- [sentiment-service](../sentiment-service/README.md) - Sentiment analysis
- [ws-gateway](../../apps/ws-gateway/README.md) - WebSocket gateway

# Collector Price Service

A Node.js service that connects to Binance WebSocket to receive real-time cryptocurrency price data and publishes it to RabbitMQ for downstream consumers.

## Features

- 🔌 Real-time WebSocket connection to Binance
- 📊 Support for multiple trading pairs
- 🔄 Automatic reconnection with exponential backoff
- 📨 RabbitMQ message publishing with topic exchange
- 📝 Structured logging with Pino
- 🛡️ Graceful shutdown handling
- 🐳 Docker support

## Supported Stream Types

- `miniTicker` - 24hr mini ticker updates
- `kline_1m` - 1 minute candlestick
- `kline_5m` - 5 minute candlestick
- `kline_15m` - 15 minute candlestick
- `kline_1h` - 1 hour candlestick
- `kline_4h` - 4 hour candlestick
- `kline_1d` - 1 day candlestick

## Message Format

Messages published to RabbitMQ follow this structure:

```json
{
  "symbol": "BTCUSDT",
  "timestamp": 1703836800000,
  "open": 42150.50,
  "high": 42200.00,
  "low": 42100.00,
  "close": 42180.25,
  "volume": 1234.56,
  "quoteVolume": 52012345.67,
  "source": "binance",
  "streamType": "miniTicker"
}
```

## Prerequisites

- Node.js 18+
- RabbitMQ server running
- (Optional) Docker

## Installation

```bash
# From monorepo root
pnpm install

# Or from service directory
npm install
```

## Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging level | `info` |
| `BINANCE_WS_URL` | Binance WebSocket URL | `wss://stream.binance.com:9443/ws` |
| `BINANCE_SYMBOLS` | Comma-separated trading pairs | `btcusdt,ethusdt` |
| `BINANCE_STREAM_TYPE` | Stream type | `miniTicker` |
| `RABBITMQ_URL` | RabbitMQ connection URL | `amqp://guest:guest@localhost:5672` |
| `RABBITMQ_EXCHANGE` | Exchange name | `tradex.prices` |
| `RABBITMQ_EXCHANGE_TYPE` | Exchange type | `topic` |
| `RABBITMQ_ROUTING_KEY_PREFIX` | Routing key prefix | `price` |
| `RECONNECT_INTERVAL_MS` | Reconnection interval | `5000` |
| `MAX_RECONNECT_ATTEMPTS` | Max reconnection attempts | `10` |

## Running Locally

### Development Mode

```bash
npm run start:dev
```

### Production Mode

```bash
npm run build
npm start
```

## Docker

### Build Image

```bash
docker build -t collector-price .
```

### Run Container

```bash
docker run --env-file .env --network host collector-price
```

## RabbitMQ Routing

Messages are published to the `tradex.prices` exchange (topic type) with routing keys in the format:

```
price.<symbol>
```

Examples:
- `price.btcusdt`
- `price.ethusdt`
- `price.bnbusdt`

Consumers can subscribe using patterns:
- `price.*` - All prices
- `price.btcusdt` - Only BTC/USDT prices

## Architecture

```
┌─────────────────┐       ┌─────────────────────┐       ┌─────────────────┐
│  Binance API    │──────>│  Collector-Price    │──────>│    RabbitMQ     │
│   WebSocket     │       │     Service         │       │    Exchange     │
└─────────────────┘       └─────────────────────┘       └─────────────────┘
                                    │
                                    │ Logs
                                    ▼
                          ┌─────────────────────┐
                          │   Pino Logger       │
                          └─────────────────────┘
```

## Troubleshooting

### Connection Issues

1. Ensure RabbitMQ is running and accessible
2. Check firewall rules for outbound WebSocket connections
3. Verify Binance API is accessible from your region

### No Messages Being Published

1. Check if the symbols are valid Binance trading pairs
2. Verify RabbitMQ connection status in logs
3. Ensure exchange is properly declared

## License

UNLICENSED - Trade-X Internal

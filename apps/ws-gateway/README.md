# WebSocket Gateway

Trade-X WebSocket Gateway service that provides real-time price streaming to frontend clients.

## Architecture

This service is designed to run as multiple instances behind an Nginx load balancer with IP hash for sticky sessions. It subscribes to RabbitMQ for price data from the collector-price service and broadcasts to connected WebSocket clients.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  collector-     │────▶│    RabbitMQ      │────▶│  ws-gateway-1   │───┐
│  price          │     │  (tradex.prices) │     │  (port 3001)    │   │
└─────────────────┘     └──────────────────┘     └─────────────────┘   │
                                 │                                      │
                                 │              ┌─────────────────┐     │    ┌──────────┐
                                 └─────────────▶│  ws-gateway-2   │─────┼───▶│  Nginx   │───▶ Frontend
                                                │  (port 3001)    │     │    │ (IP Hash)│
                                                └─────────────────┘     │    └──────────┘
                                                                        │
```

## Features

- **WebSocket (Socket.IO)** - Real-time bidirectional communication
- **RabbitMQ Consumer** - Subscribes to price data from collector-price
- **Symbol Subscription** - Clients can subscribe to specific trading pairs
- **IP Hash Load Balancing** - Ensures sticky sessions via Nginx
- **Health Checks** - Kubernetes/Docker ready health endpoints
- **Horizontal Scaling** - Multiple instances for high availability

## Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe` | `{ symbols: string[] }` | Subscribe to specific symbols |
| `unsubscribe` | `{ symbols: string[] }` | Unsubscribe from symbols |
| `subscribeAll` | - | Subscribe to all price updates |
| `unsubscribeAll` | - | Unsubscribe from all updates |
| `ping` | - | Ping for latency check |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ clientId, instanceId, timestamp }` | Connection acknowledgment |
| `price` | `{ symbol, data, instanceId, timestamp }` | Real-time price update |
| `historical` | `{ symbol, data, instanceId, timestamp }` | Historical data |
| `stats` | `{ instanceId, connectedClients, timestamp }` | Server stats |

## Configuration

Environment variables:

```env
# Server
PORT=3001
INSTANCE_ID=ws-gateway-1

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=tradex.prices
RABBITMQ_QUEUE_PREFIX=ws-gateway
RABBITMQ_ROUTING_PATTERNS=price.#

# CORS
CORS_ORIGINS=http://localhost:3000
```

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run start:dev

# Build
npm run build

# Run in production
npm run start:prod
```

## Docker

```bash
# Build image
docker build -t tradex-ws-gateway .

# Run container
docker run -p 3001:3001 \
  -e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
  -e INSTANCE_ID=ws-gateway-1 \
  tradex-ws-gateway
```

## Client Usage

```typescript
import { io } from 'socket.io-client';

// Connect to WebSocket Gateway via Nginx
const socket = io('http://localhost/prices', {
  transports: ['websocket'],
});

socket.on('connected', (data) => {
  console.log('Connected to:', data.instanceId);
  
  // Subscribe to symbols
  socket.emit('subscribe', { symbols: ['BTCUSDT', 'ETHUSDT'] });
});

socket.on('price', (data) => {
  console.log('Price update:', data.symbol, data.data.close);
});

// Cleanup
socket.disconnect();
```

## Health Endpoints

- `GET /health` - Overall health status
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

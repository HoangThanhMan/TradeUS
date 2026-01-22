# @tradex/amqp-client

Shared RabbitMQ/AMQP client library for Trade-X microservices.

## Features

- **AmqpConnection**: Base connection manager with auto-reconnect
- **AmqpPublisher**: Generic publisher for sending messages to exchanges
- **AmqpConsumer**: Generic consumer for receiving messages from queues
- **Type-safe**: Full TypeScript support with generics

## Installation

```bash
npm install @tradex/amqp-client
```

## Usage

### Publisher

```typescript
import { AmqpPublisher, AmqpConfig } from '@tradex/amqp-client';

const config: AmqpConfig = {
  url: 'amqp://guest:guest@localhost:5672',
  exchange: 'my-exchange',
  exchangeType: 'topic',
  reconnect: {
    maxAttempts: 10,
    intervalMs: 5000,
  },
};

const publisher = new AmqpPublisher(config);
await publisher.connect();

await publisher.publish('routing.key', { data: 'hello' });
```

### Consumer

```typescript
import { AmqpConsumer, AmqpConfig } from '@tradex/amqp-client';

const config: AmqpConfig = {
  url: 'amqp://guest:guest@localhost:5672',
  exchange: 'my-exchange',
  exchangeType: 'topic',
  reconnect: {
    maxAttempts: 10,
    intervalMs: 5000,
  },
};

const consumer = new AmqpConsumer(config);
await consumer.connect();

await consumer.subscribe(
  'my-queue',
  ['routing.key.#'],
  async (message, routingKey) => {
    console.log('Received:', message, routingKey);
  }
);
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | RabbitMQ connection URL |
| `exchange` | `string` | Exchange name |
| `exchangeType` | `'topic' \| 'direct' \| 'fanout' \| 'headers'` | Exchange type |
| `reconnect.maxAttempts` | `number` | Max reconnection attempts |
| `reconnect.intervalMs` | `number` | Reconnection interval in ms |

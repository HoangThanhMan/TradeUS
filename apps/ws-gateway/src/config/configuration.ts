export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  instanceId: process.env.INSTANCE_ID || 'ws-gateway-1',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'tradex.prices',
    exchangeType: process.env.RABBITMQ_EXCHANGE_TYPE || 'topic',
    queuePrefix: process.env.RABBITMQ_QUEUE_PREFIX || 'ws-gateway',
    // Remove quotes if present in env value and split by comma
    routingPatterns: (process.env.RABBITMQ_ROUTING_PATTERNS || 'price.#')
      .replace(/^["']|["']$/g, '')
      .split(','),
  },
  
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  },
  
  reconnect: {
    maxAttempts: parseInt(process.env.RECONNECT_MAX_ATTEMPTS || '10', 10),
    intervalMs: parseInt(process.env.RECONNECT_INTERVAL_MS || '5000', 10),
  },
});

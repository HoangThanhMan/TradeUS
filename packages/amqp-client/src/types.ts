/**
 * AMQP Client Configuration
 */
export interface AmqpConfig {
  // RabbitMQ connection URL
  url: string;
  // Exchange name
  exchange: string;
  // Exchange type
  exchangeType: 'topic' | 'direct' | 'fanout' | 'headers';
  // Reconnection settings
  reconnect: {
    // Maximum number of reconnection attempts
    maxAttempts: number;
    /// Interval between reconnection attempts in milliseconds
    intervalMs: number;
  };
}

/**
 * Logger interface - allows integration with any logging library
 */
export interface AmqpLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
}

/**
 * Default console logger implementation
 */
export const defaultLogger: AmqpLogger = {
  info: (obj, msg) => console.log('[AMQP INFO]', msg, obj),
  warn: (obj, msg) => console.warn('[AMQP WARN]', msg, obj),
  error: (obj, msg) => console.error('[AMQP ERROR]', msg, obj),
  debug: (obj, msg) => console.debug('[AMQP DEBUG]', msg, obj),
};

/**
 * Publish options for messages
 */
export interface PublishOptions {
  // Whether message should survive broker restart
  persistent?: boolean;
  // Content type header
  contentType?: string;
  // Message priority (0-9)
  priority?: number;
  // Message expiration in ms
  expiration?: string;
  // Correlation ID for RPC patterns
  correlationId?: string;
  // Reply-to queue for RPC patterns
  replyTo?: string;
  // Custom headers
  headers?: Record<string, unknown>;
}

/**
 * Consumer options
 */
export interface ConsumeOptions {
  // Queue durability
  durable?: boolean;
  // Auto-delete queue when unused
  autoDelete?: boolean;
  // Exclusive queue
  exclusive?: boolean;
  // Prefetch count
  prefetch?: number;
  // No acknowledgement mode
  noAck?: boolean;
}

/**
 * Message handler callback type
 */
export type MessageHandler<T = unknown> = (
  message: T,
  routingKey: string,
  rawMessage: unknown
) => Promise<void> | void;

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

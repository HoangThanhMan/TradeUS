import { ConsumeMessage } from 'amqplib';
import { AmqpConnection } from './connection';
import { AmqpConfig, AmqpLogger, ConsumeOptions, MessageHandler } from './types';

interface Subscription {
  queue: string;
  patterns: string[];
  handler: MessageHandler;
  consumerTag?: string;
}

/**
 * AMQP Consumer
 * Handles consuming messages from RabbitMQ queues
 */
export class AmqpConsumer extends AmqpConnection {
  private subscriptions: Map<string, Subscription> = new Map();

  constructor(config: AmqpConfig, logger?: AmqpLogger) {
    super(config, logger);
  }

  /**
   * Subscribe to messages matching routing patterns
   * @param queue - Queue name
   * @param patterns - Array of routing key patterns (supports wildcards)
   * @param handler - Message handler callback
   * @param options - Consumer options
   */
  async subscribe<T = unknown>(
    queue: string,
    patterns: string[],
    handler: MessageHandler<T>,
    options: ConsumeOptions = {}
  ): Promise<string> {
    if (!this.channel) {
      throw new Error('Cannot subscribe - not connected');
    }

    const {
      durable = true,
      autoDelete = false,
      exclusive = false,
      prefetch = 10,
      noAck = false,
    } = options;

    // Set prefetch
    await this.channel.prefetch(prefetch);

    // Assert queue
    await this.channel.assertQueue(queue, {
      durable,
      autoDelete,
      exclusive,
    });

    // Bind queue to exchange with patterns
    for (const pattern of patterns) {
      await this.channel.bindQueue(queue, this.config.exchange, pattern);
      this.logger.info(
        { queue, pattern, exchange: this.config.exchange },
        'Queue bound to exchange'
      );
    }

    // Start consuming
    const { consumerTag } = await this.channel.consume(
      queue,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const content = msg.content.toString();
          const message = JSON.parse(content) as T;
          const routingKey = msg.fields.routingKey;

          await handler(message, routingKey, msg);

          if (!noAck && this.channel) {
            this.channel.ack(msg);
          }
        } catch (error) {
          this.logger.error({ error, queue }, 'Error processing message');
          
          if (!noAck && this.channel) {
            // Reject and don't requeue (send to DLQ if configured)
            this.channel.nack(msg, false, false);
          }
        }
      },
      { noAck }
    );

    // Store subscription for reconnection
    this.subscriptions.set(queue, {
      queue,
      patterns,
      handler: handler as MessageHandler,
      consumerTag,
    });

    this.logger.info(
      { queue, patterns, consumerTag },
      'Subscribed to queue'
    );

    return consumerTag;
  }

  /**
   * Unsubscribe from a queue
   * @param queue - Queue name to unsubscribe from
   */
  async unsubscribe(queue: string): Promise<void> {
    const subscription = this.subscriptions.get(queue);
    
    if (!subscription) {
      this.logger.warn({ queue }, 'No subscription found for queue');
      return;
    }

    if (this.channel && subscription.consumerTag) {
      await this.channel.cancel(subscription.consumerTag);
    }

    this.subscriptions.delete(queue);
    this.logger.info({ queue }, 'Unsubscribed from queue');
  }

  /**
   * Restore subscriptions after reconnection
   */
  protected override async onReconnect(): Promise<void> {
    this.logger.info(
      { count: this.subscriptions.size },
      'Restoring subscriptions after reconnect'
    );

    for (const [queue, subscription] of this.subscriptions) {
      try {
        // Re-subscribe with same parameters
        const newTag = await this.subscribe(
          queue,
          subscription.patterns,
          subscription.handler
        );
        subscription.consumerTag = newTag;
        
        this.logger.info({ queue }, 'Subscription restored');
      } catch (error) {
        this.logger.error({ error, queue }, 'Failed to restore subscription');
      }
    }
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Check if subscribed to a queue
   */
  isSubscribed(queue: string): boolean {
    return this.subscriptions.has(queue);
  }

  /**
   * Close connection and clear subscriptions
   */
  override async close(): Promise<void> {
    this.subscriptions.clear();
    await super.close();
  }
}

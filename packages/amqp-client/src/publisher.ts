import { AmqpConnection } from './connection';
import { AmqpConfig, AmqpLogger, PublishOptions } from './types';

/**
 * AMQP Publisher
 * Handles publishing messages to RabbitMQ exchanges
 */
export class AmqpPublisher extends AmqpConnection {
  constructor(config: AmqpConfig, logger?: AmqpLogger) {
    super(config, logger);
  }

  /**
   * Publish a message to the exchange
   * @param routingKey - Routing key for the message
   * @param message - Message payload (will be JSON stringified)
   * @param options - Optional publish options
   * @returns true if published successfully, false otherwise
   */
  async publish<T>(
    routingKey: string,
    message: T,
    options: PublishOptions = {}
  ): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn({ routingKey }, 'Cannot publish - channel not available');
      return false;
    }

    try {
      const content = Buffer.from(JSON.stringify(message));

      const publishOptions = {
        persistent: options.persistent ?? true,
        contentType: options.contentType ?? 'application/json',
        timestamp: Date.now(),
        priority: options.priority,
        expiration: options.expiration,
        correlationId: options.correlationId,
        replyTo: options.replyTo,
        headers: options.headers,
      };

      const result = this.channel.publish(
        this.config.exchange,
        routingKey,
        content,
        publishOptions
      );

      if (result) {
        this.logger.debug({ routingKey, exchange: this.config.exchange }, 'Message published');
      } else {
        this.logger.warn({ routingKey }, 'Message was not confirmed');
      }

      return result;
    } catch (error) {
      this.logger.error({ error, routingKey }, 'Failed to publish message');
      return false;
    }
  }

  /**
   * Publish multiple messages in batch
   * @param messages - Array of { routingKey, message, options }
   * @returns Number of successfully published messages
   */
  async publishBatch<T>(
    messages: Array<{ routingKey: string; message: T; options?: PublishOptions }>
  ): Promise<number> {
    let successCount = 0;

    for (const { routingKey, message, options } of messages) {
      const success = await this.publish(routingKey, message, options);
      if (success) successCount++;
    }

    this.logger.info(
      { total: messages.length, success: successCount },
      'Batch publish completed'
    );

    return successCount;
  }

  /**
   * Publish raw buffer content
   * @param routingKey - Routing key for the message
   * @param content - Raw buffer content
   * @param options - Optional publish options
   */
  async publishRaw(
    routingKey: string,
    content: Buffer,
    options: PublishOptions = {}
  ): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn({ routingKey }, 'Cannot publish - channel not available');
      return false;
    }

    try {
      const result = this.channel.publish(
        this.config.exchange,
        routingKey,
        content,
        {
          persistent: options.persistent ?? true,
          contentType: options.contentType ?? 'application/octet-stream',
          timestamp: Date.now(),
          ...options,
        }
      );

      return result;
    } catch (error) {
      this.logger.error({ error, routingKey }, 'Failed to publish raw message');
      return false;
    }
  }
}

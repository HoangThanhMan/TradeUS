import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConsumer, AmqpConfig, AmqpLogger } from '@tradex/amqp-client';
import {
  SentimentMessage,
  SentimentResultMessage,
  SentimentAlertMessage,
  BatchCompleteMessage,
  SentimentEventType,
} from '@tradex/shared-types';

export interface SentimentEvent {
  type: 'result' | 'alert' | 'batch_complete';
  routingKey: string;
  data: SentimentMessage;
  receivedAt: number;
}

@Injectable()
export class SentimentConsumerService implements OnModuleInit {
  private readonly logger = new Logger(SentimentConsumerService.name);
  private sentimentHandlers: Set<(event: SentimentEvent) => void> = new Set();
  private consumer: AmqpConsumer;
  private readonly config: AmqpConfig;
  private readonly instanceId: string;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.instanceId = this.configService.get<string>('instanceId', 'ws-gateway-1');

    this.config = {
      url: this.configService.get<string>('rabbitmq.url', 'amqp://localhost'),
      exchange: this.configService.get<string>(
        'sentiment.exchange',
        'sentiment.exchange',
      ),
      exchangeType: 'topic',
      reconnect: {
        maxAttempts: this.configService.get<number>('reconnect.maxAttempts', 10),
        intervalMs: this.configService.get<number>('reconnect.intervalMs', 5000),
      },
    };

    const amqpLogger: AmqpLogger = {
      info: (obj, msg) => this.logger.log({ ...obj, message: msg }),
      warn: (obj, msg) => this.logger.warn({ ...obj, message: msg }),
      error: (obj, msg) => this.logger.error({ ...obj, message: msg }),
      debug: (obj, msg) => this.logger.debug({ ...obj, message: msg }),
    };

    this.consumer = new AmqpConsumer(this.config, amqpLogger);
  }

  async onModuleInit() {
    await this.connect();
    await this.startConsuming();
  }

  private async connect(): Promise<void> {
    try {
      await this.consumer.connect();
      this.isConnected = true;
      this.logger.log(
        `[${this.instanceId}] Sentiment consumer connected to RabbitMQ`,
      );
    } catch (error) {
      this.logger.error(
        `[${this.instanceId}] Failed to connect sentiment consumer to RabbitMQ`,
        error,
      );
      throw error;
    }
  }

  private async startConsuming() {
    const queueName = this.getQueueName();
    const patterns = this.getRoutingPatterns();

    try {
      await this.consumer.subscribe<SentimentMessage>(
        queueName,
        patterns,
        async (message, routingKey) => {
          const event: SentimentEvent = {
            type: this.getEventType(message),
            routingKey,
            data: message,
            receivedAt: Date.now(),
          };

          this.logger.log(
            `[${this.instanceId}] Received sentiment data: ${routingKey} - type: ${event.type} - handlers: ${this.sentimentHandlers.size}`,
          );

          // Notify all registered handlers
          this.sentimentHandlers.forEach((handler) => {
            try {
              handler(event);
            } catch (error) {
              this.logger.error('Error in sentiment handler', error);
            }
          });
        },
        {
          durable: false,
          autoDelete: true,
          exclusive: false,
          prefetch: 100,
          noAck: true,
        },
      );

      this.logger.log(
        `[${this.instanceId}] Started consuming sentiment from queue: ${queueName} with patterns: ${patterns.join(', ')}`,
      );
    } catch (error) {
      this.logger.error(
        `[${this.instanceId}] Failed to start consuming sentiment`,
        error,
      );
      throw error;
    }
  }

  private getEventType(
    message: SentimentMessage,
  ): 'result' | 'alert' | 'batch_complete' {
    switch (message.event) {
      case SentimentEventType.SENTIMENT_ANALYZED:
        return 'result';
      case SentimentEventType.SENTIMENT_ALERT:
        return 'alert';
      case SentimentEventType.SENTIMENT_BATCH_COMPLETE:
        return 'batch_complete';
      default:
        return 'result';
    }
  }

  private getQueueName(): string {
    const prefix = this.configService.get<string>(
      'sentiment.queuePrefix',
      'ws-gateway.sentiment',
    );
    return `${prefix}.${this.instanceId}`;
  }

  private getRoutingPatterns(): string[] {
    return this.configService.get<string[]>('sentiment.routingPatterns', [
      'sentiment.result.#',
      'sentiment.alert.#',
      'sentiment.batch.#',
    ]);
  }

  /**
   * Register a handler for sentiment events
   */
  onSentiment(handler: (event: SentimentEvent) => void): () => void {
    this.sentimentHandlers.add(handler);
    return () => this.sentimentHandlers.delete(handler);
  }

  /**
   * Get number of registered handlers
   */
  getHandlerCount(): number {
    return this.sentimentHandlers.size;
  }

  /**
   * Check if connected to RabbitMQ
   */
  isReady(): boolean {
    return this.isConnected;
  }

  async onModuleDestroy() {
    await this.consumer.close();
    this.logger.log(`[${this.instanceId}] Sentiment consumer disconnected`);
  }
}

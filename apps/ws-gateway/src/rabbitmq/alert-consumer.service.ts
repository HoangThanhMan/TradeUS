import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConsumer, AmqpConfig, AmqpLogger } from '@tradex/amqp-client';

export interface AlertNotificationData {
  type: 'sentiment_alert' | 'email_status';
  symbol?: string;
  sentiment?: number;
  sentiment_label?: string;
  title?: string;
  reason?: string;
  notified_count?: number;
  to?: string;
  subject?: string;
  status?: string; // "sent" | "failed"
}

export interface AlertEvent {
  event: string;
  routingKey: string;
  data: AlertNotificationData;
  timestamp: string;
  source: string;
  receivedAt: number;
}

@Injectable()
export class AlertConsumerService implements OnModuleInit {
  private readonly logger = new Logger(AlertConsumerService.name);
  private alertHandlers: Set<(event: AlertEvent) => void> = new Set();
  private consumer: AmqpConsumer;
  private readonly config: AmqpConfig;
  private readonly instanceId: string;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.instanceId = this.configService.get<string>('instanceId', 'ws-gateway-1');

    this.config = {
      url: this.configService.get<string>('rabbitmq.url', 'amqp://localhost'),
      exchange: this.configService.get<string>(
        'alert.exchange',
        'alert.exchange',
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
        `[${this.instanceId}] Alert consumer connected to RabbitMQ`,
      );
    } catch (error) {
      this.logger.error(
        `[${this.instanceId}] Failed to connect alert consumer to RabbitMQ`,
        error,
      );
      throw error;
    }
  }

  private async startConsuming() {
    const queueName = this.getQueueName();
    const patterns = this.getRoutingPatterns();

    try {
      await this.consumer.subscribe<any>(
        queueName,
        patterns,
        async (message, routingKey) => {
          const event: AlertEvent = {
            event: message.event || 'unknown',
            routingKey,
            data: message.data || message,
            timestamp: message.timestamp || new Date().toISOString(),
            source: message.source || 'unknown',
            receivedAt: Date.now(),
          };

          this.logger.log(
            `[${this.instanceId}] Received alert event: ${routingKey} - type: ${event.data.type} - handlers: ${this.alertHandlers.size}`,
          );

          // Notify all registered handlers
          this.alertHandlers.forEach((handler) => {
            try {
              handler(event);
            } catch (error) {
              this.logger.error('Error in alert handler', error);
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
        `[${this.instanceId}] Started consuming alerts from queue: ${queueName} with patterns: ${patterns.join(', ')}`,
      );
    } catch (error) {
      this.logger.error(
        `[${this.instanceId}] Failed to start consuming alerts`,
        error,
      );
      throw error;
    }
  }

  private getQueueName(): string {
    const prefix = this.configService.get<string>(
      'alert.queuePrefix',
      'ws-gateway.alert',
    );
    return `${prefix}.${this.instanceId}`;
  }

  private getRoutingPatterns(): string[] {
    return this.configService.get<string[]>('alert.routingPatterns', [
      'alert.notification.#',
      'alert.email.#',
    ]);
  }

  /**
   * Register a handler for alert events
   */
  onAlert(handler: (event: AlertEvent) => void): () => void {
    this.alertHandlers.add(handler);
    return () => this.alertHandlers.delete(handler);
  }

  getHandlerCount(): number {
    return this.alertHandlers.size;
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async onModuleDestroy() {
    await this.consumer.close();
    this.logger.log(`[${this.instanceId}] Alert consumer disconnected`);
  }
}

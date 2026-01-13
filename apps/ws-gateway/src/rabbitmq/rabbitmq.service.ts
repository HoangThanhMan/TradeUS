import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConsumer, AmqpConfig, AmqpLogger } from '@tradex/amqp-client';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private consumer: AmqpConsumer;
  private readonly config: AmqpConfig;
  private readonly instanceId: string;
  private connectionPromise: Promise<void> | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.instanceId = this.configService.get<string>('instanceId', 'ws-gateway-1');
    
    this.config = {
      url: this.configService.get<string>('rabbitmq.url', 'amqp://localhost'),
      exchange: this.configService.get<string>('rabbitmq.exchange', 'tradex.prices'),
      exchangeType: this.configService.get<string>('rabbitmq.exchangeType', 'topic') as 'topic',
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
    this.connectionPromise = this.connectWithRetry();
    await this.connectionPromise;
  }

  private async connectWithRetry(): Promise<void> {
    try {
      await this.consumer.connect();
      this.isConnected = true;
      this.logger.log(`[${this.instanceId}] Connected to RabbitMQ`);
    } catch (error) {
      this.logger.error(`[${this.instanceId}] Failed to connect to RabbitMQ`, error);
      throw error;
    }
  }

  /**
   * Wait for the RabbitMQ connection to be established
   * Other services should call this before using the consumer
   */
  async waitForConnection(): Promise<void> {
    if (this.isConnected) return;
    if (this.connectionPromise) {
      await this.connectionPromise;
    }
  }

  async onModuleDestroy() {
    await this.consumer.close();
    this.logger.log(`[${this.instanceId}] Disconnected from RabbitMQ`);
  }

  getConsumer(): AmqpConsumer {
    return this.consumer;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  getQueueName(): string {
    const prefix = this.configService.get<string>('rabbitmq.queuePrefix', 'ws-gateway');
    return `${prefix}.${this.instanceId}`;
  }

  getRoutingPatterns(): string[] {
    return this.configService.get<string[]>('rabbitmq.routingPatterns', ['price.#']);
  }
}

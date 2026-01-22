import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';
import { PriceMessage, HistoricalDataMessage } from '@tradex/shared-types';

export type PriceData = PriceMessage | HistoricalDataMessage;

export interface PriceEvent {
  type: 'realtime' | 'historical';
  routingKey: string;
  data: PriceData;
  receivedAt: number;
}

@Injectable()
export class PriceConsumerService implements OnModuleInit {
  private readonly logger = new Logger(PriceConsumerService.name);
  private priceHandlers: Set<(event: PriceEvent) => void> = new Set();

  constructor(private readonly rabbitMQService: RabbitMQService) {}

  async onModuleInit() {
    // Wait for RabbitMQ connection before starting to consume
    await this.rabbitMQService.waitForConnection();
    await this.startConsuming();
  }

  private async startConsuming() {
    const consumer = this.rabbitMQService.getConsumer();
    const queueName = this.rabbitMQService.getQueueName();
    const patterns = this.rabbitMQService.getRoutingPatterns();
    const instanceId = this.rabbitMQService.getInstanceId();

    try {
      await consumer.subscribe<PriceData>(
        queueName,
        patterns,
        async (message, routingKey) => {
          const event: PriceEvent = {
            type: this.isHistoricalData(message) ? 'historical' : 'realtime',
            routingKey,
            data: message,
            receivedAt: Date.now(),
          };

          this.logger.log(
            `[${instanceId}] Received ${event.type} price data: ${routingKey} - handlers: ${this.priceHandlers.size}`,
          );

          // Notify all registered handlers
          this.priceHandlers.forEach((handler) => {
            try {
              handler(event);
            } catch (error) {
              this.logger.error('Error in price handler', error);
            }
          });
        },
        {
          durable: false, // Non-durable queue for real-time data
          autoDelete: true, // Delete queue when consumer disconnects
          exclusive: false,
          prefetch: 100,
          noAck: true, // Auto-ack for performance
        },
      );

      this.logger.log(
        `[${instanceId}] Started consuming from queue: ${queueName} with patterns: ${patterns.join(', ')}`,
      );
    } catch (error) {
      this.logger.error(`[${instanceId}] Failed to start consuming`, error);
      throw error;
    }
  }

  private isHistoricalData(message: PriceData): message is HistoricalDataMessage {
    return 'dataType' in message && message.dataType === 'historical';
  }

  /**
   * Register a handler for price events
   */
  onPrice(handler: (event: PriceEvent) => void): () => void {
    this.priceHandlers.add(handler);
    return () => this.priceHandlers.delete(handler);
  }

  /**
   * Get number of registered handlers
   */
  getHandlerCount(): number {
    return this.priceHandlers.size;
  }
}

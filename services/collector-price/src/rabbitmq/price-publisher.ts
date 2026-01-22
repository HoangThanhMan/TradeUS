import { AmqpPublisher, AmqpConfig, AmqpLogger } from '@tradex/amqp-client';
import { PriceMessage, CandlestickData, HistoricalDataMessage } from '@tradex/shared-types';
import config from '../config';
import logger from '../logger';

/**
 * Logger adapter to use the existing logger with AmqpLogger interface
 */
const amqpLogger: AmqpLogger = {
  info: (obj, msg) => logger.info(obj, msg),
  warn: (obj, msg) => logger.warn(obj, msg),
  error: (obj, msg) => logger.error(obj, msg),
  debug: (obj, msg) => logger.debug(obj, msg),
};

/**
 * PricePublisher handles publishing price messages to RabbitMQ
 */
export class PricePublisher {
  private publisher: AmqpPublisher;
  private routingKeyPrefix: string;

  constructor() {
    const amqpConfig: AmqpConfig = {
      url: config.rabbitmq.url,
      exchange: config.rabbitmq.exchange,
      exchangeType: config.rabbitmq.exchangeType as 'topic' | 'direct' | 'fanout' | 'headers',
      reconnect: {
        maxAttempts: config.reconnect.maxAttempts,
        intervalMs: config.reconnect.intervalMs,
      },
    };

    this.publisher = new AmqpPublisher(amqpConfig, amqpLogger);
    this.routingKeyPrefix = config.rabbitmq.routingKeyPrefix;
  }

  /**
   * Connect to RabbitMQ
   */
  async connect(): Promise<void> {
    await this.publisher.connect();
  }

  /** Publish a price message
   * @param message - PriceMessage to publish
   * @returns true if published successfully, false otherwise
   */
  async publish(message: PriceMessage): Promise<boolean> {
    const routingKey = `${this.routingKeyPrefix}.${message.symbol.toLowerCase()}`;
    return this.publisher.publish(routingKey, message);
  }

  /** Publish historical candlestick data
   * @param symbol - Trading symbol
   * @param interval - Candlestick interval
   * @param data - Array of candlestick data
   * @returns true if published successfully, false otherwise
   */
  async publishHistoricalData(
    symbol: string,
    interval: string,
    data: CandlestickData[]
  ): Promise<boolean> {
    const routingKey = `${this.routingKeyPrefix}.historical.${symbol.toLowerCase()}`;
    
    const message: HistoricalDataMessage = {
      symbol: symbol.toUpperCase(),
      interval,
      source: 'binance-futures',
      dataType: 'historical',
      count: data.length,
      data,
      fetchedAt: Date.now(),
    };

    const result = await this.publisher.publish(routingKey, message);
    
    if (result) {
      logger.info(
        { symbol, interval, count: data.length, routingKey },
        'Historical data published'
      );
    }

    return result;
  }

  /**
   * Close the publisher connection
   */
  async close(): Promise<void> {
    await this.publisher.close();
  }

  /** Check if the publisher is connected
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return this.publisher.isConnected();
  }
}

// Export singleton instance for backward compatibility
export const pricePublisher = new PricePublisher();

// Also export the class as default
export default PricePublisher;

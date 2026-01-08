import amqp from 'amqplib';
import config from '../config';
import logger from '../logger';
import { PriceMessage, CandlestickData } from '../types';

// Message type for historical data batch
export interface HistoricalDataMessage {
  symbol: string;
  interval: string;
  source: string;
  dataType: 'historical';
  count: number;
  data: CandlestickData[];
  fetchedAt: number;
}

export class RabbitMQPublisher {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;

  async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      logger.info({ url: config.rabbitmq.url.replace(/:[^:@]+@/, ':***@') }, 'Connecting to RabbitMQ...');
      
      this.connection = await amqp.connect(config.rabbitmq.url);
      this.channel = await this.connection.createChannel();

      // Declare exchange
      await this.channel.assertExchange(
        config.rabbitmq.exchange,
        config.rabbitmq.exchangeType,
        { durable: true }
      );

      this.reconnectAttempts = 0;
      logger.info({ exchange: config.rabbitmq.exchange }, 'RabbitMQ connected and exchange declared');

      // Handle connection errors
      this.connection.on('error', (err) => {
        logger.error({ err }, 'RabbitMQ connection error');
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.handleDisconnect();
      });

    } catch (error) {
      logger.error({ error }, 'Failed to connect to RabbitMQ');
      this.handleDisconnect();
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private async handleDisconnect(): Promise<void> {
    this.channel = null;
    this.connection = null;

    if (this.reconnectAttempts < config.reconnect.maxAttempts) {
      this.reconnectAttempts++;
      logger.info(
        { attempt: this.reconnectAttempts, maxAttempts: config.reconnect.maxAttempts },
        'Attempting to reconnect to RabbitMQ...'
      );
      
      setTimeout(() => {
        this.connect().catch((err) => {
          logger.error({ err }, 'Reconnection attempt failed');
        });
      }, config.reconnect.intervalMs);
    } else {
      logger.error('Max reconnection attempts reached for RabbitMQ');
    }
  }

  async publish(message: PriceMessage): Promise<boolean> {
    if (!this.channel) {
      logger.warn('Cannot publish - RabbitMQ channel not available');
      return false;
    }

    try {
      const routingKey = `${config.rabbitmq.routingKeyPrefix}.${message.symbol.toLowerCase()}`;
      const content = Buffer.from(JSON.stringify(message));

      const result = this.channel.publish(
        config.rabbitmq.exchange,
        routingKey,
        content,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
        }
      );

      if (result) {
        logger.debug({ symbol: message.symbol, routingKey }, 'Message published');
      }

      return result;
    } catch (error) {
      logger.error({ error, symbol: message.symbol }, 'Failed to publish message');
      return false;
    }
  }

  async publishHistoricalData(
    symbol: string,
    interval: string,
    data: CandlestickData[]
  ): Promise<boolean> {
    if (!this.channel) {
      logger.warn('Cannot publish historical data - RabbitMQ channel not available');
      return false;
    }

    try {
      const routingKey = `${config.rabbitmq.routingKeyPrefix}.historical.${symbol.toLowerCase()}`;
      
      const message: HistoricalDataMessage = {
        symbol: symbol.toUpperCase(),
        interval,
        source: 'binance-futures',
        dataType: 'historical',
        count: data.length,
        data,
        fetchedAt: Date.now(),
      };

      const content = Buffer.from(JSON.stringify(message));

      const result = this.channel.publish(
        config.rabbitmq.exchange,
        routingKey,
        content,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
        }
      );

      if (result) {
        logger.info(
          { symbol, interval, count: data.length, routingKey },
          'Historical data published'
        );
      }

      return result;
    } catch (error) {
      logger.error({ error, symbol }, 'Failed to publish historical data');
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      logger.info('RabbitMQ connection closed gracefully');
    } catch (error) {
      logger.error({ error }, 'Error closing RabbitMQ connection');
    }
  }

  isConnected(): boolean {
    return this.channel !== null && this.connection !== null;
  }
}

export default RabbitMQPublisher;

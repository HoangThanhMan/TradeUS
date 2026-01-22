import amqp, { Channel, ChannelModel } from 'amqplib';
import { AmqpConfig, AmqpLogger, ConnectionState, defaultLogger } from './types';

/**
 * Base AMQP Connection Manager
 * Handles connection lifecycle, reconnection, and channel management
 */
export class AmqpConnection {
  protected connection: ChannelModel | null = null;
  protected channel: Channel | null = null;
  protected state: ConnectionState = 'disconnected';
  protected reconnectAttempts = 0;
  protected readonly config: AmqpConfig;
  protected readonly logger: AmqpLogger;

  constructor(config: AmqpConfig, logger?: AmqpLogger) {
    this.config = config;
    this.logger = logger || defaultLogger;
  }

  /**
   * Connect to RabbitMQ and set up the exchange
   */
  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') {
      return;
    }

    this.state = 'connecting';

    try {
      const maskedUrl = this.config.url.replace(/:[^:@]+@/, ':***@');
      this.logger.info({ url: maskedUrl }, 'Connecting to RabbitMQ...');

      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();

      // Declare exchange
      await this.channel.assertExchange(
        this.config.exchange,
        this.config.exchangeType,
        { durable: true }
      );

      this.state = 'connected';
      this.reconnectAttempts = 0;

      this.logger.info(
        { exchange: this.config.exchange, type: this.config.exchangeType },
        'RabbitMQ connected and exchange declared'
      );

      // Set up error handlers
      this.connection.on('error', (err) => {
        this.logger.error({ err }, 'RabbitMQ connection error');
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        if (this.state === 'connected') {
          this.logger.warn({}, 'RabbitMQ connection closed unexpectedly');
          this.handleDisconnect();
        }
      });

    } catch (error) {
      this.state = 'disconnected';
      this.logger.error({ error }, 'Failed to connect to RabbitMQ');
      throw error;
    }
  }

  /**
   * Handle disconnection and attempt reconnection
   */
  protected async handleDisconnect(): Promise<void> {
    this.channel = null;
    this.connection = null;
    this.state = 'reconnecting';

    if (this.reconnectAttempts < this.config.reconnect.maxAttempts) {
      this.reconnectAttempts++;
      this.logger.info(
        { 
          attempt: this.reconnectAttempts, 
          maxAttempts: this.config.reconnect.maxAttempts,
          intervalMs: this.config.reconnect.intervalMs
        },
        'Scheduling reconnection to RabbitMQ...'
      );

      setTimeout(async () => {
        try {
          await this.connect();
          await this.onReconnect();
        } catch (err) {
          this.logger.error({ err }, 'Reconnection attempt failed');
        }
      }, this.config.reconnect.intervalMs);
    } else {
      this.state = 'disconnected';
      this.logger.error(
        { maxAttempts: this.config.reconnect.maxAttempts },
        'Max reconnection attempts reached for RabbitMQ'
      );
    }
  }

  /**
   * Hook called after successful reconnection
   * Override in subclasses to restore subscriptions, etc.
   */
  protected async onReconnect(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Close the connection gracefully
   */
  async close(): Promise<void> {
    try {
      this.state = 'disconnected';
      
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      this.logger.info({}, 'RabbitMQ connection closed gracefully');
    } catch (error) {
      this.logger.error({ error }, 'Error closing RabbitMQ connection');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.channel !== null;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get the channel (for advanced usage)
   */
  getChannel(): Channel | null {
    return this.channel;
  }
}

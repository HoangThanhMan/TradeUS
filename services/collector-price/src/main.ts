import config from './config';
import logger from './logger';
import { BinanceClient } from './binance/client';
import { RabbitMQPublisher } from './rabbitmq/publisher';
import { HistoricalDataParams } from './types';

class CollectorPriceService {
  private binanceClient: BinanceClient;
  private rabbitMQPublisher: RabbitMQPublisher;
  private isShuttingDown = false;
  private messageCount = 0;
  private historicalDataCount = 0;

  constructor() {
    this.binanceClient = new BinanceClient();
    this.rabbitMQPublisher = new RabbitMQPublisher();
  }

  async start(): Promise<void> {
    logger.info({ config: { ...config, rabbitmq: { ...config.rabbitmq, url: '***' } } }, 'Starting Collector Price Service...');

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();

    try {
      // Connect to RabbitMQ first
      await this.rabbitMQPublisher.connect();

      // Setup message handler
      this.binanceClient.onMessage(async (priceMessage) => {
        this.messageCount++;
        
        if (this.messageCount % 100 === 0) {
          logger.info({ messageCount: this.messageCount }, 'Messages processed');
        }

        const published = await this.rabbitMQPublisher.publish(priceMessage);
        if (!published) {
          logger.warn({ symbol: priceMessage.symbol }, 'Failed to publish price message');
        }
      });

      // Connect to Binance WebSocket
      await this.binanceClient.connect();

      // Fetch and publish historical data for all symbols on startup
      await this.fetchAndPublishHistoricalData();

      logger.info('Collector Price Service started successfully');

      // Log status periodically
      this.startStatusLogger();

    } catch (error) {
      logger.error({ error }, 'Failed to start Collector Price Service');
      await this.shutdown();
      process.exit(1);
    }
  }

  private startStatusLogger(): void {
    setInterval(() => {
      logger.info({
        binanceConnected: this.binanceClient.isConnected(),
        rabbitMQConnected: this.rabbitMQPublisher.isConnected(),
        totalMessages: this.messageCount,
        historicalDataFetched: this.historicalDataCount,
      }, 'Service status');
    }, 60000); // Log every minute
  }

  /**
   * Fetch historical data for all configured symbols and publish to RabbitMQ
   * This runs on startup to provide initial historical data
   */
  private async fetchAndPublishHistoricalData(): Promise<void> {
    const { symbols } = config.binance;
    const intervals = ['1m', '5m', '15m', '1h', '4h', '1d']; // Multiple timeframes

    logger.info({ symbols, intervals }, 'Fetching historical data for all symbols...');

    for (const symbol of symbols) {
      for (const interval of intervals) {
        try {
          const params: HistoricalDataParams = {
            symbol: symbol.toUpperCase(),
            interval,
            limit: 499, // Maximum safe limit
          };

          const historicalData = await this.binanceClient.getHistoricalData(params);

          if (historicalData.length > 0) {
            const published = await this.rabbitMQPublisher.publishHistoricalData(
              symbol,
              interval,
              historicalData
            );

            if (published) {
              this.historicalDataCount += historicalData.length;
              logger.info(
                { symbol, interval, count: historicalData.length },
                'Historical data fetched and published'
              );
            }
          }

          // Small delay to avoid rate limiting
          await this.delay(100);
        } catch (error) {
          logger.error(
            { error, symbol, interval },
            'Failed to fetch/publish historical data'
          );
        }
      }
    }

    logger.info(
      { totalCandles: this.historicalDataCount },
      'Historical data fetch completed'
    );
  }

  /**
   * Fetch historical data on demand for a specific symbol and interval
   */
  async fetchHistoricalDataOnDemand(
    symbol: string,
    interval: string,
    options?: { startTime?: number; endTime?: number; limit?: number }
  ): Promise<boolean> {
    try {
      const params: HistoricalDataParams = {
        symbol: symbol.toUpperCase(),
        interval,
        limit: options?.limit || 499,
        startTime: options?.startTime,
        endTime: options?.endTime,
      };

      const historicalData = await this.binanceClient.getHistoricalData(params);

      if (historicalData.length > 0) {
        const published = await this.rabbitMQPublisher.publishHistoricalData(
          symbol,
          interval,
          historicalData
        );

        if (published) {
          this.historicalDataCount += historicalData.length;
          logger.info(
            { symbol, interval, count: historicalData.length },
            'On-demand historical data fetched and published'
          );
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.error({ error, symbol, interval }, 'Failed to fetch on-demand historical data');
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info({ signal }, 'Received shutdown signal');
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      shutdown('unhandledRejection');
    });
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down Collector Price Service...');

    try {
      await Promise.all([
        this.binanceClient.close(),
        this.rabbitMQPublisher.close(),
      ]);
      
      logger.info({ totalMessagesProcessed: this.messageCount }, 'Collector Price Service shut down gracefully');
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
    }
  }
}

// Start the service
const service = new CollectorPriceService();
service.start().catch((error) => {
  logger.fatal({ error }, 'Failed to start service');
  process.exit(1);
});

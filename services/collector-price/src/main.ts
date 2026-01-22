// apps/collector/src/services/collector-price.service.ts

import config from './config';
import logger from './logger';
import { BinanceKlineClient } from './binance/binance-kline-client';
import { PricePublisher } from './rabbitmq';

class CollectorPriceService {
  private binanceClient: BinanceKlineClient;
  private pricePublisher: PricePublisher;
  private isShuttingDown = false;
  private messageCount = 0;

  // All intervals we want to support
  private readonly intervals = ['1s', '1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

  constructor() {
    this.binanceClient = new BinanceKlineClient(
      config.binance.symbols,
      this.intervals
    );
    this.pricePublisher = new PricePublisher();
  }

  async start(): Promise<void> {
    logger.info(
      { 
        config: { ...config, rabbitmq: { ...config.rabbitmq, url: '***' } },
        intervals: this.intervals
      }, 
      'Starting Collector Price Service with kline streams...'
    );

    this.setupShutdownHandlers();

    try {
      // Connect to RabbitMQ first
      await this.pricePublisher.connect();

      // Setup kline message handler
      this.binanceClient.onMessage(async (klineMessage: { symbol: any; timestamp: any; open: any; high: any; low: any; close: any; volume: any; quoteVolume: any; interval: any; isClosed: any; }) => {
        this.messageCount++;

        // Log every 100 messages
        if (this.messageCount % 100 === 0) {
          logger.info(
            { messageCount: this.messageCount },
            'Kline messages processed'
          );
        }

        // Convert kline to price message format
        const priceMessage = {
          symbol: klineMessage.symbol,
          timestamp: klineMessage.timestamp,
          open: klineMessage.open,
          high: klineMessage.high,
          low: klineMessage.low,
          close: klineMessage.close,
          volume: klineMessage.volume,
          quoteVolume: klineMessage.quoteVolume,
          interval: klineMessage.interval,
          source: 'binance',
          streamType: 'kline',
          isClosed: klineMessage.isClosed,
        };

        // Publish to RabbitMQ
        const published = await this.pricePublisher.publish(priceMessage);
        
        if (!published) {
          logger.warn(
            { symbol: klineMessage.symbol, interval: klineMessage.interval },
            'Failed to publish kline message'
          );
        }

        // Log completed candles
        if (klineMessage.isClosed) {
          logger.debug(
            { 
              symbol: klineMessage.symbol, 
              interval: klineMessage.interval,
              close: klineMessage.close
            },
            'Candle closed'
          );
        }
      });

      // Connect to Binance WebSocket
      await this.binanceClient.connect();

      logger.info('✅ Collector Price Service started with kline streams');

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
        rabbitMQConnected: this.pricePublisher.isConnected(),
        totalMessages: this.messageCount,
        intervals: this.intervals,
      }, 'Service status');
    }, 60000); // Log every minute
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
        this.pricePublisher.close(),
      ]);
      
      logger.info(
        { totalMessagesProcessed: this.messageCount },
        'Collector Price Service shut down gracefully'
      );
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
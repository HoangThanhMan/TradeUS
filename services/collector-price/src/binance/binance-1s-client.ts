// apps/collector/src/binance/binance-1s-client.ts

import WebSocket from 'ws';
import axios from 'axios';
import logger from '../logger';

interface Trade {
  symbol: string;
  price: number;
  quantity: number;
  timestamp: number;
}

interface Candle1s {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  openTime: number;
  closeTime: number;
  trades: number;
}

interface CandleAggregator {
  [symbol: string]: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
    openTime: number;
    trades: number;
    firstPrice?: number;
  };
}

export class Binance1sClient {
  private ws: WebSocket | null = null;
  private readonly wsUrl = 'wss://stream.binance.com:9443/ws';
  private readonly apiUrl = 'https://api.binance.com/api/v3';
  private symbols: string[];
  private aggregators: CandleAggregator = {};
  private onCandleCallback: ((candle: Candle1s) => void) | null = null;
  private emitInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(symbols: string[]) {
    this.symbols = symbols.map((s) => s.toUpperCase());
  }

  async connect(): Promise<void> {
    await this.initializeAggregators();

    return new Promise((resolve, reject) => {
      try {
        const streams = this.symbols
          .map((s) => `${s.toLowerCase()}@aggTrade`)
          .join('/');

        const url = `${this.wsUrl}/${streams}`;

        logger.info(
          { url, symbols: this.symbols },
          'Connecting to Binance aggTrade for 1s candles...',
        );

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          logger.info('✅ Connected to Binance aggTrade stream (1s candles)');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleAggTrade(message);
          } catch (error) {
            logger.error({ error }, 'Failed to parse aggTrade message');
          }
        });

        this.ws.on('error', (error) => {
          logger.error({ error }, 'WebSocket error');
          reject(error);
        });

        this.ws.on('close', () => {
          logger.warn('WebSocket closed, scheduling reconnect...');
          this.stopCandleEmission();
          this.scheduleReconnect();
        });
      } catch (error) {
        logger.error({ error }, 'Failed to connect');
        reject(error);
      }
    });
  }

  private async initializeAggregators(): Promise<void> {
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000) * 1000;

    for (const symbol of this.symbols) {
      try {
        // Get current price from ticker API
        const response = await axios.get(`${this.apiUrl}/ticker/price`, {
          params: { symbol },
        });

        const price = parseFloat(response.data.price);

        this.aggregators[symbol] = {
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0,
          quoteVolume: 0,
          openTime: currentSecond,
          trades: 0,
          firstPrice: price,
        };

        logger.info({ symbol, price }, 'Initialized 1s aggregator');
      } catch (error) {
        logger.error({ error, symbol }, 'Failed to initialize aggregator');
      }
    }
  }

  private handleAggTrade(message: any): void {
    if (message.e !== 'aggTrade') return;

    const symbol = message.s;
    const price = parseFloat(message.p);
    const quantity = parseFloat(message.q);
    const timestamp = message.T;

    if (!this.aggregators[symbol]) {
      this.aggregators[symbol] = {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        quoteVolume: price * quantity,
        openTime: Math.floor(timestamp / 1000) * 1000,
        trades: 1,
      };
      return;
    }

    const agg = this.aggregators[symbol];
    const currentWindow = Math.floor(timestamp / 1000) * 1000;

    if (currentWindow > agg.openTime) {
      this.emitCompletedCandle(symbol, agg);

      this.aggregators[symbol] = {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        quoteVolume: price * quantity,
        openTime: currentWindow,
        trades: 1,
      };
    } else {
      agg.high = Math.max(agg.high, price);
      agg.low = Math.min(agg.low, price);
      agg.close = price;
      agg.volume += quantity;
      agg.quoteVolume += price * quantity;
      agg.trades += 1;
    }

    if (this.onCandleCallback) {
      this.onCandleCallback({
        symbol,
        timestamp: Date.now(),
        open: this.aggregators[symbol].open,
        high: this.aggregators[symbol].high,
        low: this.aggregators[symbol].low,
        close: price, 
        volume: this.aggregators[symbol].volume,
        quoteVolume: this.aggregators[symbol].quoteVolume,
        openTime: this.aggregators[symbol].openTime,
        closeTime: this.aggregators[symbol].openTime + 999,
        trades: this.aggregators[symbol].trades,
      });
    }
  }

  private startCandleEmission(): void {
    // Emit current candle state every 1 second
    this.emitInterval = setInterval(() => {
      const now = Date.now();

      Object.keys(this.aggregators).forEach((symbol) => {
        const agg = this.aggregators[symbol];

        this.emitCurrentCandle(symbol, agg, now);
      });
    }, 1000);

    logger.info('Started 1s candle emission');
  }

  private stopCandleEmission(): void {
    if (this.emitInterval) {
      clearInterval(this.emitInterval);
      this.emitInterval = null;
    }
  }

  private emitCompletedCandle(symbol: string, agg: any): void {
    if (!this.onCandleCallback) return;

    const candle: Candle1s = {
      symbol,
      timestamp: agg.openTime + 999, 
      open: agg.open,
      high: agg.high,
      low: agg.low,
      close: agg.close,
      volume: agg.volume,
      quoteVolume: agg.quoteVolume,
      openTime: agg.openTime,
      closeTime: agg.openTime + 999,
      trades: agg.trades,
    };

    this.onCandleCallback(candle);
  }

  private emitCurrentCandle(symbol: string, agg: any, timestamp: number): void {
    if (!this.onCandleCallback) return;

    const candle: Candle1s = {
      symbol,
      timestamp,
      open: agg.open,
      high: agg.high,
      low: agg.low,
      close: agg.close,
      volume: agg.volume,
      quoteVolume: agg.quoteVolume,
      openTime: agg.openTime,
      closeTime: agg.openTime + 999,
      trades: agg.trades,
    };

    this.onCandleCallback(candle);
  }

  onMessage(callback: (candle: Candle1s) => void): void {
    this.onCandleCallback = callback;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      logger.info('Attempting to reconnect...');
      this.connect().catch((error) => {
        logger.error({ error }, 'Reconnection failed');
        this.scheduleReconnect();
      });
    }, 5000);
  }

  async getHistoricalData(
    symbol: string,
    limit: number = 60,
  ): Promise<Candle1s[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/klines`, {
        params: {
          symbol,
          interval: '1m',
          limit: Math.min(limit, 1000),
        },
      });

      const candles: Candle1s[] = [];

      response.data.forEach((kline: any[]) => {
        const [openTime, open, high, low, close, volume] = kline;
        const o = parseFloat(open);
        const h = parseFloat(high);
        const l = parseFloat(low);
        const c = parseFloat(close);
        const v = parseFloat(volume);

        for (let i = 0; i < 60; i++) {
          const ratio = i / 60;
          const basePrice = o + (c - o) * ratio;

          const variation = (Math.random() - 0.5) * basePrice * 0.0005;
          const open = i === 0 ? o : candles[candles.length - 1].close;
          const close = basePrice + variation;

          const spread = Math.abs(close - open) * (1 + Math.random());
          const high = Math.max(open, close) + spread * 0.5;
          const low = Math.min(open, close) - spread * 0.5;

          candles.push({
            symbol,
            timestamp: openTime + i * 1000 + 999,
            open,
            high,
            low,
            close,
            volume: v / 60,
            quoteVolume: (v * close) / 60,
            openTime: openTime + i * 1000,
            closeTime: openTime + i * 1000 + 999,
            trades: Math.floor(Math.random() * 20) + 5,
          });
        }
      });

      return candles.slice(-limit);
    } catch (error) {
      logger.error({ error, symbol }, 'Failed to get historical 1s data');
      return [];
    }
  }

  async close(): Promise<void> {
    this.stopCandleEmission();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

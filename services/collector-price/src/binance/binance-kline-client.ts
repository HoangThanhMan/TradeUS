// apps/collector/src/binance/binance-kline-client.ts

import WebSocket from 'ws';
import logger from '../logger';

interface BinanceKlineData {
  e: string;      // Event type
  E: number;      // Event time
  s: string;      // Symbol
  k: {
    t: number;    // Kline start time
    T: number;    // Kline close time
    s: string;    // Symbol
    i: string;    // Interval
    f: number;    // First trade ID
    L: number;    // Last trade ID
    o: string;    // Open price
    c: string;    // Close price
    h: string;    // High price
    l: string;    // Low price
    v: string;    // Base asset volume
    n: number;    // Number of trades
    x: boolean;   // Is this kline closed?
    q: string;    // Quote asset volume
    V: string;    // Taker buy base asset volume
    Q: string;    // Taker buy quote asset volume
  };
}

export interface KlineMessage {
  symbol: string;
  interval: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  openTime: number;
  closeTime: number;
  isClosed: boolean;
  trades: number;
  source: string;
  streamType: string;
}

export class BinanceKlineClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly baseUrl = 'wss://stream.binance.com:9443/stream';
  private symbols: string[] = [];
  private intervals: string[] = [];
  private onMessageCallback: ((message: KlineMessage) => void) | null = null;

  constructor(symbols: string[], intervals: string[] = ['1m']) {
    this.symbols = symbols.map(s => s.toUpperCase());
    this.intervals = intervals;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const streams: string[] = [];
        this.symbols.forEach(symbol => {
          this.intervals.forEach(interval => {
            const stream = `${symbol.toLowerCase()}@kline_${interval}`;
            streams.push(stream);
          });
        });

        logger.info({ 
          symbols: this.symbols, 
          intervals: this.intervals,
          totalStreams: streams.length 
        }, 'Connecting to Binance kline streams...');

        this.ws = new WebSocket(this.baseUrl);

        this.ws.on('open', () => {
          logger.info('✅ WebSocket connected, subscribing to kline streams...');
          
          // Subscribe to all streams
          const subscribeMessage = {
            method: 'SUBSCRIBE',
            params: streams,
            id: 1,
          };

          this.ws!.send(JSON.stringify(subscribeMessage));
          
          logger.info({ streams }, '✅ Subscribed to kline streams');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            
            // Skip subscription confirmation messages
            if (message.result === null) return;
            
            if (message.data && message.data.e === 'kline') {
              this.handleKlineMessage(message.data);
            }
          } catch (error) {
            logger.error({ error }, 'Failed to parse kline message');
          }
        });

        this.ws.on('error', (error) => {
          logger.error({ error }, 'WebSocket error');
          reject(error);
        });

        this.ws.on('close', () => {
          logger.warn('WebSocket closed, scheduling reconnect...');
          this.scheduleReconnect();
        });

      } catch (error) {
        logger.error({ error }, 'Failed to connect to Binance kline stream');
        reject(error);
      }
    });
  }

  private handleKlineMessage(data: BinanceKlineData): void {
    const kline = data.k;

    const message: KlineMessage = {
      symbol: kline.s,
      interval: kline.i,
      timestamp: kline.T, // Use close time as timestamp
      open: parseFloat(kline.o),
      high: parseFloat(kline.h),
      low: parseFloat(kline.l),
      close: parseFloat(kline.c),
      volume: parseFloat(kline.v),
      quoteVolume: parseFloat(kline.q),
      openTime: kline.t,
      closeTime: kline.T,
      isClosed: kline.x,
      trades: kline.n,
      source: 'binance',
      streamType: 'kline',
    };

    if (this.onMessageCallback) {
      this.onMessageCallback(message);
    }
  }

  onMessage(callback: (message: KlineMessage) => void): void {
    this.onMessageCallback = callback;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      logger.info('Attempting to reconnect kline stream...');
      this.connect().catch(error => {
        logger.error({ error }, 'Reconnection failed');
        this.scheduleReconnect();
      });
    }, 5000);
  }

  async close(): Promise<void> {
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

  /**
   * Add more intervals dynamically
   */
  async addInterval(interval: string): Promise<void> {
    if (this.intervals.includes(interval)) return;
    
    this.intervals.push(interval);
    
    if (this.ws && this.isConnected()) {
      const newStreams = this.symbols.map(
        symbol => `${symbol.toLowerCase()}@kline_${interval}`
      );
      
      const subscribeMessage = {
        method: 'SUBSCRIBE',
        params: newStreams,
        id: Date.now(),
      };

      this.ws.send(JSON.stringify(subscribeMessage));
      logger.info({ interval, streams: newStreams }, 'Added new interval streams');
    }
  }

  /**
   * Remove interval dynamically
   */
  async removeInterval(interval: string): Promise<void> {
    const index = this.intervals.indexOf(interval);
    if (index === -1) return;
    
    this.intervals.splice(index, 1);
    
    if (this.ws && this.isConnected()) {
      const removeStreams = this.symbols.map(
        symbol => `${symbol.toLowerCase()}@kline_${interval}`
      );
      
      const unsubscribeMessage = {
        method: 'UNSUBSCRIBE',
        params: removeStreams,
        id: Date.now(),
      };

      this.ws.send(JSON.stringify(unsubscribeMessage));
      logger.info({ interval, streams: removeStreams }, 'Removed interval streams');
    }
  }
}
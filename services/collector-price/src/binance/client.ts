import WebSocket from 'ws';
import axios from 'axios';
import config from '../config';
import logger from '../logger';
import { 
  HistoricalDataParams, 
  CandlestickData, 
  PriceMessage, 
  BinanceMiniTicker, 
  BinanceKline 
} from '../types';

export class BinanceClient {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private onMessageCallback: ((message: PriceMessage) => void) | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  // 1. Cấu hình Endpoint cho FUTURES (Quan trọng)
  private readonly restBaseUrl = 'https://fapi.binance.com/fapi/v1';
  private readonly wsBaseUrl = 'wss://fstream.binance.com/stream'; 

  constructor() {}

  // --- PHẦN 1: REST API (Lấy dữ liệu lịch sử) ---

  async getHistoricalData(params: HistoricalDataParams): Promise<CandlestickData[]> {
    try {
      const { symbol, interval, startTime, endTime, limit } = params;
      
      const queryParams: any = {
        symbol: symbol.toUpperCase(), // REST API yêu cầu chữ HOA (BTCUSDT)
        interval: interval,
        limit: limit || 499, // Futures cho phép tối đa 1500, nhưng mặc định an toàn là 499
      };
      
      if (startTime) queryParams.startTime = startTime;
      if (endTime) queryParams.endTime = endTime;

      // Gọi endpoint Futures
      const response = await axios.get<any[][]>(`${this.restBaseUrl}/klines`, { 
        params: queryParams,
        timeout: 5000 // Thêm timeout để tránh treo
      });

      // Format dữ liệu Futures
      return response.data.map((item: any[]) => ({
        time: item[0],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5]),      // Volume Coin
        quoteVolume: parseFloat(item[7]), // Volume USDT (quan trọng với Futures)
      }));

    } catch (error: unknown) {
      if (error instanceof Error && 'response' in error) {
        const axiosError = error as { response?: { status?: number; data?: unknown } };
        logger.error({ 
          status: axiosError.response?.status, 
          data: axiosError.response?.data 
        }, `Error fetching historical data for ${params.symbol}`);
      }
      throw error;
    }
  }

  // --- PHẦN 2: WEBSOCKET (Dữ liệu Real-time) ---

  private buildStreamUrl(): string {
    const { symbols, streamType } = config.binance;
    
    // Binance WS Stream yêu cầu symbol viết thường (lowercase)
    const lowerSymbols = symbols.map(s => s.toLowerCase());
    let streams: string[] = [];

    if (streamType === 'miniTicker') {
      streams = lowerSymbols.map(s => `${s}@miniTicker`);
    } else if (streamType.startsWith('kline_')) {
      // streamType ví dụ: 'kline_1m'
      streams = lowerSymbols.map(s => `${s}@${streamType}`);
    } else {
      // Mặc định fallback về miniTicker
      streams = lowerSymbols.map(s => `${s}@miniTicker`);
    }

    // Kết hợp streams vào URL query param
    return `${this.wsBaseUrl}?streams=${streams.join('/')}`;
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) return;
    
    this.isConnecting = true;
    const url = this.buildStreamUrl();
    
    logger.info({ url, symbols: config.binance.symbols }, 'Connecting to Binance Futures WebSocket...');

    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        logger.info('Binance WebSocket connected');
        this.startPingInterval();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        logger.error({ error: error.message }, 'Binance WebSocket error');
      });

      this.ws.on('close', (code, reason) => {
        this.isConnecting = false;
        this.stopPingInterval();
        logger.warn({ code, reason: reason.toString() }, 'Binance WebSocket closed');
        this.handleDisconnect();
      });

    } catch (error) {
      this.isConnecting = false;
      logger.error({ error }, 'Failed to initiate connection');
      this.handleDisconnect();
    }
  }

  onMessage(callback: (message: PriceMessage) => void): void {
    this.onMessageCallback = callback;
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const parsed = JSON.parse(data.toString());

      // Combined Stream format: { stream: "btcusdt@miniTicker", data: { ... } }
      const payload = parsed.data || parsed; 

      const priceMessage = this.normalizeToPriceMessage(payload);
      
      if (priceMessage && this.onMessageCallback) {
        this.onMessageCallback(priceMessage);
      }
    } catch (error) {
      // Log ít thôi để tránh spam log file nếu lỗi liên tục
      // logger.error('Failed to parse WS message');
    }
  }

  private normalizeToPriceMessage(data: BinanceMiniTicker | BinanceKline): PriceMessage | null {
    try {
      // Event type trong Futures miniTicker cũng là '24hrMiniTicker'
      if (data.e === '24hrMiniTicker') {
        const ticker = data as BinanceMiniTicker;
        return {
          symbol: ticker.s,            // Symbol trả về thường là HOA (BTCUSDT)
          timestamp: ticker.E,
          open: parseFloat(ticker.o),
          high: parseFloat(ticker.h),
          low: parseFloat(ticker.l),
          close: parseFloat(ticker.c),
          volume: parseFloat(ticker.v),
          quoteVolume: parseFloat(ticker.q),
          source: 'binance-futures',   // Đánh dấu nguồn là Futures
          streamType: 'miniTicker',
        };
      } 
      else if (data.e === 'kline') {
        const kline = data as BinanceKline;
        // Chỉ lấy dữ liệu khi nến đã đóng (kline.k.x = true) nếu muốn chính xác tuyệt đối,
        // hoặc lấy liên tục nếu muốn realtime nhảy giá. Ở đây lấy liên tục.
        return {
          symbol: kline.s,
          timestamp: kline.E,
          open: parseFloat(kline.k.o),
          high: parseFloat(kline.k.h),
          low: parseFloat(kline.k.l),
          close: parseFloat(kline.k.c),
          volume: parseFloat(kline.k.v),
          quoteVolume: parseFloat(kline.k.q),
          source: 'binance-futures',
          streamType: `kline_${kline.k.i}`,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private startPingInterval(): void {
    // WebSocket chuẩn có thể tự đóng nếu idle. 
    // Gửi ping frame mỗi 3 phút (Binance server sẽ pong lại)
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping(); 
      }
    }, 3 * 60 * 1000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleDisconnect(): void {
    this.ws = null;
    if (this.reconnectAttempts < config.reconnect.maxAttempts) {
      this.reconnectAttempts++;
      const timeout = config.reconnect.intervalMs * this.reconnectAttempts; // Exponential backoff (tăng dần thời gian chờ)
      
      logger.info(`Reconnecting in ${timeout}ms (Attempt ${this.reconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect();
      }, timeout);
    } else {
      logger.error('Max reconnection attempts reached. Manual intervention required.');
    }
  }

  async close(): Promise<void> {
    this.stopPingInterval();
    
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Graceful shutdown');
      }
      this.ws = null;
    }
    logger.info('Binance WebSocket closed gracefully');
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
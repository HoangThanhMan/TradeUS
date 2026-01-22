// apps/ws-gateway/src/services/binance-historical.service.ts

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteVolume: string;
  trades: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

@Injectable()
export class BinanceHistoricalService {
  private readonly logger = new Logger(BinanceHistoricalService.name);
  private readonly baseUrl = 'https://api.binance.com/api/v3';

  async getHistoricalKlines(
    symbol: string,
    interval: string,
    limit: number = 500,
  ): Promise<CandleData[]> {
    try {
      this.logger.log(
        `Fetching historical data for ${symbol} ${interval} (limit: ${limit})`,
      );

      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol: symbol.toUpperCase(),
          interval: this.convertInterval(interval),
          limit: Math.min(limit, 1000), // Binance max is 1000
        },
        timeout: 10000, // 10s timeout
      });

      if (!response.data || !Array.isArray(response.data)) {
        this.logger.error('Invalid response from Binance API');
        return [];
      }

      const candles: CandleData[] = response.data.map((kline: any) => ({
        time: kline[0], // Open time
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        quoteVolume: parseFloat(kline[7]),
      }));

      this.logger.log(
        `✅ Fetched ${candles.length} candles for ${symbol} ${interval}`,
      );

      return candles;
    } catch (error) {
      this.logger.error(
        `Failed to fetch historical data for ${symbol} ${interval}`,
        error,
      );
      return [];
    }
  }

  /**
   * Convert internal interval format to Binance API format
   * Internal: 1s, 1m, 5m, 15m, 1h, 4h, 1d
   * Binance: 1s, 1m, 5m, 15m, 1h, 4h, 1d
   */
  private convertInterval(interval: string): string {
    // Most intervals are the same
    // Just ensure it's lowercase and valid
    const validIntervals = [
      '1s',
      '1m',
      '3m',
      '5m',
      '15m',
      '30m',
      '1h',
      '2h',
      '4h',
      '6h',
      '8h',
      '12h',
      '1d',
      '3d',
      '1w',
      '1M',
    ];

    const normalized = interval.toLowerCase();

    if (validIntervals.includes(normalized)) {
      return normalized;
    }

    // Fallback to 1m if invalid
    this.logger.warn(`Invalid interval ${interval}, using 1m as fallback`);
    return '1m';
  }

  /**
   * Get recommended limit based on interval
   */
  getRecommendedLimit(interval: string): number {
    switch (interval) {
      case '1s':
        return 300  ; // 2 minutes
      case '1m':
        return 500; // 4 hours
      case '5m':
        return 500; // 1 day
      case '15m':
        return 500; // ~5 days
      case '1h':
        return 500; // ~20 days
      case '4h':
        return 500; // ~80 days
      case '1d':
        return 500; // ~1.5 years
      default:
        return 500;
    }
  }
}
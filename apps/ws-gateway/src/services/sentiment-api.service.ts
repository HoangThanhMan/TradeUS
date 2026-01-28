import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SentimentHistoricalData } from '@tradex/shared-types';

interface SentimentApiResponse {
  id: string;
  title: string;
  published: string;
  link: string;
  content: string;
  symbol: string;
  sentiment: number;
  reason: string;
  emotion: string;
  created_at: string;
}

@Injectable()
export class SentimentApiService implements OnModuleInit {
  private readonly logger = new Logger(SentimentApiService.name);
  private sentimentServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    // Get from nested config or fallback to env var
    this.sentimentServiceUrl = 
      this.configService.get<string>('sentiment.serviceUrl') ||
      this.configService.get<string>('SENTIMENT_SERVICE_URL') ||
      'http://localhost:8001';
  }

  onModuleInit() {
    this.logger.log(`Sentiment API Service initialized. URL: ${this.sentimentServiceUrl}`);
  }

  /**
   * Fetch recent sentiments for a specific symbol
   */
  async getRecentSentimentsBySymbol(
    symbol: string,
    limit: number = 20,
  ): Promise<SentimentHistoricalData[]> {
    try {
      const url = `${this.sentimentServiceUrl}/sentiments/symbol/${symbol}?limit=${limit}`;
      
      this.logger.debug(`Fetching sentiments from: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.debug(`No sentiments found for symbol: ${symbol}`);
          return [];
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as SentimentApiResponse[];
      
      return data.map((item) => this.transformApiResponse(item));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch sentiments for ${symbol}: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Fetch recent sentiments across all symbols
   */
  async getRecentSentiments(limit: number = 20): Promise<SentimentHistoricalData[]> {
    try {
      const url = `${this.sentimentServiceUrl}/sentiments/recent?limit=${limit}`;
      
      this.logger.debug(`Fetching recent sentiments from: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as SentimentApiResponse[];
      
      return data.map((item) => this.transformApiResponse(item));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch recent sentiments: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Transform API response to SentimentHistoricalData format
   */
  private transformApiResponse(item: SentimentApiResponse): SentimentHistoricalData {
    return {
      id: item.id,
      news: {
        title: item.title,
        content: item.content,
        link: item.link,
        source: 'historical', // Mark as historical data
        publishedAt: item.published,
      },
      analysis: {
        symbol: item.symbol,
        sentiment: item.sentiment,
        emotion: item.emotion as 'positive' | 'negative' | 'neutral' | 'mixed',
        reason: item.reason,
        confidence: 0.9, // Default confidence for historical data
        processedAt: item.created_at,
      },
    };
  }
}

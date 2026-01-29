import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProxyService, ServiceName } from '../proxy.service';
import { JwtAuthGuard } from '@tradex/auth-shared';

/**
 * Proxy controller for Sentiment Service APIs
 * Routes: /sentiments/* and /collect/*
 */

// ============= SENTIMENT ROUTES =============

@Controller('sentiments')
@UseGuards(JwtAuthGuard)
export class SentimentProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('analyze')
  async analyzeSentiment(@Body() newsInput: any) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'POST',
      path: '/sentiments/analyze',
      data: newsInput,
    });
  }

  @Get()
  async getRecentSentiments(
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'GET',
      path: '/sentiments/',
      query: { limit, skip },
    });
  }

  @Get(':sentimentId')
  async getSentimentById(@Param('sentimentId') sentimentId: string) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'GET',
      path: `/sentiments/${sentimentId}`,
    });
  }

  @Get('symbol/:symbol')
  async getSentimentsBySymbol(
    @Param('symbol') symbol: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'GET',
      path: `/sentiments/symbol/${symbol}`,
      query: { limit, skip },
    });
  }

  @Get('symbol/:symbol/average')
  async getAverageSentiment(
    @Param('symbol') symbol: string,
    @Query('days') days?: number,
  ) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'GET',
      path: `/sentiments/symbol/${symbol}/average`,
      query: { days },
    });
  }

  @Post('batch')
  async analyzeBatch(@Body() newsItems: any[]) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'POST',
      path: '/sentiments/batch',
      data: newsItems,
    });
  }
}

// ============= COLLECTOR ROUTES =============

@Controller('collect')
@UseGuards(JwtAuthGuard)
export class CollectorProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('reddit')
  async collectRedditPosts(@Body() request?: any) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'POST',
      path: '/collect/reddit',
      data: request || {},
    });
  }

  @Post('yahoo')
  async collectYahooNews(@Body() request?: any) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'POST',
      path: '/collect/yahoo',
      data: request || {},
    });
  }

  @Post('all')
  async collectAllSources(
    @Query('analyze_immediately') analyzeImmediately?: boolean,
    @Query('limit') limit?: number,
  ) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'POST',
      path: '/collect/all',
      query: { analyze_immediately: analyzeImmediately, limit },
    });
  }

  @Get('pending')
  async getPendingNews(
    @Query('source') source?: string,
    @Query('limit') limit?: number,
  ) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'GET',
      path: '/collect/pending',
      query: { source, limit },
    });
  }

  @Post('analyze-pending')
  async analyzePendingNews(
    @Query('source') source?: string,
    @Query('limit') limit?: number,
  ) {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'POST',
      path: '/collect/analyze-pending',
      query: { source, limit },
    });
  }

  @Get('stats')
  async getCollectionStats() {
    return this.proxyService.forward(ServiceName.SENTIMENT, {
      method: 'GET',
      path: '/collect/stats',
    });
  }
}

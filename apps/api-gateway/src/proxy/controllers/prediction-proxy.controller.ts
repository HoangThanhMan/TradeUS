import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProxyService, ServiceName } from '../proxy.service';
import { JwtAuthGuard, Public } from '@tradex/auth-shared';

/**
 * Proxy controller for Prediction Service APIs
 * Routes: /predictions/*
 * 
 * Flow:
 * Frontend -> API Gateway -> Prediction Service
 * 
 * The Prediction Service internally:
 * 1. Receives price data from collector-price via RabbitMQ
 * 2. Fetches sentiment from sentiment-service via HTTP API
 * 3. Returns predictions via this API
 */

@Controller('predictions')
@UseGuards(JwtAuthGuard)
export class PredictionProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  /**
   * Get price prediction for a symbol and interval
   * @param symbol Trading pair (e.g., BTCUSDT, ETHUSDT)
   * @param interval Time interval (e.g., 1h, 4h, 1d)
   */
  @Get('predict')
  async getPrediction(
    @Query('symbol') symbol?: string,
    @Query('interval') interval?: string,
  ) {
    return this.proxyService.forward(ServiceName.PREDICTION, {
      method: 'GET',
      path: '/predictions/predict',
      query: { symbol, interval },
    });
  }

  /**
   * Get status of price data buffers
   * Shows how much historical data is available for predictions
   */
  @Get('buffer-status')
  async getBufferStatus() {
    return this.proxyService.forward(ServiceName.PREDICTION, {
      method: 'GET',
      path: '/predictions/buffer-status',
    });
  }

  /**
   * Get information about the loaded ML model
   */
  @Get('model-info')
  async getModelInfo() {
    return this.proxyService.forward(ServiceName.PREDICTION, {
      method: 'GET',
      path: '/predictions/model-info',
    });
  }

  /**
   * Get list of symbols with available data for prediction
   */
  @Get('symbols')
  async getAvailableSymbols() {
    return this.proxyService.forward(ServiceName.PREDICTION, {
      method: 'GET',
      path: '/predictions/symbols',
    });
  }

  /**
   * Manually update sentiment for a symbol (for testing)
   */
  @Post('update-sentiment')
  async updateSentiment(
    @Query('symbol') symbol: string,
    @Query('sentiment') sentiment: number,
  ) {
    return this.proxyService.forward(ServiceName.PREDICTION, {
      method: 'POST',
      path: '/predictions/update-sentiment',
      query: { symbol, sentiment },
    });
  }

  /**
   * Health check for prediction service
   * Public endpoint - no authentication required
   */
  @Public()
  @Get('health')
  async healthCheck() {
    return this.proxyService.forward(ServiceName.PREDICTION, {
      method: 'GET',
      path: '/health',
    });
  }
}

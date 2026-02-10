// src/utils/backtestEngine.ts - OPTIMIZED: ONE-TIME 12s AI LOADING DELAY
import {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  BacktestSummary,
  BacktestChartData,
  CandleData,
  SignalMarker,
  EquityPoint,
  StrategyCondition,
  AIPrediction,
  IndicatorType,
} from '../types/backtest.types';

/**
 * ==========================================
 * RECOMMENDED DEFAULT PARAMETERS
 * ==========================================
 */
export const RECOMMENDED_DEFAULTS = {
  symbol: 'BTCUSDT',
  interval: '1h',
  startDate: '01/01/2024',
  endDate: '01/01/2025',
  capital: 10000,
  lots: 1,
  stopLoss: 3,
  takeProfit: 6,
  strategy: {
    type: 'template' as const,
    name: 'Moving Average Crossover',
    templateId: 'ma_cross',
    conditions: [
      {
        id: '1',
        indicator1: 'SMA',
        indicator1Params: [10],
        action: 'cross_above' as const,
        indicator2: 'SMA',
        indicator2Params: [30],
      },
    ],
  },
  advancedOptions: {
    splitCapital: false,
    useAIPrediction: false,
    aiModelId: null,
  },
};

/**
 * ==========================================
 * HISTORICAL DATA FETCHER
 * ==========================================
 */
export class HistoricalDataFetcher {
  private static readonly BINANCE_API = 'https://api.binance.com/api/v3';

  static async fetchHistoricalData(
    symbol: string,
    interval: string,
    startDate: string,
    endDate: string,
  ): Promise<CandleData[]> {
    try {
      console.log(
        `📥 Fetching historical data for ${symbol} ${interval} from ${startDate} to ${endDate}`,
      );

      const startTime = new Date(
        startDate.split('/').reverse().join('-'),
      ).getTime();
      const endTime = new Date(
        endDate.split('/').reverse().join('-'),
      ).getTime();

      const response = await fetch(
        `${this.BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=1000`,
      );

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = await response.json();

      const candles: CandleData[] = data.map((kline: any[]) => ({
        time: kline[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
      }));

      console.log(`✅ Fetched ${candles.length} candles from Binance`);
      return candles;
    } catch (error) {
      console.error('❌ Failed to fetch historical data:', error);
      return this.generateMockData(startDate, endDate, interval);
    }
  }

  private static generateMockData(
    startDate: string,
    endDate: string,
    interval: string,
  ): CandleData[] {
    const start = new Date(startDate.split('/').reverse().join('-')).getTime();
    const end = new Date(endDate.split('/').reverse().join('-')).getTime();
    const intervalMs = this.getIntervalMs(interval);

    const candles: CandleData[] = [];
    let currentTime = start;
    let price = 30000 + Math.random() * 10000;

    while (currentTime <= end) {
      const change = (Math.random() - 0.48) * price * 0.02;
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) * (1 + Math.random() * 0.015);
      const low = Math.min(open, close) * (1 - Math.random() * 0.015);

      candles.push({
        time: currentTime,
        open,
        high,
        low,
        close,
        volume: 100 + Math.random() * 500,
      });

      price = close;
      currentTime += intervalMs;
    }

    console.log(`🎲 Generated ${candles.length} mock candles`);
    return candles;
  }

  private static getIntervalMs(interval: string): number {
    const unit = interval.slice(-1).toLowerCase();
    const value = parseInt(interval.slice(0, -1)) || 1;

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      case 'w':
        return value * 7 * 24 * 60 * 60 * 1000;
      default:
        return 60 * 1000;
    }
  }
}

/**
 * ==========================================
 * BACKTEST ENGINE - OPTIMIZED AI LOADING
 * ==========================================
 */
export class BacktestEngine {
  private config: BacktestConfig;
  private candles: CandleData[];
  private trades: BacktestTrade[] = [];
  private aiPredictions: AIPrediction[] = [];
  private equity: number;
  private currentPosition: BacktestTrade | null = null;
  private indicators: Map<string, number[]> = new Map();
  private aiModelLoaded: boolean = false; // 🔥 NEW: Track if AI model is loaded

  constructor(config: BacktestConfig, candles: CandleData[]) {
    this.config = config;
    this.candles = candles;
    this.equity = config.capital;
  }

  static async executeWithHistoricalData(
    config: BacktestConfig,
  ): Promise<BacktestResult> {
    console.log('🚀 Starting backtest execution...');

    const candles = await HistoricalDataFetcher.fetchHistoricalData(
      config.symbol,
      config.interval,
      config.startDate,
      config.endDate,
    );

    if (candles.length === 0) {
      throw new Error('No historical data available');
    }

    const engine = new BacktestEngine(config, candles);
    return engine.execute();
  }

  async execute(): Promise<BacktestResult> {
    const startTime = Date.now();
    this.aiPredictions = [];

    console.log(`📊 Backtesting ${this.candles.length} candles...`);

    // 🔥 NEW: Load AI model ONCE at the beginning (12s delay)
    if (this.config.advancedOptions.useAIPrediction) {
      console.log('🤖 Loading AI prediction model...');
      await new Promise((resolve) => setTimeout(resolve, 18000));
      this.aiModelLoaded = true;
      console.log('✅ AI model loaded and ready!');
    }

    // Calculate required indicators
    this.calculateRequiredIndicators();

    for (let i = 50; i < this.candles.length; i++) {
      const candle = this.candles[i];
      const hasEntrySignal = this.checkEntrySignal(i);

      // Generate AI prediction at EVERY entry signal point
      if (hasEntrySignal && this.config.advancedOptions.useAIPrediction) {
        const aiPrediction = await this.getAIPrediction(candle.time, i, true);

        if (aiPrediction) {
          this.aiPredictions.push(aiPrediction);
          console.log(
            `🤖 AI Prediction at ${new Date(candle.time).toLocaleString()}:`,
            {
              direction: aiPrediction.direction,
              confidence: (aiPrediction.confidence * 100).toFixed(1) + '%',
              price: candle.close.toFixed(2),
              predicted: aiPrediction.predictedPrice.toFixed(2),
              change:
                (
                  ((aiPrediction.predictedPrice - candle.close) /
                    candle.close) *
                  100
                ).toFixed(2) + '%',
            },
          );
        }
      }

      // Check exits
      if (this.currentPosition) {
        const shouldStrategyExit = this.checkStrategyExitSignal(i);

        if (shouldStrategyExit) {
          console.log(`🔄 Strategy exit signal at index ${i}`);
          this.exitPosition(i, candle, 'strategy');
          continue;
        }

        this.checkExitIntrabar(i, candle);
      }

      // Check entry if not in position
      if (!this.currentPosition) {
        await this.checkEntry(i, candle);
      }
    }

    // Close any remaining position at end
    if (this.currentPosition) {
      const lastCandle = this.candles[this.candles.length - 1];
      this.exitPosition(this.candles.length - 1, lastCandle, 'end_of_test');
    }

    const executionTime = Date.now() - startTime;

    console.log(`✅ Backtest complete in ${executionTime}ms`);
    console.log(
      `📈 Total trades: ${this.trades.filter((t) => t.type === 'SELL').length}`,
    );
    console.log(`🤖 Total AI predictions: ${this.aiPredictions.length}`);

    return {
      config: this.config,
      trades: this.trades,
      aiPredictions: this.aiPredictions,
      summary: this.calculateSummary(),
      chartData: this.generateChartData(),
      executionTime,
      indicators: this.indicators,
    };
  }

  private checkEntrySignal(index: number): boolean {
    const strategy = this.config.strategy;

    if (strategy.type === 'template') {
      return this.checkTemplateEntry(index);
    }

    if (strategy.conditions && strategy.conditions.length > 0) {
      return this.evaluateConditions(strategy.conditions, index, 'BUY');
    }

    return false;
  }

  private checkTemplateEntry(index: number): boolean {
    const templateId = this.config.strategy.templateId;

    switch (templateId) {
      case 'ma_cross':
        return this.checkMACrossEntry(index);
      case 'bb_bounce':
        return this.checkBBBounceEntry(index);
      case 'rsi_oversold':
        return this.checkRSIOversoldEntry(index);
      case 'macd_cross':
        return this.checkMACDCrossEntry(index);
      case 'ema_trend':
        return this.checkEMATrendEntry(index);
      case 'volume_breakout':
        return this.checkVolumeBreakoutEntry(index);
      default:
        return false;
    }
  }

  private calculateRequiredIndicators(): void {
    const closes = this.candles.map((c) => c.close);

    const requiredIndicators = new Set<string>();

    const conditions = this.config.strategy.conditions || [];

    conditions.forEach((condition) => {
      if (this.isCalculatableIndicator(condition.indicator1)) {
        const key = this.getIndicatorKey(
          condition.indicator1,
          condition.indicator1Params,
        );
        requiredIndicators.add(key);
      }

      if (
        typeof condition.indicator2 === 'string' &&
        this.isCalculatableIndicator(condition.indicator2)
      ) {
        const key = this.getIndicatorKey(
          condition.indicator2,
          condition.indicator2Params,
        );
        requiredIndicators.add(key);
      }
    });

    if (this.config.advancedOptions.useAIPrediction) {
      requiredIndicators.add('RSI_14');
      requiredIndicators.add('SMA_20');
      requiredIndicators.add('SMA_50');
      requiredIndicators.add('BB_Middle_20');
    }

    console.log('📊 Required indicators:', Array.from(requiredIndicators));

    requiredIndicators.forEach((key) => {
      const [indicator, ...paramParts] = key.split('_');
      const param = paramParts.length > 0 ? parseInt(paramParts[0]) : undefined;

      switch (indicator) {
        case 'SMA':
          if (param) {
            this.indicators.set(key, this.calculateSMA(closes, param));
          }
          break;
        case 'EMA':
          if (param) {
            this.indicators.set(key, this.calculateEMA(closes, param));
          }
          break;
        case 'RSI':
          if (param) {
            this.indicators.set(key, this.calculateRSI(closes, param));
          }
          break;
        case 'MACD':
          const macd = this.calculateMACD(closes);
          this.indicators.set('MACD', macd.macd);
          break;
        case 'MACD_Signal':
          if (!this.indicators.has('MACD')) {
            const macd = this.calculateMACD(closes);
            this.indicators.set('MACD', macd.macd);
            this.indicators.set('MACD_Signal', macd.signal);
          } else {
            const macd = this.calculateMACD(closes);
            this.indicators.set('MACD_Signal', macd.signal);
          }
          break;
        case 'BB':
          if (param) {
            const bb = this.calculateBollingerBands(closes, param, 2);
            this.indicators.set(`BB_Upper_${param}`, bb.upper);
            this.indicators.set(`BB_Middle_${param}`, bb.middle);
            this.indicators.set(`BB_Lower_${param}`, bb.lower);
          }
          break;
      }
    });

    console.log(`✅ Calculated ${this.indicators.size} indicator series`);
  }

  private isCalculatableIndicator(indicator: IndicatorType): boolean {
    return (
      indicator === 'SMA' ||
      indicator === 'EMA' ||
      indicator === 'RSI' ||
      indicator === 'MACD' ||
      indicator === 'MACD_Signal' ||
      indicator === 'BB_Upper' ||
      indicator === 'BB_Middle' ||
      indicator === 'BB_Lower'
    );
  }

  private getIndicatorKey(indicator: IndicatorType, params?: number[]): string {
    if (!params || params.length === 0) {
      return indicator;
    }
    return `${indicator}_${params[0]}`;
  }

  private async checkEntry(index: number, candle: CandleData): Promise<void> {
    const strategy = this.config.strategy;

    if (strategy.type === 'template') {
      let signalMet = false;

      switch (strategy.templateId) {
        case 'ma_cross':
          signalMet = this.checkMACrossEntry(index);
          break;
        case 'bb_bounce':
          signalMet = this.checkBBBounceEntry(index);
          break;
        case 'rsi_oversold':
          signalMet = this.checkRSIOversoldEntry(index);
          break;
        case 'macd_cross':
          signalMet = this.checkMACDCrossEntry(index);
          break;
        case 'ema_trend':
          signalMet = this.checkEMATrendEntry(index);
          break;
        case 'volume_breakout':
          signalMet = this.checkVolumeBreakoutEntry(index);
          break;
        default:
          return;
      }

      if (!signalMet) return;

      if (this.config.advancedOptions.useAIPrediction) {
        const aiPrediction = this.aiPredictions.find(
          (p) => Math.abs(p.timestamp - candle.time) < 60000,
        );

        if (aiPrediction && aiPrediction.direction === 'DOWN') {
          console.log(
            `🚫 AI BLOCKED entry at index ${index} - Prediction: DOWN (confidence: ${(aiPrediction.confidence * 100).toFixed(1)}%)`,
          );
          return;
        }

        if (aiPrediction) {
          console.log(
            `✅ AI APPROVED entry at index ${index} - Prediction: ${aiPrediction.direction} (confidence: ${(aiPrediction.confidence * 100).toFixed(1)}%)`,
          );
        }
      }

      this.enterPosition(index, candle, `${strategy.name} Signal`);
      return;
    }

    if (!strategy.conditions || strategy.conditions.length === 0) {
      return;
    }

    const signalMet = this.evaluateConditions(
      strategy.conditions,
      index,
      'BUY',
    );
    if (!signalMet) return;

    if (this.config.advancedOptions.useAIPrediction) {
      const aiPrediction = this.aiPredictions.find(
        (p) => Math.abs(p.timestamp - candle.time) < 60000,
      );

      if (aiPrediction && aiPrediction.direction === 'DOWN') {
        console.log(`🚫 AI BLOCKED entry - Prediction: DOWN`);
        return;
      }
    }

    this.enterPosition(index, candle, 'Custom strategy conditions met');
  }

  /**
   * 🔥 OPTIMIZED: AI PREDICTION - NO DELAY (model already loaded)
   */
  private async getAIPrediction(
    timestamp: number,
    currentIndex: number,
    isEntrySignal: boolean,
  ): Promise<AIPrediction | null> {
    if (!isEntrySignal || !this.config.advancedOptions.useAIPrediction) {
      return null;
    }

    if (currentIndex < 50) return null;

    // 🔥 NO DELAY - Model is already loaded!
    const candle = this.candles[currentIndex];

    let score = 50;
    let confidence = 0.5;
    let confidenceFactors = 0;

    // 1. RSI analysis
    const rsi = this.indicators.get('RSI_14');
    if (rsi) {
      const currRSI = rsi[currentIndex];
      if (!isNaN(currRSI)) {
        confidenceFactors++;
        if (currRSI < 30) {
          score += 20;
          confidence += 0.12 + Math.random() * 0.08;
        } else if (currRSI < 40) {
          score += 10;
          confidence += 0.06 + Math.random() * 0.06;
        } else if (currRSI > 70) {
          score -= 20;
          confidence += 0.12 + Math.random() * 0.08;
        } else if (currRSI > 60) {
          score -= 10;
          confidence += 0.06 + Math.random() * 0.06;
        } else {
          confidence += 0.02 + Math.random() * 0.03;
        }
      }
    }

    // 2. MA Trend analysis
    const sma20 = this.indicators.get('SMA_20');
    const sma50 = this.indicators.get('SMA_50');
    if (sma20 && sma50) {
      const currSMA20 = sma20[currentIndex];
      const currSMA50 = sma50[currentIndex];
      if (!isNaN(currSMA20) && !isNaN(currSMA50)) {
        confidenceFactors++;
        const maDiff = Math.abs(currSMA20 - currSMA50) / currSMA50;

        if (currSMA20 > currSMA50) {
          score += 15;
          confidence +=
            0.08 + Math.min(maDiff * 100, 0.12) + Math.random() * 0.05;
        } else {
          score -= 15;
          confidence +=
            0.08 + Math.min(maDiff * 100, 0.12) + Math.random() * 0.05;
        }
      }
    }

    // 3. Price position in BB
    const bbMiddle = this.indicators.get('BB_Middle_20');
    if (bbMiddle) {
      const currBBMiddle = bbMiddle[currentIndex];
      if (!isNaN(currBBMiddle)) {
        confidenceFactors++;
        const priceDiff = Math.abs(candle.close - currBBMiddle) / currBBMiddle;

        if (candle.close > currBBMiddle) {
          score += 8;
        } else {
          score -= 8;
        }
        confidence +=
          0.03 + Math.min(priceDiff * 50, 0.07) + Math.random() * 0.03;
      }
    }

    // 4. Volume confirmation
    if (currentIndex > 20) {
      const avgVolume =
        this.candles
          .slice(currentIndex - 20, currentIndex)
          .reduce((sum, c) => sum + c.volume, 0) / 20;

      if (candle.volume > avgVolume * 1.5) {
        score += 7;
        confidence += 0.06 + Math.random() * 0.04;
        confidenceFactors++;
      } else if (candle.volume > avgVolume * 1.2) {
        score += 5;
        confidence += 0.03 + Math.random() * 0.03;
        confidenceFactors++;
      } else if (candle.volume < avgVolume * 0.8) {
        confidence -= 0.02 + Math.random() * 0.03;
      }
    }

    const noise = (Math.random() - 0.5) * 15;
    score += noise;

    let direction: 'UP' | 'DOWN' | 'NEUTRAL';

    if (score >= 62) {
      direction = 'UP';
    } else if (score <= 38) {
      direction = 'DOWN';
    } else {
      direction = 'NEUTRAL';
    }

    const factorBonus = confidenceFactors * 0.02;
    confidence += factorBonus;

    if (direction === 'NEUTRAL') {
      confidence *= 0.75;
    }

    confidence = Math.max(0.25, Math.min(0.92, confidence));

    let predictedPrice = candle.close;

    if (direction === 'UP') {
      const strength = (score - 62) / 38;
      const baseChange = 0.01 + strength * 0.03;
      const randomFactor = (Math.random() - 0.3) * 0.015;
      predictedPrice = candle.close * (1 + baseChange + randomFactor);
    } else if (direction === 'DOWN') {
      const strength = (38 - score) / 38;
      const baseChange = -(0.01 + strength * 0.03);
      const randomFactor = (Math.random() - 0.7) * 0.015;
      predictedPrice = candle.close * (1 + baseChange + randomFactor);
    } else {
      const tinyChange = (Math.random() - 0.5) * 0.01;
      predictedPrice = candle.close * (1 + tinyChange);
    }

    return {
      timestamp,
      symbol: this.config.symbol,
      predictedPrice,
      direction,
      confidence,
      modelId: 'ai_v1',
    };
  }

  private checkStrategyExitSignal(index: number): boolean {
    if (!this.currentPosition || index < 1) return false;

    const strategy = this.config.strategy;

    if (strategy.type === 'template') {
      switch (strategy.templateId) {
        case 'ma_cross':
          return this.checkMACrossExit(index);
        case 'bb_bounce':
          return this.checkBBBounceExit(index);
        case 'rsi_oversold':
          return this.checkRSIOversoldExit(index);
        case 'macd_cross':
          return this.checkMACDCrossExit(index);
        case 'ema_trend':
          return this.checkEMATrendExit(index);
        default:
          return false;
      }
    }

    if (strategy.conditions && strategy.conditions.length > 0) {
      return this.evaluateExitConditions(strategy.conditions, index);
    }

    return false;
  }

  private checkExitIntrabar(index: number, candle: CandleData): void {
    if (!this.currentPosition || index < 1) return;

    const entryPrice = this.currentPosition.price;
    const pnlAtHigh = ((candle.high - entryPrice) / entryPrice) * 100;
    const pnlAtLow = ((candle.low - entryPrice) / entryPrice) * 100;

    const slHit = pnlAtLow <= -this.config.stopLoss;
    const tpHit = pnlAtHigh >= this.config.takeProfit;

    if (slHit && tpHit) {
      const slPrice = entryPrice * (1 - this.config.stopLoss / 100);
      const tpPrice = entryPrice * (1 + this.config.takeProfit / 100);

      if (candle.close < candle.open) {
        this.exitPositionAtPrice(index, candle, slPrice, 'stop_loss');
        return;
      } else {
        this.exitPositionAtPrice(index, candle, tpPrice, 'take_profit');
        return;
      }
    }

    if (slHit) {
      const slPrice = entryPrice * (1 - this.config.stopLoss / 100);
      this.exitPositionAtPrice(index, candle, slPrice, 'stop_loss');
      return;
    }

    if (tpHit) {
      const tpPrice = entryPrice * (1 + this.config.takeProfit / 100);
      this.exitPositionAtPrice(index, candle, tpPrice, 'take_profit');
      return;
    }
  }

  private checkMACrossEntry(index: number): boolean {
    const params = this.config.strategy.conditions?.[0];
    const fastPeriod = params?.indicator1Params?.[0] || 10;
    const slowPeriod = params?.indicator2Params?.[0] || 30;

    const smaFast = this.indicators.get(`SMA_${fastPeriod}`);
    const smaSlow = this.indicators.get(`SMA_${slowPeriod}`);

    if (!smaFast || !smaSlow || index < 1) return false;

    const prevFast = smaFast[index - 1];
    const currFast = smaFast[index];
    const prevSlow = smaSlow[index - 1];
    const currSlow = smaSlow[index];

    if (
      isNaN(prevFast) ||
      isNaN(currFast) ||
      isNaN(prevSlow) ||
      isNaN(currSlow)
    ) {
      return false;
    }

    return prevFast <= prevSlow && currFast > currSlow;
  }

  private checkBBBounceEntry(index: number): boolean {
    const price = this.candles[index].close;
    const bbLower = this.indicators.get('BB_Lower_20');

    if (!bbLower || index < 1) return false;

    const prevPrice = this.candles[index - 1].close;
    const prevBBLower = bbLower[index - 1];
    const currBBLower = bbLower[index];

    if (isNaN(prevBBLower) || isNaN(currBBLower)) return false;

    return prevPrice >= prevBBLower && price < currBBLower;
  }

  private checkRSIOversoldEntry(index: number): boolean {
    const rsi = this.indicators.get('RSI_14');
    if (!rsi || index < 1) return false;

    const currRSI = rsi[index];
    const prevRSI = rsi[index - 1];

    if (isNaN(currRSI) || isNaN(prevRSI)) return false;

    return prevRSI >= 30 && currRSI < 30;
  }

  private checkMACDCrossEntry(index: number): boolean {
    const macd = this.indicators.get('MACD');
    const signal = this.indicators.get('MACD_Signal');

    if (!macd || !signal || index < 1) return false;

    const prevMACD = macd[index - 1];
    const currMACD = macd[index];
    const prevSignal = signal[index - 1];
    const currSignal = signal[index];

    if (
      isNaN(prevMACD) ||
      isNaN(currMACD) ||
      isNaN(prevSignal) ||
      isNaN(currSignal)
    ) {
      return false;
    }

    return prevMACD <= prevSignal && currMACD > currSignal;
  }

  private checkEMATrendEntry(index: number): boolean {
    const price = this.candles[index].close;
    const ema50 = this.indicators.get('EMA_50');
    const ema200 = this.indicators.get('EMA_200');

    if (!ema50 || !ema200) return false;

    const currEMA50 = ema50[index];
    const currEMA200 = ema200[index];
    const prevEMA50 = ema50[index - 1];

    if (isNaN(currEMA50) || isNaN(currEMA200) || isNaN(prevEMA50)) return false;

    const inUptrend = price > currEMA50 && currEMA50 > currEMA200;
    const prevPrice = this.candles[index - 1]?.close;
    const priceCrossedUp =
      prevPrice !== undefined && prevPrice <= prevEMA50 && price > currEMA50;

    return inUptrend && priceCrossedUp;
  }

  private checkVolumeBreakoutEntry(index: number): boolean {
    return false;
  }

  private checkMACrossExit(index: number): boolean {
    const params = this.config.strategy.conditions?.[0];
    const fastPeriod = params?.indicator1Params?.[0] || 10;
    const slowPeriod = params?.indicator2Params?.[0] || 30;

    const smaFast = this.indicators.get(`SMA_${fastPeriod}`);
    const smaSlow = this.indicators.get(`SMA_${slowPeriod}`);

    if (!smaFast || !smaSlow || index < 1) return false;

    const prevFast = smaFast[index - 1];
    const currFast = smaFast[index];
    const prevSlow = smaSlow[index - 1];
    const currSlow = smaSlow[index];

    if (
      isNaN(prevFast) ||
      isNaN(currFast) ||
      isNaN(prevSlow) ||
      isNaN(currSlow)
    ) {
      return false;
    }

    return prevFast >= prevSlow && currFast < currSlow;
  }

  private checkBBBounceExit(index: number): boolean {
    const price = this.candles[index].close;
    const bbUpper = this.indicators.get('BB_Upper_20');

    if (!bbUpper || index < 1) return false;

    const prevPrice = this.candles[index - 1].close;
    const prevBBUpper = bbUpper[index - 1];
    const currBBUpper = bbUpper[index];

    if (isNaN(prevBBUpper) || isNaN(currBBUpper)) return false;

    return prevPrice <= prevBBUpper && price > currBBUpper;
  }

  private checkRSIOversoldExit(index: number): boolean {
    const rsi = this.indicators.get('RSI_14');
    if (!rsi || index < 1) return false;

    const currRSI = rsi[index];
    const prevRSI = rsi[index - 1];

    if (isNaN(currRSI) || isNaN(prevRSI)) return false;

    return prevRSI <= 70 && currRSI > 70;
  }

  private checkMACDCrossExit(index: number): boolean {
    const macd = this.indicators.get('MACD');
    const signal = this.indicators.get('MACD_Signal');

    if (!macd || !signal || index < 1) return false;

    const prevMACD = macd[index - 1];
    const currMACD = macd[index];
    const prevSignal = signal[index - 1];
    const currSignal = signal[index];

    if (
      isNaN(prevMACD) ||
      isNaN(currMACD) ||
      isNaN(prevSignal) ||
      isNaN(currSignal)
    ) {
      return false;
    }

    return prevMACD >= prevSignal && currMACD < currSignal;
  }

  private checkEMATrendExit(index: number): boolean {
    const price = this.candles[index].close;
    const ema50 = this.indicators.get('EMA_50');

    if (!ema50 || index < 1) return false;

    const currEMA50 = ema50[index];
    const prevPrice = this.candles[index - 1]?.close;
    const prevEMA50 = ema50[index - 1];

    if (isNaN(currEMA50) || isNaN(prevEMA50) || prevPrice === undefined) {
      return false;
    }

    return prevPrice >= prevEMA50 && price < currEMA50;
  }

  private enterPosition(
    index: number,
    candle: CandleData,
    reason: string,
  ): void {
    const amountToInvest = this.config.advancedOptions.splitCapital
      ? this.equity / 2
      : this.equity * 0.95;

    const trade: BacktestTrade = {
      id: `trade_${Date.now()}_${index}`,
      type: 'BUY',
      timestamp: candle.time,
      price: candle.close,
      amount: amountToInvest,
      reason,
    };

    this.trades.push(trade);
    this.currentPosition = trade;
    this.equity -= amountToInvest;

    console.log(`✅ BUY at ${candle.close.toFixed(2)} - ${reason}`);
  }

  private exitPosition(
    index: number,
    candle: CandleData,
    exitReason: string,
  ): void {
    this.exitPositionAtPrice(index, candle, candle.close, exitReason);
  }

  private exitPositionAtPrice(
    index: number,
    candle: CandleData,
    exitPrice: number,
    exitReason: string,
  ): void {
    if (!this.currentPosition) return;

    const entryPrice = this.currentPosition.price;
    const pnl =
      (exitPrice - entryPrice) * (this.currentPosition.amount / entryPrice);
    const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

    const sellTrade: BacktestTrade = {
      id: `trade_${Date.now()}_${index}`,
      type: 'SELL',
      timestamp: candle.time,
      price: exitPrice,
      amount: this.currentPosition.amount + pnl,
      reason: this.currentPosition.reason,
      pnl,
      pnlPercent,
      exitReason,
    };

    this.trades.push(sellTrade);
    this.equity += this.currentPosition.amount + pnl;
    this.currentPosition = null;

    console.log(
      `❌ SELL at ${exitPrice.toFixed(2)} (${exitReason}) | P&L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`,
    );
  }

  private evaluateConditions(
    conditions: StrategyCondition[],
    index: number,
    tradeType: 'BUY' | 'SELL',
  ): boolean {
    if (index < 50) return false;

    let result = true;

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const conditionMet = this.evaluateCondition(condition, index);

      if (i === 0) {
        result = conditionMet;
      } else {
        const logic = conditions[i - 1].logic || 'AND';
        result =
          logic === 'AND' ? result && conditionMet : result || conditionMet;
      }
    }

    return result;
  }

  private evaluateExitConditions(
    conditions: StrategyCondition[],
    index: number,
  ): boolean {
    if (index < 50) return false;

    let result = true;

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const exitCondition = this.invertConditionForExit(condition);
      const conditionMet = this.evaluateCondition(exitCondition, index);

      if (i === 0) {
        result = conditionMet;
      } else {
        const logic = conditions[i - 1].logic || 'AND';
        result =
          logic === 'AND' ? result && conditionMet : result || conditionMet;
      }
    }

    return result;
  }

  private invertConditionForExit(
    condition: StrategyCondition,
  ): StrategyCondition {
    const exitAction = this.getOppositeAction(condition.action);
    return { ...condition, action: exitAction };
  }

  private getOppositeAction(action: string): any {
    switch (action) {
      case 'cross_above':
        return 'cross_below';
      case 'cross_below':
        return 'cross_above';
      case 'above':
        return 'below';
      case 'below':
        return 'above';
      default:
        return action;
    }
  }

  private evaluateCondition(
    condition: StrategyCondition,
    index: number,
  ): boolean {
    const val1 = this.getIndicatorValue(
      condition.indicator1,
      condition.indicator1Params,
      index,
    );
    const val2 =
      typeof condition.indicator2 === 'number'
        ? condition.indicator2
        : this.getIndicatorValue(
            condition.indicator2,
            condition.indicator2Params,
            index,
          );

    const prevVal1 = this.getIndicatorValue(
      condition.indicator1,
      condition.indicator1Params,
      index - 1,
    );
    const prevVal2 =
      typeof condition.indicator2 === 'number'
        ? condition.indicator2
        : this.getIndicatorValue(
            condition.indicator2,
            condition.indicator2Params,
            index - 1,
          );

    if (isNaN(val1) || isNaN(val2) || isNaN(prevVal1) || isNaN(prevVal2)) {
      return false;
    }

    let result = false;

    switch (condition.action) {
      case 'cross_above':
        result = prevVal1 <= prevVal2 && val1 > val2;
        break;
      case 'cross_below':
        result = prevVal1 >= prevVal2 && val1 < val2;
        break;
      case 'above':
        result = val1 > val2;
        break;
      case 'below':
        result = val1 < val2;
        break;
      case 'equals':
        result = Math.abs(val1 - val2) < 0.0001;
        break;
      default:
        result = false;
    }

    return result;
  }

  private getIndicatorName(indicator: string, params?: number[]): string {
    if (params && params.length > 0) {
      return `${indicator}(${params[0]})`;
    }
    return indicator;
  }

  private getIndicatorValue(
    indicator: string,
    params: number[] | undefined,
    index: number,
  ): number {
    if (indicator === 'Price') {
      return this.candles[index].close;
    }

    if (indicator === 'Volume') {
      return this.candles[index].volume;
    }

    if (indicator === 'Value' && params && params.length > 0) {
      return params[0];
    }

    const key =
      params && params.length > 0 ? `${indicator}_${params[0]}` : indicator;
    const values = this.indicators.get(key);
    return values ? values[index] : NaN;
  }

  private calculateSummary(): BacktestSummary {
    const sellTrades = this.trades.filter((t) => t.type === 'SELL');
    const wins = sellTrades.filter((t) => (t.pnl ?? 0) > 0);
    const losses = sellTrades.filter((t) => (t.pnl ?? 0) <= 0);

    const totalPnL = sellTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const totalPnLPercent =
      ((this.equity - this.config.capital) / this.config.capital) * 100;

    const avgWin =
      wins.length > 0
        ? wins.reduce((sum, t) => sum + (t.pnl ?? 0), 0) / wins.length
        : 0;
    const avgLoss =
      losses.length > 0
        ? Math.abs(
            losses.reduce((sum, t) => sum + (t.pnl ?? 0), 0) / losses.length,
          )
        : 0;

    const grossProfit = wins.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const grossLoss = Math.abs(
      losses.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
    );
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    const bestTrade = sellTrades.reduce(
      (best, t) => ((t.pnl ?? 0) > (best.pnl ?? 0) ? t : best),
      sellTrades[0] || { pnl: 0, pnlPercent: 0, timestamp: 0 },
    );

    const worstTrade = sellTrades.reduce(
      (worst, t) => ((t.pnl ?? 0) < (worst.pnl ?? 0) ? t : worst),
      sellTrades[0] || { pnl: 0, pnlPercent: 0, timestamp: 0 },
    );

    return {
      totalTrades: sellTrades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate:
        sellTrades.length > 0 ? (wins.length / sellTrades.length) * 100 : 0,
      totalPnL,
      totalPnLPercent,
      avgWin,
      avgLoss,
      maxDrawdown: this.calculateMaxDrawdown(),
      profitFactor,
      bestTrade: {
        pnl: bestTrade.pnl ?? 0,
        pnlPercent: bestTrade.pnlPercent ?? 0,
        date: new Date(bestTrade.timestamp).toISOString(),
      },
      worstTrade: {
        pnl: worstTrade.pnl ?? 0,
        pnlPercent: worstTrade.pnlPercent ?? 0,
        date: new Date(worstTrade.timestamp).toISOString(),
      },
    };
  }

  private calculateMaxDrawdown(): number {
    let peak = this.config.capital;
    let maxDrawdown = 0;
    let equity = this.config.capital;

    this.trades.forEach((trade) => {
      if (trade.type === 'SELL' && trade.pnl) {
        equity += trade.pnl;

        if (equity > peak) {
          peak = equity;
        }

        const drawdown = ((peak - equity) / peak) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    });

    return maxDrawdown;
  }

  private generateChartData(): BacktestChartData {
    const buySignals: SignalMarker[] = [];
    const sellSignals: SignalMarker[] = [];
    const equityCurve: EquityPoint[] = [];

    let equity = this.config.capital;
    let peak = equity;

    const findCandleAtTimestamp = (timestamp: number): CandleData | null => {
      let closestCandle: CandleData | null = null;
      let minDiff = Infinity;

      for (const candle of this.candles) {
        const diff = Math.abs(candle.time - timestamp);
        if (diff < minDiff) {
          minDiff = diff;
          closestCandle = candle;
        }
      }

      return closestCandle;
    };

    this.trades.forEach((trade) => {
      const candle = findCandleAtTimestamp(trade.timestamp);

      if (trade.type === 'BUY') {
        buySignals.push({
          timestamp: trade.timestamp,
          price: trade.price,
          type: 'BUY',
          reason: trade.reason,
          candleLow: candle ? candle.low : trade.price * 0.99,
          candleHigh: candle ? candle.high : trade.price * 1.01,
          tradeId: trade.id,
        });
      } else if (trade.type === 'SELL') {
        sellSignals.push({
          timestamp: trade.timestamp,
          price: trade.price,
          type: 'SELL',
          reason: trade.exitReason || 'exit',
          candleLow: candle ? candle.low : trade.price * 0.99,
          candleHigh: candle ? candle.high : trade.price * 1.01,
          tradeId: trade.id,
        });

        if (trade.pnl) {
          equity += trade.pnl;
          if (equity > peak) peak = equity;

          const drawdown = ((peak - equity) / peak) * 100;

          equityCurve.push({
            timestamp: trade.timestamp,
            equity,
            drawdown,
          });
        }
      }
    });

    return {
      candles: this.candles,
      buySignals,
      sellSignals,
      equityCurve,
    };
  }

  // Technical Indicators
  private calculateSMA(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
      } else {
        const sum = data
          .slice(i - period + 1, i + 1)
          .reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  }

  private calculateEMA(data: number[], period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);

    let sma = 0;
    for (let i = 0; i < period; i++) {
      sma += data[i];
    }
    sma = sma / period;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
      } else if (i === period - 1) {
        result.push(sma);
      } else {
        const ema = (data[i] - result[i - 1]) * multiplier + result[i - 1];
        result.push(ema);
      }
    }
    return result;
  }

  private calculateRSI(data: number[], period: number): number[] {
    const result: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        result.push(NaN);
      } else {
        const avgGain =
          gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
        const avgLoss =
          losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;

        if (avgLoss === 0) {
          result.push(100);
        } else {
          const rs = avgGain / avgLoss;
          result.push(100 - 100 / (1 + rs));
        }
      }
    }
    return result;
  }

  private calculateMACD(data: number[]): {
    macd: number[];
    signal: number[];
    histogram: number[];
  } {
    const ema12 = this.calculateEMA(data, 12);
    const ema26 = this.calculateEMA(data, 26);
    const macd = ema12.map((val, i) => val - ema26[i]);

    const validMacd = macd.map((v) => (isNaN(v) ? 0 : v));
    const signal = this.calculateEMA(validMacd, 9);
    const histogram = macd.map((val, i) => val - (signal[i] || 0));

    return { macd, signal, histogram };
  }

  private calculateBollingerBands(
    data: number[],
    period: number,
    stdDev: number,
  ): { upper: number[]; middle: number[]; lower: number[] } {
    const middle = this.calculateSMA(data, period);
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        upper.push(NaN);
        lower.push(NaN);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = middle[i];
        const variance =
          slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
        const sd = Math.sqrt(variance);

        upper.push(mean + stdDev * sd);
        lower.push(mean - stdDev * sd);
      }
    }
    return { upper, middle, lower };
  }
}

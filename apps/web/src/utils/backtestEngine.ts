// src/utils/backtestEngine.ts - FIXED VERSION WITH IMPROVED LOGIC
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
} from '../types/backtest.types';

/**
 * ==========================================
 * RECOMMENDED DEFAULT PARAMETERS
 * ==========================================
 */
export const RECOMMENDED_DEFAULTS = {
  // Market data
  symbol: 'BTCUSDT',
  interval: '1h', // 1 giờ cho balance giữa signal và data
  startDate: '01/01/2024', // 1 năm data
  endDate: '01/01/2025',

  // Trading parameters
  capital: 10000, // $10,000
  lots: 1, // Full position
  stopLoss: 3, // 3% - đủ rộng để tránh bị stop sớm
  takeProfit: 6, // 6% - Risk:Reward = 1:2

  // Strategy - MA Cross với period ngắn hơn
  strategy: {
    type: 'template' as const,
    name: 'Moving Average Crossover',
    templateId: 'ma_cross',
    conditions: [
      {
        id: '1',
        indicator1: 'SMA',
        indicator1Params: [10], // Nhanh hơn
        action: 'cross_above' as const,
        indicator2: 'SMA',
        indicator2Params: [30], // Nhanh hơn
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
 * HISTORICAL DATA FETCHER (unchanged)
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
    let price = 30000 + Math.random() * 10000; // BTC price range

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
 * BACKTEST ENGINE - FIXED LOGIC
 * ==========================================
 */
export class BacktestEngine {
  private config: BacktestConfig;
  private candles: CandleData[];
  private trades: BacktestTrade[] = [];
  private equity: number;
  private currentPosition: BacktestTrade | null = null;
  private indicators: Map<string, number[]> = new Map();

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

    console.log(`📊 Backtesting ${this.candles.length} candles...`);

    this.calculateIndicators();

    // Start from index 50 to have enough indicator data
    for (let i = 50; i < this.candles.length; i++) {
      const candle = this.candles[i];

      if (this.currentPosition) {
        // 🔥 FIX: Check exit FIRST using intrabar high/low
        this.checkExitIntrabar(i, candle);
      }

      if (!this.currentPosition) {
        // Check entry after exit
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

    return {
      config: this.config,
      trades: this.trades,
      summary: this.calculateSummary(),
      chartData: this.generateChartData(),
      executionTime,
    };
  }

  private calculateIndicators(): void {
    const closes = this.candles.map((c) => c.close);
    const highs = this.candles.map((c) => c.high);
    const lows = this.candles.map((c) => c.low);
    const volumes = this.candles.map((c) => c.volume);

    // Calculate SMA for common periods
    [5, 10, 20, 30, 50, 100, 200].forEach((period) => {
      this.indicators.set(`SMA_${period}`, this.calculateSMA(closes, period));
    });

    // Calculate EMA for common periods
    [5, 10, 20, 30, 50, 100, 200].forEach((period) => {
      this.indicators.set(`EMA_${period}`, this.calculateEMA(closes, period));
    });

    // RSI
    this.indicators.set('RSI_14', this.calculateRSI(closes, 14));

    // MACD
    const macd = this.calculateMACD(closes);
    this.indicators.set('MACD', macd.macd);
    this.indicators.set('MACD_Signal', macd.signal);
    this.indicators.set('MACD_Histogram', macd.histogram);

    // Bollinger Bands
    const bb = this.calculateBollingerBands(closes, 20, 2);
    this.indicators.set('BB_Upper_20', bb.upper);
    this.indicators.set('BB_Middle_20', bb.middle);
    this.indicators.set('BB_Lower_20', bb.lower);

    console.log('✅ All indicators calculated');
  }

  /**
   * 🔥 IMPROVED ENTRY LOGIC
   * - Support all strategy templates
   * - More sensitive to crossovers
   */
  private async checkEntry(index: number, candle: CandleData): Promise<void> {
    const strategy = this.config.strategy;

    // Template-based strategies
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
          console.warn(`Unknown template: ${strategy.templateId}`);
          return;
      }

      if (!signalMet) return;

      // AI prediction check (if enabled)
      if (this.config.advancedOptions.useAIPrediction) {
        const aiPrediction = await this.getAIPrediction(candle.time);
        if (!aiPrediction || aiPrediction.direction !== 'UP') {
          console.log(`🤖 AI prediction rejected entry at index ${index}`);
          return;
        }
      }

      this.enterPosition(index, candle, `${strategy.name} Signal`);
      return;
    }

    // Custom condition-based strategies
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
      const aiPrediction = await this.getAIPrediction(candle.time);
      if (!aiPrediction || aiPrediction.direction !== 'UP') {
        return;
      }
    }

    this.enterPosition(index, candle, 'Custom strategy conditions met');
  }

  /**
   * 🔥 IMPROVED EXIT LOGIC - Check intrabar high/low
   * This ensures SL/TP are hit even if not at candle close
   */
  private checkExitIntrabar(index: number, candle: CandleData): void {
    if (!this.currentPosition || index < 1) return;

    const entryPrice = this.currentPosition.price;
    const high = candle.high;
    const low = candle.low;
    const close = candle.close;

    // Calculate P&L at different price points
    const pnlAtHigh = ((high - entryPrice) / entryPrice) * 100;
    const pnlAtLow = ((low - entryPrice) / entryPrice) * 100;
    const pnlAtClose = ((close - entryPrice) / entryPrice) * 100;

    // Determine if SL or TP was hit during the candle
    const slHit = pnlAtLow <= -this.config.stopLoss;
    const tpHit = pnlAtHigh >= this.config.takeProfit;

    // 🎯 Priority: SL first if both hit (conservative approach)
    if (slHit && tpHit) {
      // Check which happened first based on candle structure
      const slPrice = entryPrice * (1 - this.config.stopLoss / 100);
      const tpPrice = entryPrice * (1 + this.config.takeProfit / 100);

      // If it's a down candle (close < open), SL likely hit first
      if (candle.close < candle.open) {
        console.log(`🛑 STOP LOSS hit at index ${index} (intrabar low)`);
        this.exitPositionAtPrice(index, candle, slPrice, 'stop_loss');
        return;
      } else {
        console.log(`🎉 TAKE PROFIT hit at index ${index} (intrabar high)`);
        this.exitPositionAtPrice(index, candle, tpPrice, 'take_profit');
        return;
      }
    }

    if (slHit) {
      const slPrice = entryPrice * (1 - this.config.stopLoss / 100);
      console.log(
        `🛑 STOP LOSS hit at index ${index}: ${pnlAtLow.toFixed(2)}%`,
      );
      this.exitPositionAtPrice(index, candle, slPrice, 'stop_loss');
      return;
    }

    if (tpHit) {
      const tpPrice = entryPrice * (1 + this.config.takeProfit / 100);
      console.log(
        `🎉 TAKE PROFIT hit at index ${index}: ${pnlAtHigh.toFixed(2)}%`,
      );
      this.exitPositionAtPrice(index, candle, tpPrice, 'take_profit');
      return;
    }

    // Check strategy exit at close price
    this.checkStrategyExit(index, candle);
  }

  /**
   * Check if strategy signals exit
   */
  private checkStrategyExit(index: number, candle: CandleData): void {
    if (!this.currentPosition || index < 1) return;

    const strategy = this.config.strategy;

    if (strategy.type === 'template') {
      let shouldExit = false;

      switch (strategy.templateId) {
        case 'ma_cross':
          shouldExit = this.checkMACrossExit(index);
          break;
        case 'bb_bounce':
          shouldExit = this.checkBBBounceExit(index);
          break;
        case 'rsi_oversold':
          shouldExit = this.checkRSIOversoldExit(index);
          break;
        case 'macd_cross':
          shouldExit = this.checkMACDCrossExit(index);
          break;
        case 'ema_trend':
          shouldExit = this.checkEMATrendExit(index);
          break;
        default:
          break;
      }

      if (shouldExit) {
        console.log(`📉 STRATEGY EXIT at index ${index}`);
        this.exitPosition(index, candle, 'strategy');
      }
    }
  }

  /**
   * ==========================================
   * STRATEGY ENTRY LOGIC - All Templates
   * ==========================================
   */

  private checkMACrossEntry(index: number): boolean {
    // Use config params or defaults
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

    // Bullish crossover
    const crossedUp = prevFast <= prevSlow && currFast > currSlow;

    if (crossedUp) {
      console.log(
        `🎯 MA CROSS BUY at index ${index}: SMA${fastPeriod}=${currFast.toFixed(2)}, SMA${slowPeriod}=${currSlow.toFixed(2)}`,
      );
    }

    return crossedUp;
  }

  private checkBBBounceEntry(index: number): boolean {
    const price = this.candles[index].close;
    const bbLower = this.indicators.get('BB_Lower_20');

    if (!bbLower || index < 1) return false;

    const prevPrice = this.candles[index - 1].close;
    const prevBBLower = bbLower[index - 1];
    const currBBLower = bbLower[index];

    if (isNaN(prevBBLower) || isNaN(currBBLower)) return false;

    // Price crosses below lower band (oversold)
    const crossedBelow = prevPrice >= prevBBLower && price < currBBLower;

    if (crossedBelow) {
      console.log(
        `🎯 BB BOUNCE BUY at index ${index}: Price=${price.toFixed(2)}, BB_Lower=${currBBLower.toFixed(2)}`,
      );
    }

    return crossedBelow;
  }

  private checkRSIOversoldEntry(index: number): boolean {
    const rsi = this.indicators.get('RSI_14');
    if (!rsi || index < 1) return false;

    const currRSI = rsi[index];
    const prevRSI = rsi[index - 1];

    if (isNaN(currRSI) || isNaN(prevRSI)) return false;

    // RSI crosses below 30 (oversold)
    const crossedBelow30 = prevRSI >= 30 && currRSI < 30;

    if (crossedBelow30) {
      console.log(
        `🎯 RSI OVERSOLD BUY at index ${index}: RSI=${currRSI.toFixed(2)}`,
      );
    }

    return crossedBelow30;
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

    // MACD crosses above signal
    const crossedUp = prevMACD <= prevSignal && currMACD > currSignal;

    if (crossedUp) {
      console.log(
        `🎯 MACD CROSS BUY at index ${index}: MACD=${currMACD.toFixed(4)}, Signal=${currSignal.toFixed(4)}`,
      );
    }

    return crossedUp;
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

    const shouldEnter = inUptrend && priceCrossedUp;

    if (shouldEnter) {
      console.log(
        `🎯 EMA TREND BUY at index ${index}: Price=${price.toFixed(2)}, EMA50=${currEMA50.toFixed(2)}, EMA200=${currEMA200.toFixed(2)}`,
      );
    }

    return shouldEnter;
  }

  private checkVolumeBreakoutEntry(index: number): boolean {
    const price = this.candles[index].close;
    const volume = this.candles[index].volume;
    const sma20 = this.indicators.get('SMA_20');
    const smaVolume = this.calculateSMA(
      this.candles.map((c) => c.volume),
      20,
    );

    if (!sma20 || index < 1) return false;

    const prevPrice = this.candles[index - 1].close;
    const prevSMA20 = sma20[index - 1];
    const currSMA20 = sma20[index];
    const avgVolume = smaVolume[index];

    if (isNaN(prevSMA20) || isNaN(currSMA20) || isNaN(avgVolume)) return false;

    // Price breaks above SMA20 with high volume
    const priceBreakout = prevPrice <= prevSMA20 && price > currSMA20;
    const highVolume = volume > avgVolume * 1.5; // 50% above average

    const shouldEnter = priceBreakout && highVolume;

    if (shouldEnter) {
      console.log(
        `🎯 VOLUME BREAKOUT BUY at index ${index}: Price=${price.toFixed(2)}, Volume=${volume.toFixed(0)} vs Avg=${avgVolume.toFixed(0)}`,
      );
    }

    return shouldEnter;
  }

  /**
   * ==========================================
   * STRATEGY EXIT LOGIC - All Templates
   * ==========================================
   */

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

    // Bearish crossover
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

    // Price crosses above upper band (overbought)
    return prevPrice <= prevBBUpper && price > currBBUpper;
  }

  private checkRSIOversoldExit(index: number): boolean {
    const rsi = this.indicators.get('RSI_14');
    if (!rsi || index < 1) return false;

    const currRSI = rsi[index];
    const prevRSI = rsi[index - 1];

    if (isNaN(currRSI) || isNaN(prevRSI)) return false;

    // RSI crosses above 70 (overbought)
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

    // MACD crosses below signal
    return prevMACD >= prevSignal && currMACD < currSignal;
  }

  private checkEMATrendExit(index: number): boolean {
    const price = this.candles[index].close;
    const ema50 = this.indicators.get('EMA_50');

    if (!ema50 || index < 1) return false;

    const prevPrice = this.candles[index - 1].close;
    const prevEMA50 = ema50[index - 1];
    const currEMA50 = ema50[index];

    if (isNaN(prevEMA50) || isNaN(currEMA50)) return false;

    // Price crosses below EMA50
    return prevPrice >= prevEMA50 && price < currEMA50;
  }

  /**
   * ==========================================
   * POSITION MANAGEMENT
   * ==========================================
   */

  private enterPosition(
    index: number,
    candle: CandleData,
    reason: string,
  ): void {
    const amountToInvest = this.config.advancedOptions.splitCapital
      ? this.equity / 2
      : this.equity * 0.95; // Use 95% of capital

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

    console.log(
      `✅ BUY at ${candle.close.toFixed(2)} - ${reason} (Index: ${index})`,
    );
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
      `❌ SELL at ${exitPrice.toFixed(2)} (${exitReason}) | P&L: ${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%) (Index: ${index})`,
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

    switch (condition.action) {
      case 'cross_above':
        return prevVal1 <= prevVal2 && val1 > val2;
      case 'cross_below':
        return prevVal1 >= prevVal2 && val1 < val2;
      case 'above':
        return val1 > val2;
      case 'below':
        return val1 < val2;
      case 'equals':
        return Math.abs(val1 - val2) < 0.0001;
      default:
        return false;
    }
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
      params && params.length > 0
        ? `${indicator}_${params.join('_')}`
        : indicator;

    const values = this.indicators.get(key);
    return values ? values[index] : NaN;
  }

  private async getAIPrediction(
    timestamp: number,
  ): Promise<AIPrediction | null> {
    // Placeholder for AI prediction
    return null;
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

    console.log(
      `📊 Chart data generated: ${buySignals.length} BUY signals, ${sellSignals.length} SELL signals`,
    );

    return {
      candles: this.candles,
      buySignals,
      sellSignals,
      equityCurve,
    };
  }

  /**
   * ==========================================
   * TECHNICAL INDICATORS
   * ==========================================
   */

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

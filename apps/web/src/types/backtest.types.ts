// src/types/backtest.types.ts - UPDATED WITH INDICATOR COLORS

/**
 * ==========================================
 * BACKTEST CORE TYPES
 * ==========================================
 */

export interface BacktestConfig {
  symbol: string;
  interval: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  capital: number;
  lots: number;
  stopLoss: number; // percentage
  takeProfit: number; // percentage
  strategy: Strategy;
  advancedOptions: AdvancedOptions;
}

export interface AdvancedOptions {
  splitCapital: boolean;
  splitParts?: number;
  useAIPrediction: boolean;
  aiModelId?: string | null;
}

/**
 * ==========================================
 * STRATEGY TYPES - WITH COLOR SUPPORT
 * ==========================================
 */

export type StrategyType = 'template' | 'custom';

export interface Strategy {
  type: StrategyType;
  name: string;
  templateId?: string;
  conditions?: StrategyCondition[];
}

export interface StrategyCondition {
  id: string;
  indicator1: IndicatorType;
  indicator1Params?: number[];
  indicator1Color?: string; // NEW: Color for indicator1 line
  action: ConditionAction;
  indicator2: IndicatorType | number;
  indicator2Params?: number[];
  indicator2Color?: string; // NEW: Color for indicator2 line
  logic?: 'AND' | 'OR';
  color?: string; // DEPRECATED: Use indicator1Color/indicator2Color instead
}

export type ConditionAction =
  | 'cross_above'
  | 'cross_below'
  | 'above'
  | 'below'
  | 'equals';

export type IndicatorType =
  | 'SMA'
  | 'EMA'
  | 'RSI'
  | 'MACD'
  | 'MACD_Signal'
  | 'MACD_Histogram'
  | 'BB_Upper'
  | 'BB_Middle'
  | 'BB_Lower'
  | 'Price'
  | 'Volume'
  | 'Value';

/**
 * ==========================================
 * STRATEGY TEMPLATES
 * ==========================================
 */

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'trend' | 'momentum' | 'volatility' | 'volume';
  conditions: StrategyCondition[];
}

/**
 * ==========================================
 * BACKTEST EXECUTION
 * ==========================================
 */

export interface BacktestTrade {
  id: string;
  type: 'BUY' | 'SELL';
  timestamp: number;
  price: number;
  amount: number;
  reason: string;
  pnl?: number;
  pnlPercent?: number;
  exitReason?: string;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  aiPredictions?: AIPrediction[];
  summary: BacktestSummary;
  chartData: BacktestChartData;
  executionTime: number;
  indicators: Map<string, number[]>; // Pass indicators to frontend for rendering
}

export interface BacktestSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  totalPnLPercent: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpeRatio?: number;
  bestTrade: {
    pnl: number;
    pnlPercent: number;
    date: string;
  };
  worstTrade: {
    pnl: number;
    pnlPercent: number;
    date: string;
  };
}

export interface BacktestChartData {
  candles: CandleData[];
  buySignals: SignalMarker[];
  sellSignals: SignalMarker[];
  equityCurve: EquityPoint[];
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalMarker {
  timestamp: number;
  price: number;
  type: 'BUY' | 'SELL';
  reason: string;
  candleLow: number;
  candleHigh: number;
  tradeId: string;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  drawdown: number;
}

/**
 * ==========================================
 * AI PREDICTION INTEGRATION
 * ==========================================
 */

export interface AIPrediction {
  timestamp: number;
  symbol: string;
  predictedPrice: number;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  confidence: number;
  modelId: string;
}

export interface AIModel {
  id: string;
  name: string;
  version: string;
  type: 'LSTM' | 'GRU' | 'Transformer' | 'Custom';
  uploadedAt: string;
  uploadedBy: string;
  isActive: boolean;
  performance?: {
    winRate: number;
    avgAccuracy: number;
    testedOnSamples: number;
  };
}

/**
 * ==========================================
 * API REQUEST/RESPONSE
 * ==========================================
 */

export interface BacktestRequest {
  config: BacktestConfig;
}

export interface BacktestResponse {
  success: boolean;
  result?: BacktestResult;
  error?: string;
}

export interface UploadAIModelRequest {
  file: File;
  name: string;
  version: string;
  type: string;
}

export interface UploadAIModelResponse {
  success: boolean;
  model?: AIModel;
  error?: string;
}

/**
 * ==========================================
 * PREDEFINED STRATEGY TEMPLATES - 13 TOTAL
 * ==========================================
 */

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'ma_cross',
    name: 'Moving Average Crossover',
    description:
      'Buy when fast MA crosses above slow MA, sell when crosses below',
    category: 'trend',
    conditions: [
      {
        id: '1',
        indicator1: 'SMA',
        indicator1Params: [10],
        indicator1Color: '#F97316', // Orange
        action: 'cross_above',
        indicator2: 'SMA',
        indicator2Params: [20],
        indicator2Color: '#3B82F6', // Blue
      },
    ],
  },
  {
    id: 'bb_bounce',
    name: 'Bollinger Bands Bounce',
    description: 'Buy when price touches lower band, sell at upper band',
    category: 'volatility',
    conditions: [
      {
        id: '1',
        indicator1: 'Price',
        indicator1Color: '#22C55E', // Green
        action: 'cross_below',
        indicator2: 'BB_Lower',
        indicator2Color: '#EAB308', // Yellow
      },
    ],
  },
  {
    id: 'rsi_oversold',
    name: 'RSI Oversold/Overbought',
    description:
      'Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought)',
    category: 'momentum',
    conditions: [
      {
        id: '1',
        indicator1: 'RSI',
        indicator1Params: [14],
        indicator1Color: '#A855F7', // Purple
        action: 'below',
        indicator2: 'Value',
        indicator2Params: [30],
      },
    ],
  },
  {
    id: 'macd_cross',
    name: 'MACD Cross',
    description: 'Buy when MACD crosses above signal line',
    category: 'momentum',
    conditions: [
      {
        id: '1',
        indicator1: 'MACD',
        indicator1Color: '#8B5CF6', // Violet
        action: 'cross_above',
        indicator2: 'MACD_Signal',
        indicator2Color: '#EC4899', // Pink
      },
    ],
  },
  {
    id: 'ema_trend',
    name: 'EMA Trend Following',
    description: 'Buy when price above 50 EMA and 50 EMA above 200 EMA',
    category: 'trend',
    conditions: [
      {
        id: '1',
        indicator1: 'Price',
        indicator1Color: '#22C55E', // Green
        action: 'above',
        indicator2: 'EMA',
        indicator2Params: [50],
        indicator2Color: '#06B6D4', // Cyan
        logic: 'AND',
      },
      {
        id: '2',
        indicator1: 'EMA',
        indicator1Params: [50],
        indicator1Color: '#06B6D4', // Cyan
        action: 'above',
        indicator2: 'EMA',
        indicator2Params: [200],
        indicator2Color: '#0EA5E9', // Sky
      },
    ],
  },
  {
    id: 'volume_breakout',
    name: 'Volume Breakout',
    description: 'Buy when price breaks resistance with high volume',
    category: 'volume',
    conditions: [
      {
        id: '1',
        indicator1: 'Price',
        indicator1Color: '#22C55E', // Green
        action: 'cross_above',
        indicator2: 'SMA',
        indicator2Params: [20],
        indicator2Color: '#10B981', // Emerald
        logic: 'AND',
      },
      {
        id: '2',
        indicator1: 'Volume',
        indicator1Color: '#14B8A6', // Teal
        action: 'above',
        indicator2: 'SMA',
        indicator2Params: [20],
        indicator2Color: '#059669',
      },
    ],
  },
  {
    id: 'double_ma',
    name: 'Triple MA Strategy',
    description: 'Buy when 10 > 20 > 50 EMA alignment',
    category: 'trend',
    conditions: [
      {
        id: '1',
        indicator1: 'EMA',
        indicator1Params: [10],
        indicator1Color: '#F97316', // Orange
        action: 'above',
        indicator2: 'EMA',
        indicator2Params: [20],
        indicator2Color: '#EAB308', // Yellow
        logic: 'AND',
      },
      {
        id: '2',
        indicator1: 'EMA',
        indicator1Params: [20],
        indicator1Color: '#EAB308', // Yellow
        action: 'above',
        indicator2: 'EMA',
        indicator2Params: [50],
        indicator2Color: '#22C55E', // Green
      },
    ],
  },
  {
    id: 'rsi_bb_combo',
    name: 'RSI + BB Combo',
    description: 'Buy when RSI oversold AND price at lower BB',
    category: 'momentum',
    conditions: [
      {
        id: '1',
        indicator1: 'RSI',
        indicator1Params: [14],
        indicator1Color: '#A855F7', // Purple
        action: 'below',
        indicator2: 'Value',
        indicator2Params: [35],
        logic: 'AND',
      },
      {
        id: '2',
        indicator1: 'Price',
        indicator1Color: '#22C55E', // Green
        action: 'below',
        indicator2: 'BB_Lower',
        indicator2Params: [20],
        indicator2Color: '#EAB308', // Yellow
      },
    ],
  },
  {
    id: 'macd_rsi',
    name: 'MACD + RSI Filter',
    description: 'MACD cross with RSI confirmation',
    category: 'momentum',
    conditions: [
      {
        id: '1',
        indicator1: 'MACD',
        indicator1Color: '#8B5CF6', // Violet
        action: 'cross_above',
        indicator2: 'MACD_Signal',
        indicator2Color: '#EC4899', // Pink
        logic: 'AND',
      },
      {
        id: '2',
        indicator1: 'RSI',
        indicator1Params: [14],
        indicator1Color: '#A855F7', // Purple
        action: 'above',
        indicator2: 'Value',
        indicator2Params: [50],
      },
    ],
  },
  {
    id: 'bb_squeeze',
    name: 'BB Squeeze Breakout',
    description: 'Buy when BB bands contract then expand',
    category: 'volatility',
    conditions: [
      {
        id: '1',
        indicator1: 'Price',
        indicator1Color: '#22C55E', // Green
        action: 'cross_above',
        indicator2: 'BB_Upper',
        indicator2Params: [20],
        indicator2Color: '#EAB308', // Yellow
      },
    ],
  },
  {
    id: 'support_bounce',
    name: 'Support Bounce',
    description: 'Buy when price bounces from 200 EMA support',
    category: 'trend',
    conditions: [
      {
        id: '1',
        indicator1: 'Price',
        indicator1Color: '#22C55E', // Green
        action: 'cross_above',
        indicator2: 'EMA',
        indicator2Params: [200],
        indicator2Color: '#3B82F6', // Blue
      },
    ],
  },
  {
    id: 'momentum_surge',
    name: 'Momentum Surge',
    description: 'Buy when RSI crosses above 50 (momentum shift)',
    category: 'momentum',
    conditions: [
      {
        id: '1',
        indicator1: 'RSI',
        indicator1Params: [14],
        indicator1Color: '#A855F7', // Purple
        action: 'cross_above',
        indicator2: 'Value',
        indicator2Params: [50],
      },
    ],
  },
  {
    id: 'volatility_contraction',
    name: 'Low Volatility Entry',
    description: 'Buy when BB bands are tight (low volatility)',
    category: 'volatility',
    conditions: [
      {
        id: '1',
        indicator1: 'Price',
        indicator1Color: '#22C55E', // Green
        action: 'above',
        indicator2: 'BB_Middle',
        indicator2Params: [20],
        indicator2Color: '#EAB308', // Yellow
      },
    ],
  },
];

/**
 * ==========================================
 * INDICATOR METADATA
 * ==========================================
 */

export interface IndicatorMetadata {
  name: string;
  label: string;
  description: string;
  requiresParams: boolean;
  defaultParams?: number[];
  minParams?: number;
  maxParams?: number;
}

export const INDICATOR_METADATA: Record<IndicatorType, IndicatorMetadata> = {
  SMA: {
    name: 'SMA',
    label: 'Simple Moving Average',
    description: 'Average price over N periods',
    requiresParams: true,
    defaultParams: [20],
    minParams: 2,
    maxParams: 200,
  },
  EMA: {
    name: 'EMA',
    label: 'Exponential Moving Average',
    description: 'Weighted average giving more importance to recent prices',
    requiresParams: true,
    defaultParams: [20],
    minParams: 2,
    maxParams: 200,
  },
  RSI: {
    name: 'RSI',
    label: 'Relative Strength Index',
    description: 'Momentum oscillator (0-100)',
    requiresParams: true,
    defaultParams: [14],
    minParams: 2,
    maxParams: 50,
  },
  MACD: {
    name: 'MACD',
    label: 'MACD Line',
    description: 'Moving Average Convergence Divergence',
    requiresParams: false,
  },
  MACD_Signal: {
    name: 'MACD_Signal',
    label: 'MACD Signal Line',
    description: 'Signal line of MACD',
    requiresParams: false,
  },
  MACD_Histogram: {
    name: 'MACD_Histogram',
    label: 'MACD Histogram',
    description: 'Difference between MACD and Signal',
    requiresParams: false,
  },
  BB_Upper: {
    name: 'BB_Upper',
    label: 'Bollinger Upper Band',
    description: 'Upper band of Bollinger Bands',
    requiresParams: true,
    defaultParams: [20, 2],
    minParams: 2,
    maxParams: 200,
  },
  BB_Middle: {
    name: 'BB_Middle',
    label: 'Bollinger Middle Band',
    description: 'Middle band (SMA) of Bollinger Bands',
    requiresParams: true,
    defaultParams: [20],
    minParams: 2,
    maxParams: 200,
  },
  BB_Lower: {
    name: 'BB_Lower',
    label: 'Bollinger Lower Band',
    description: 'Lower band of Bollinger Bands',
    requiresParams: true,
    defaultParams: [20, 2],
    minParams: 2,
    maxParams: 200,
  },
  Price: {
    name: 'Price',
    label: 'Close Price',
    description: 'Current close price',
    requiresParams: false,
  },
  Volume: {
    name: 'Volume',
    label: 'Volume',
    description: 'Trading volume',
    requiresParams: false,
  },
  Value: {
    name: 'Value',
    label: 'Static Value',
    description: 'A static number (e.g., 30, 70)',
    requiresParams: true,
    defaultParams: [50],
  },
};

/**
 * ==========================================
 * DEFAULT STRATEGY CONDITION
 * ==========================================
 */

export const DEFAULT_STRATEGY_CONDITION: StrategyCondition = {
  id: '1',
  indicator1: 'SMA',
  indicator1Params: [20],
  indicator1Color: '#F97316', // Orange
  action: 'cross_above',
  indicator2: 'SMA',
  indicator2Params: [50],
  indicator2Color: '#3B82F6', // Blue
};

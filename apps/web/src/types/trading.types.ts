// src/types/trading.types.ts

export interface PriceMessage {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  source: string;
  streamType: string;
  interval?: string;
  isClosed?: boolean;
  openTime?: number;
}

export interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

export interface HistoricalDataMessage {
  symbol: string;
  interval?: string;
  source: string;
  dataType: 'historical';
  count: number;
  data: CandlestickData[];
  fetchedAt: number;
}

export interface WebSocketMessage {
  symbol: string;
  interval?: string;
  timeframe?: string; // Deprecated, use interval
  data: PriceMessage | HistoricalDataMessage;
  instanceId: string;
  timestamp: number;
}

export interface ConnectionStatus {
  connected: boolean;
  clientId: string | null;
  instanceId: string | null;
}

// Order Book Types
export interface OrderBookLevel {
  price: string;
  quantity: string;
  total?: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  timestamp: number;
  bids: [string, string][];
  asks: [string, string][];
  lastUpdateId: number;
}

export interface OrderBookUpdate {
  symbol: string;
  timestamp: number;
  bids: [string, string][];
  asks: [string, string][];
  firstUpdateId: number;
  lastUpdateId: number;
  eventTime: number;
}

export interface OrderBookMessage {
  type: 'snapshot' | 'update';
  symbol: string;
  data: OrderBookSnapshot | OrderBookUpdate;
  instanceId: string;
  timestamp: number;
}

export interface OrderBookData {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
  timestamp: number;
}
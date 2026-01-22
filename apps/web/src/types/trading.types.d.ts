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
    timeframe?: string;
    data: PriceMessage | HistoricalDataMessage;
    instanceId: string;
    timestamp: number;
}
export interface ConnectionStatus {
    connected: boolean;
    clientId: string | null;
    instanceId: string | null;
}
//# sourceMappingURL=trading.types.d.ts.map
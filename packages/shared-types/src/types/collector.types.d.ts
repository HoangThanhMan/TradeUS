export interface BinanceMiniTicker {
    e: string;
    E: number;
    s: string;
    c: string;
    o: string;
    h: string;
    l: string;
    v: string;
    q: string;
}
export interface BinanceKline {
    e: string;
    E: number;
    s: string;
    k: {
        t: number;
        T: number;
        s: string;
        i: string;
        f: number;
        L: number;
        o: string;
        c: string;
        h: string;
        l: string;
        v: string;
        n: number;
        x: boolean;
        q: string;
        V: string;
        Q: string;
    };
}
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
}
export type BinanceMessage = BinanceMiniTicker | BinanceKline;
export interface HistoricalDataParams {
    symbol: string;
    interval: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
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
    interval: string;
    source: string;
    dataType: 'historical';
    count: number;
    data: CandlestickData[];
    fetchedAt: number;
}
//# sourceMappingURL=collector.types.d.ts.map
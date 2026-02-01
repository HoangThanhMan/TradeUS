// src/hooks/useChartData.ts

'use client';

import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import {
  CandlestickData,
  PriceMessage,
  HistoricalDataMessage,
  WebSocketMessage,
} from '../types/trading.types';

export function useChartData(
  socket: Socket | null,
  symbol: string,
  interval: string,
) {
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [latestPrice, setLatestPrice] = useState<PriceMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const latestPriceRef = useRef<PriceMessage | null>(null);

  useEffect(() => {
    setCandles([]);
    setLatestPrice(null);
    latestPriceRef.current = null;
    setLoading(true);
  }, [symbol, interval]);

  // Auto-update candle hiện tại mỗi giây
  // Timer
  useEffect(() => {
    if (interval === '1d' || interval === '1w') return;

    const updateTimer = setInterval(() => {
      const current = latestPriceRef.current;
      if (!current) return;

      setCandles((prev) => {
        if (prev.length === 0) return prev;

        const lastCandle = prev[prev.length - 1];
        const intervalMs = getIntervalMs(interval);
        const now = Date.now();

        // Chỉ update close của candle cuối — không tạo candle mới
        // Candle mới chỉ được tạo khi now đã vượt quá lastCandle.time + intervalMs
        // VÀ chỉ tạo tuần tự từ lastCandle.time
        if (now < lastCandle.time + intervalMs) {
          // Vẫn trong candle hiện tại → chỉ update close
          const updatedCandle: CandlestickData = {
            time: lastCandle.time,
            open: lastCandle.open,
            high: Math.max(lastCandle.high, current.close),
            low: Math.min(lastCandle.low, current.close),
            close: current.close,
            volume: lastCandle.volume,
            quoteVolume: lastCandle.quoteVolume,
          };
          return [...prev.slice(0, -1), updatedCandle];
        }

        // now >= lastCandle.time + intervalMs → cần tạo candle mới
        // time của candle mới = lastCandle.time + intervalMs (không dùng Date.now())
        const newCandleTime = lastCandle.time + intervalMs;

        // Nếu newCandleTime quá xa so với now (ví dụ > 2x intervalMs) thì skip
        // để tránh tạo quá nhiều candle
        if (now > newCandleTime + intervalMs) {
          // Nhảy thẳng đến window hiện tại
          const currentAlignedTime = Math.floor(now / intervalMs) * intervalMs;
          const newCandle: CandlestickData = {
            time: currentAlignedTime,
            open: lastCandle.close,
            high: current.close,
            low: current.close,
            close: current.close,
            volume: 0,
            quoteVolume: 0,
          };
          const maxCandles = getCandleLimitForInterval(interval);
          return [...prev, newCandle].slice(-maxCandles);
        }

        const newCandle: CandlestickData = {
          time: newCandleTime,
          open: lastCandle.close,
          high: current.close,
          low: current.close,
          close: current.close,
          volume: 0,
          quoteVolume: 0,
        };
        const maxCandles = getCandleLimitForInterval(interval);
        return [...prev, newCandle].slice(-maxCandles);
      });
    }, 1000);

    return () => clearInterval(updateTimer);
  }, [interval]);

  useEffect(() => {
    if (!socket) return;

    let isSubscribed = true;

    const handlePrice = (message: WebSocketMessage) => {
      if (!isSubscribed) return;

      if (message.symbol !== symbol.toUpperCase()) return;

      const messageInterval = message.interval;
      if (messageInterval && messageInterval !== interval) {
        return;
      }

      const data = message.data as PriceMessage;
      console.log('📊 Price update:', {
        symbol: data.symbol,
        interval: message.interval,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        openTime: data.openTime,
        highEqLow: data.high === data.low, // ← thêm cái này
      });

      // Sync ngay lập tức
      setLatestPrice(data);
      latestPriceRef.current = data;

      // Update real-time candle

      setCandles((prev) => {
        if (prev.length === 0) return prev;

        const lastCandle = prev[prev.length - 1];
        const intervalMs = getIntervalMs(interval);
        const openTime =
          data.openTime ??
          Math.floor((data.timestamp || Date.now()) / intervalMs) * intervalMs;

        // Nếu openTime <= lastCandle.time → event này thuộc candle hiện tại hoặc candle cũ
        // → update candle cuối, không tạo mới
        if (openTime <= lastCandle.time) {
          const updatedCandle: CandlestickData = {
            time: lastCandle.time,
            open: lastCandle.open,
            high: Math.max(lastCandle.high, data.high, data.close),
            low: Math.min(lastCandle.low, data.low, data.close),
            close: data.close,
            volume: data.volume,
            quoteVolume: data.quoteVolume,
          };
          return [...prev.slice(0, -1), updatedCandle];
        }

        // openTime > lastCandle.time → candle thật mới
        const newCandle: CandlestickData = {
          time: openTime,
          open: lastCandle.close,
          high: Math.max(data.high, data.close),
          low: Math.min(data.low, data.close),
          close: data.close,
          volume: data.volume,
          quoteVolume: data.quoteVolume,
        };

        console.log(
          '✨ New candle created at',
          new Date(newCandle.time).toLocaleTimeString(),
        );

        const maxCandles = getCandleLimitForInterval(interval);
        return [...prev, newCandle].slice(-maxCandles);
      });
    };

    const handleHistorical = (message: WebSocketMessage) => {
      if (message.symbol !== symbol.toUpperCase()) {
        console.log('❌ Symbol mismatch:', message.symbol, 'vs', symbol);
        return;
      }

      const data = message.data as HistoricalDataMessage;

      const messageInterval = message.interval || data.interval;

      if (messageInterval && messageInterval !== interval) {
        console.log(
          '❌ Interval mismatch:',
          messageInterval,
          'vs',
          interval,
          '- ignoring data',
        );
        return;
      }

      console.log('✅ Interval match:', {
        messageInterval,
        expectedInterval: interval,
        hasIntervalInfo: !!messageInterval,
      });

      console.log('📚 Historical data received:', {
        symbol: data.symbol,
        interval: data.interval,
        count: data.count || data.data?.length || 0,
      });

      // Extract candles data - handle nested structure from backend
      let candlesData: CandlestickData[] | null = null;

      if (Array.isArray(data.data)) {
        candlesData = data.data;
      } else if (
        data.data &&
        typeof data.data === 'object' &&
        Array.isArray((data.data as any).data)
      ) {
        candlesData = (data.data as any).data;
      } else if (Array.isArray(data)) {
        candlesData = data as any;
      }

      if (candlesData && candlesData.length > 0) {
        console.log('✅ Setting', candlesData.length, 'candles to chart');
        console.log('📊 First candle:', candlesData[0]);
        console.log('📊 Last candle:', candlesData[candlesData.length - 1]);

        const lastCandle = candlesData[candlesData.length - 1];
        const priceFromHistorical: PriceMessage = {
          symbol: symbol.toUpperCase(),
          timestamp: lastCandle.time,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume,
          quoteVolume: lastCandle.quoteVolume,
          source: 'historical',
          streamType: 'historical',
        };

        setCandles(candlesData);
        setLatestPrice(priceFromHistorical);
        latestPriceRef.current = priceFromHistorical; // Sync ngay lập tức
        setLoading(false);
      } else {
        console.warn('⚠️ Invalid historical data format:', {
          dataType: typeof data,
          hasDataProp: 'data' in data,
          dataDataType: data.data ? typeof data.data : 'none',
          structure: JSON.stringify(data).substring(0, 200),
        });
        setLoading(false);
      }
    };

    socket.on('price', handlePrice);
    socket.on('historical', handleHistorical);

    return () => {
      isSubscribed = false;
      socket.off('price', handlePrice);
      socket.off('historical', handleHistorical);
    };
  }, [socket, symbol, interval]);

  return { candles, latestPrice, loading };
}

/**
 * Convert interval string to milliseconds
 */
function getIntervalMs(interval: string): number {
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
      if (interval.toLowerCase().endsWith('m') && value > 59) {
        return value * 30 * 24 * 60 * 60 * 1000;
      }
      return 60 * 1000;
  }
}

/**
 * Get candle limit for interval
 */
function getCandleLimitForInterval(interval: string): number {
  const limits: Record<string, number> = {
    '1s': 50000, // 2 minutes
    '1m': 500, // 4 hours
    '5m': 500, // 1 day
    '15m': 500, // ~5 days
    '30m': 500, // ~10 days
    '1h': 500, // ~20 days
    '2h': 500, // ~40 days
    '4h': 500, // ~80 days
    '6h': 500, // ~120 days
    '12h': 500, // ~240 days
    '1d': 500, // ~1.5 years
    '3d': 500, // ~4 years
    '1w': 500, // ~10 years
    '1M': 500, // ~40 years
  };

  return limits[interval] || 500;
}

// src/hooks/useChartData.ts

'use client';

import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { 
  CandlestickData, 
  PriceMessage, 
  HistoricalDataMessage, 
  WebSocketMessage 
} from '../types/trading.types';

export function useChartData(
  socket: Socket | null, 
  symbol: string,
  interval: string
) {
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [latestPrice, setLatestPrice] = useState<PriceMessage | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset data khi symbol hoặc interval thay đổi
  useEffect(() => {
    console.log('🔄 Resetting chart data for', symbol, interval);
    setCandles([]);
    setLatestPrice(null);
    setLoading(true);
  }, [symbol, interval]);

  // Auto-update candle hiện tại mỗi giây
  useEffect(() => {
    if (!latestPrice || candles.length === 0) return;

    const updateTimer = setInterval(() => {
      setCandles(prev => {
        if (prev.length === 0) return prev;

        const lastCandle = prev[prev.length - 1];
        const now = Date.now();
        const intervalMs = getIntervalMs(interval);
        
        const currentWindow = Math.floor(now / intervalMs);
        const lastCandleWindow = Math.floor(lastCandle.time / intervalMs);

        if (currentWindow === lastCandleWindow) {
          // Vẫn trong cùng candle window → update với latest price
          const updatedCandle: CandlestickData = {
            time: lastCandle.time,
            open: lastCandle.open,
            high: Math.max(lastCandle.high, latestPrice.close),
            low: Math.min(lastCandle.low, latestPrice.close),
            close: latestPrice.close,
            volume: lastCandle.volume,
            quoteVolume: lastCandle.quoteVolume,
          };

          console.log('⏱️ Timer update:', updatedCandle.close);
          return [...prev.slice(0, -1), updatedCandle];
        } else {
          // Sang candle window mới → tạo candle mới
          const newCandle: CandlestickData = {
            time: Math.floor(now / intervalMs) * intervalMs,
            open: lastCandle.close,
            high: latestPrice.close,
            low: latestPrice.close,
            close: latestPrice.close,
            volume: 0,
            quoteVolume: 0,
          };

          console.log('⏱️ Timer: New candle', new Date(newCandle.time).toLocaleTimeString());
          
          const maxCandles = getCandleLimitForInterval(interval);
          return [...prev, newCandle].slice(-maxCandles);
        }
      });
    }, 1000); // Update mỗi 1 giây

    return () => clearInterval(updateTimer);
  }, [latestPrice, interval, candles.length]);

  useEffect(() => {
    if (!socket) return;

    let isSubscribed = true;

    const handlePrice = (message: WebSocketMessage) => {
      if (!isSubscribed) return; // Guard against double execution
      
      // Chỉ xử lý message của symbol hiện tại
      if (message.symbol !== symbol.toUpperCase()) return;

      // Check interval match
      const messageInterval = message.interval;
      if (messageInterval && messageInterval !== interval) {
        return;
      }

      const data = message.data as PriceMessage;
      
      console.log('📊 Price update:', {
        symbol: data.symbol,
        interval: messageInterval || 'ticker',
        close: data.close,
        timestamp: new Date(data.timestamp).toLocaleTimeString(),
      });

      setLatestPrice(data);

      // Update real-time candle
      setCandles(prev => {
        if (prev.length === 0) {
          return prev;
        }

        const lastCandle = prev[prev.length - 1];
        const currentTime = data.timestamp || Date.now();
        const intervalMs = getIntervalMs(interval);
        
        const currentWindow = Math.floor(currentTime / intervalMs);
        const lastCandleWindow = Math.floor(lastCandle.time / intervalMs);
        
        if (currentWindow === lastCandleWindow) {
          // Update current candle
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
        } else {
          // New candle
          const newCandle: CandlestickData = {
            time: Math.floor(currentTime / intervalMs) * intervalMs,
            open: lastCandle.close,
            high: Math.max(data.high, data.close),
            low: Math.min(data.low, data.close),
            close: data.close,
            volume: data.volume,
            quoteVolume: data.quoteVolume,
          };

          console.log('✨ New candle created at', new Date(newCandle.time).toLocaleTimeString());
          
          const maxCandles = getCandleLimitForInterval(interval);
          return [...prev, newCandle].slice(-maxCandles);
        }
      });
    };

    const handleHistorical = (message: WebSocketMessage) => {
      // Chỉ xử lý message của symbol hiện tại
      if (message.symbol !== symbol.toUpperCase()) {
        console.log('❌ Symbol mismatch:', message.symbol, 'vs', symbol);
        return;
      }

      const data = message.data as HistoricalDataMessage;
      
      // Check interval từ nhiều nguồn (message level hoặc data level)
      const messageInterval = message.interval || data.interval;
      
      // Nếu có interval info, validate nó
      if (messageInterval && messageInterval !== interval) {
        console.log('❌ Interval mismatch:', messageInterval, 'vs', interval, '- ignoring data');
        return;
      }
      
      // Log để debug
      console.log('✅ Interval match:', {
        messageInterval,
        expectedInterval: interval,
        hasIntervalInfo: !!messageInterval
      });
      
      console.log('📚 Historical data received:', {
        symbol: data.symbol,
        interval: data.interval,
        count: data.count || data.data?.length || 0,
      });

      // Extract candles data - handle nested structure from backend
      let candlesData: CandlestickData[] | null = null;

      if (Array.isArray(data.data)) {
        // data.data is already array of candles
        candlesData = data.data;
      } else if (data.data && typeof data.data === 'object' && Array.isArray((data.data as any).data)) {
        // data.data is nested object with data property
        candlesData = (data.data as any).data;
      } else if (Array.isArray(data)) {
        // data itself is array
        candlesData = data as any;
      }

      if (candlesData && candlesData.length > 0) {
        console.log('✅ Setting', candlesData.length, 'candles to chart');
        console.log('📊 First candle:', candlesData[0]);
        console.log('📊 Last candle:', candlesData[candlesData.length - 1]);
        setCandles(candlesData);
        setLoading(false);
      } else {
        console.warn('⚠️ Invalid historical data format:', {
          dataType: typeof data,
          hasDataProp: 'data' in data,
          dataDataType: data.data ? typeof data.data : 'none',
          structure: JSON.stringify(data).substring(0, 200)
        });
        setLoading(false);
      }
    };

    socket.on('price', handlePrice);
    socket.on('historical', handleHistorical);

    return () => {
      isSubscribed = false; // Prevent handlers after cleanup
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
    '1s': 50000,   // 2 minutes
    '1m': 500,   // 4 hours
    '5m': 500,   // 1 day
    '15m': 500,  // ~5 days
    '30m': 500,  // ~10 days
    '1h': 500,   // ~20 days
    '2h': 500,   // ~40 days
    '4h': 500,   // ~80 days
    '6h': 500,   // ~120 days
    '12h': 500,  // ~240 days
    '1d': 500,   // ~1.5 years
    '3d': 500,   // ~4 years
    '1w': 500,   // ~10 years
    '1M': 500,   // ~40 years
  };

  return limits[interval] || 500;
}
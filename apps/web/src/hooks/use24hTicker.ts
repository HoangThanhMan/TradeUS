// src/hooks/use24hTicker.ts
'use client';

import { useState, useEffect, useRef } from 'react';

export interface Ticker24h {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
}

/**
 * Hook để lấy thống kê 24h từ Binance REST API
 * Update mỗi 5 giây
 */
export function use24hTicker(symbol: string) {
  const [ticker, setTicker] = useState<Ticker24h | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!symbol) return;

    let isMounted = true;

    const fetchTicker = async () => {
      try {
        // Cancel previous request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        const response = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`,
          {
            signal: abortControllerRef.current.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: Ticker24h = await response.json();

        if (isMounted) {
          setTicker(data);
          setError(null);
          setLoading(false);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return; // Ignore aborted requests
        }

        if (isMounted) {
          console.error('Failed to fetch 24h ticker:', err);
          setError(err.message);
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchTicker();

    // Update every 5 seconds
    const interval = setInterval(fetchTicker, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [symbol]);

  return { ticker, loading, error };
}
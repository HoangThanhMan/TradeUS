// src/hooks/useRealtimeTicker.ts
'use client';

import { useState, useEffect, useRef } from 'react';

interface TickerUpdate {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  timestamp: number;
}

export function useRealtimeTicker(symbol: string) {
  const [ticker, setTicker] = useState<TickerUpdate | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isUnmountedRef = useRef(false);

  useEffect(() => {
    if (!symbol) return;

    isUnmountedRef.current = false;

    const connectWebSocket = () => {
      if (isUnmountedRef.current) return;
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const stream = `${symbol.toLowerCase()}@ticker`;
      const wsUrl = `wss://stream.binance.com:9443/ws/${stream}`;

      console.log(`🔌 Connecting WS: ${stream}`);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isUnmountedRef.current) return;
        console.log(`✅ WS connected: ${stream}`);
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          setTicker({
            symbol: data.s,
            price: parseFloat(data.c),
            priceChange: parseFloat(data.p),
            priceChangePercent: parseFloat(data.P),
            timestamp: Date.now(),
          });
        } catch {
        }
      };

      ws.onerror = () => {
        console.warn(`⚠️ WS error: ${stream}`);
        setConnected(false);
      };

      ws.onclose = () => {
        setConnected(false);

        if (isUnmountedRef.current) return;

        console.log(`🔌 WS closed: ${stream}, reconnecting...`);
        reconnectTimeoutRef.current = window.setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      isUnmountedRef.current = true;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol]);

  return { ticker, connected };
}

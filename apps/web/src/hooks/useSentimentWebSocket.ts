'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Flat format from real-time RabbitMQ events
export interface SentimentResultData {
  id?: string;
  symbol: string;
  sentiment: number;
  emotion: string;
  reason: string;
  title: string;
  link: string;
  published?: string;
  created_at?: string;
}

// Nested format from historical API
export interface SentimentHistoricalData {
  id: string;
  news: {
    title: string;
    content: string;
    link: string;
    source: string;
    publishedAt: string;
  };
  analysis: {
    symbol: string;
    sentiment: number;
    emotion: string;
    reason: string;
    confidence: number;
    processedAt: string;
  };
}

// Normalize historical data to flat format
function normalizeHistoricalData(data: SentimentHistoricalData): SentimentResultData {
  return {
    id: data.id,
    symbol: data.analysis.symbol,
    sentiment: data.analysis.sentiment,
    emotion: data.analysis.emotion,
    reason: data.analysis.reason,
    title: data.news.title,
    link: data.news.link,
    published: data.news.publishedAt,
    created_at: data.analysis.processedAt,
  };
}

export interface SentimentAlertData {
  symbol: string;
  sentiment_score: number;
  emotion: string;
  alert_type: 'extreme_positive' | 'extreme_negative' | 'trend_change';
  message: string;
  threshold: number;
}

export interface BatchCompleteData {
  total_analyzed: number;
  symbols: string[];
  average_sentiment: number;
  duration_seconds?: number;
  source?: string;
}

export interface SentimentEvent {
  type: 'result' | 'alert' | 'batch_complete';
  symbol?: string;
  data: SentimentResultData | SentimentAlertData | BatchCompleteData;
  timestamp: string;
  source: string;
}

export interface SentimentConnectionStatus {
  connected: boolean;
  clientId: string | null;
  instanceId: string | null;
}

export function useSentimentWebSocket(url: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<SentimentConnectionStatus>({
    connected: false,
    clientId: null,
    instanceId: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [sentimentResults, setSentimentResults] = useState<SentimentResultData[]>([]);
  const [alerts, setAlerts] = useState<SentimentAlertData[]>([]);
  const [batchInfo, setBatchInfo] = useState<BatchCompleteData | null>(null);
  const subscribedSymbols = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log('🔌 Connecting to Sentiment WebSocket:', url);

    const newSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('✅ Sentiment WebSocket connected');
      setError(null);
    });

    newSocket.on('connected', (data) => {
      console.log('📡 Sentiment connection acknowledged:', data);
      setStatus({
        connected: true,
        clientId: data.clientId,
        instanceId: data.instanceId,
      });

      // Re-subscribe to symbols after reconnection
      subscribedSymbols.current.forEach((symbol) => {
        newSocket.emit('subscribe', { symbols: [symbol] });
      });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Sentiment WebSocket disconnected');
      setStatus({
        connected: false,
        clientId: null,
        instanceId: null,
      });
    });

    newSocket.on('connect_error', (err) => {
      console.error('🔴 Sentiment connection error:', err.message);
      setError(`Connection error: ${err.message}`);
    });

    // Sentiment events
    newSocket.on('sentiment:result', (event: SentimentEvent) => {
      console.log('📊 Received sentiment result:', event);
      const data = event.data as SentimentResultData;
      setSentimentResults((prev) => {
        // Add new result at the beginning, keep max 50 items
        const updated = [data, ...prev.filter((item) => item.id !== data.id)];
        return updated.slice(0, 50);
      });
    });

    newSocket.on('sentiment:alert', (event: SentimentEvent) => {
      console.log('⚠️ Received sentiment alert:', event);
      const data = event.data as SentimentAlertData;
      setAlerts((prev) => {
        const updated = [data, ...prev];
        return updated.slice(0, 20);
      });
    });

    newSocket.on('sentiment:batch_complete', (event: SentimentEvent) => {
      console.log('📦 Batch complete:', event);
      setBatchInfo(event.data as BatchCompleteData);
    });

    // Historical data - sent when client first subscribes
    newSocket.on('sentiment:history', (event: { symbol: string; data: SentimentHistoricalData[]; count: number; isHistorical: boolean }) => {
      console.log(`📜 Received ${event.count} historical sentiments for ${event.symbol}`);
      setSentimentResults((prev) => {
        // Normalize and merge historical data, avoiding duplicates
        const existingIds = new Set(prev.map((item) => item.id));
        const normalizedItems = event.data.map(normalizeHistoricalData);
        const newItems = normalizedItems.filter((item) => !existingIds.has(item.id));
        const merged = [...prev, ...newItems];
        // Sort by created_at/published descending, keep max 50 items
        merged.sort((a, b) => {
          const dateA = new Date(a.created_at || a.published || 0);
          const dateB = new Date(b.created_at || b.published || 0);
          return dateB.getTime() - dateA.getTime();
        });
        return merged.slice(0, 50);
      });
    });

    setSocket(newSocket);

    return () => {
      console.log('🔌 Closing Sentiment WebSocket connection');
      newSocket.close();
    };
  }, [url]);

  const subscribe = useCallback(
    (symbols: string[]) => {
      if (socket && status.connected) {
        console.log('📥 Subscribing to sentiment for symbols:', symbols);
        socket.emit('subscribe', { symbols }, (response: any) => {
          if (response?.success) {
            symbols.forEach((s) => subscribedSymbols.current.add(s.toUpperCase()));
            console.log('✅ Subscribed successfully:', response.subscribedSymbols);
          } else {
            console.error('❌ Subscribe failed:', response?.error);
          }
        });
      }
    },
    [socket, status.connected]
  );

  const unsubscribe = useCallback(
    (symbols: string[]) => {
      if (socket && status.connected) {
        console.log('📤 Unsubscribing from sentiment for symbols:', symbols);
        socket.emit('unsubscribe', { symbols }, (response: any) => {
          if (response?.success) {
            symbols.forEach((s) => subscribedSymbols.current.delete(s.toUpperCase()));
            console.log('✅ Unsubscribed successfully:', response.unsubscribedSymbols);
          }
        });
      }
    },
    [socket, status.connected]
  );

  const clearResults = useCallback(() => {
    setSentimentResults([]);
    setAlerts([]);
  }, []);

  return {
    socket,
    status,
    error,
    sentimentResults,
    alerts,
    batchInfo,
    subscribe,
    unsubscribe,
    clearResults,
  };
}

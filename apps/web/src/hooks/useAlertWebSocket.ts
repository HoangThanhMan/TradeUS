'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface AlertNotification {
  type: 'sentiment_alert';
  symbol: string;
  sentiment: number;
  sentiment_label: string;
  title: string;
  reason: string;
  notified_count: number;
}

export interface EmailStatusNotification {
  type: 'email_status';
  to: string;
  subject: string;
  status: 'sent' | 'failed';
}

export interface AlertConnectionStatus {
  connected: boolean;
  clientId: string | null;
  instanceId: string | null;
}

const ALERT_WS_URL =
  process.env.NEXT_PUBLIC_ALERT_WS_URL || 'http://localhost/alerts';

export function useAlertWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<AlertConnectionStatus>({
    connected: false,
    clientId: null,
    instanceId: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [emailStatuses, setEmailStatuses] = useState<EmailStatusNotification[]>([]);
  const subscribedSymbols = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log('🔌 Connecting to Alert WebSocket:', ALERT_WS_URL);

    const newSocket = io(ALERT_WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('✅ Alert WebSocket connected');
      setError(null);
    });

    newSocket.on('connected', (data) => {
      console.log('📡 Alert connection acknowledged:', data);
      setStatus({
        connected: true,
        clientId: data.clientId,
        instanceId: data.instanceId,
      });

      // Re-subscribe to symbols after reconnection
      if (subscribedSymbols.current.size > 0) {
        newSocket.emit('subscribe', {
          symbols: Array.from(subscribedSymbols.current),
        });
      }
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Alert WebSocket disconnected');
      setStatus({
        connected: false,
        clientId: null,
        instanceId: null,
      });
    });

    newSocket.on('connect_error', (err) => {
      console.error('🔴 Alert connection error:', err.message);
      setError(`Connection error: ${err.message}`);
    });

    // Alert events
    newSocket.on('alert:sentiment', (event: any) => {
      console.log('🚨 Received sentiment alert:', event);
      const data = event.data as AlertNotification;
      setAlerts((prev) => {
        const updated = [
          { ...data, _timestamp: event.timestamp },
          ...prev,
        ];
        return updated.slice(0, 50);
      });
    });

    newSocket.on('alert:email_status', (event: any) => {
      console.log('📧 Received email status:', event);
      const data = event.data as EmailStatusNotification;
      setEmailStatuses((prev) => {
        const updated = [
          { ...data, _timestamp: event.timestamp },
          ...prev,
        ];
        return updated.slice(0, 50);
      });
    });

    setSocket(newSocket);

    return () => {
      console.log('🔌 Closing Alert WebSocket connection');
      newSocket.close();
    };
  }, []);

  const subscribe = useCallback(
    (symbols: string[]) => {
      if (socket && status.connected) {
        console.log('📥 Subscribing to alerts for symbols:', symbols);
        socket.emit('subscribe', { symbols }, (response: any) => {
          if (response?.success) {
            symbols.forEach((s) =>
              subscribedSymbols.current.add(s.toUpperCase()),
            );
          }
        });
      }
    },
    [socket, status.connected],
  );

  const unsubscribe = useCallback(
    (symbols: string[]) => {
      if (socket && status.connected) {
        console.log('📤 Unsubscribing from alerts for symbols:', symbols);
        socket.emit('unsubscribe', { symbols }, (response: any) => {
          if (response?.success) {
            symbols.forEach((s) =>
              subscribedSymbols.current.delete(s.toUpperCase()),
            );
          }
        });
      }
    },
    [socket, status.connected],
  );

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    setEmailStatuses([]);
  }, []);

  return {
    socket,
    status,
    error,
    alerts,
    emailStatuses,
    subscribe,
    unsubscribe,
    clearAlerts,
  };
}

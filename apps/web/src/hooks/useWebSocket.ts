'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { ConnectionStatus } from '../types/trading.types';

export function useWebSocket(url: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>({
    connected: false,
    clientId: null,
    instanceId: null,
  });
  const [error, setError] = useState<string | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    console.log('🔌 Connecting to WebSocket:', url);

    const newSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected');
      setError(null);
      reconnectAttempts.current = 0;
    });

    newSocket.on('connected', (data) => {
      console.log('📡 Connection acknowledged:', data);
      setStatus({
        connected: true,
        clientId: data.clientId,
        instanceId: data.instanceId,
      });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setStatus({
        connected: false,
        clientId: null,
        instanceId: null,
      });
    });

    newSocket.on('connect_error', (err) => {
      console.error('🔴 Connection error:', err.message);
      reconnectAttempts.current++;
      setError(`Connection error: ${err.message}`);
    });

    setSocket(newSocket);

    return () => {
      console.log('🔌 Closing WebSocket connection');
      newSocket.close();
    };
  }, [url]);

    const subscribe = useCallback((symbols: string[], interval: string) => {
    if (socket && status.connected) {
        console.log('📥 Subscribing to symbols:', symbols, 'interval:', interval);
        socket.emit('subscribe', { symbols, interval });
    }
    }, [socket, status.connected]);

    const unsubscribe = useCallback((symbols: string[], interval: string) => {
    if (socket && status.connected) {
        console.log('📤 Unsubscribing from symbols:', symbols, 'interval:', interval);
        socket.emit('unsubscribe', { symbols, interval });
    }
    }, [socket, status.connected]);

  return { socket, status, error, subscribe, unsubscribe };
}
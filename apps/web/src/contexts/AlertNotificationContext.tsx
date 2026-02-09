'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { subscriptionService } from '../services/subscription.service';

/* ─── Types ─────────────────────────────────────────── */
export interface AlertNotification {
  type: 'sentiment_alert';
  symbol: string;
  sentiment: number;
  sentiment_label: string;
  title: string;
  reason: string;
  notified_count: number;
  _timestamp?: string;
}

export interface EmailStatusNotification {
  type: 'email_status';
  to: string;
  subject: string;
  status: 'sent' | 'failed';
  _timestamp?: string;
}

export type AnyNotification =
  | (AlertNotification & { _kind: 'alert' })
  | (EmailStatusNotification & { _kind: 'email' });

interface AlertNotificationContextType {
  alerts: AlertNotification[];
  emailStatuses: EmailStatusNotification[];
  /** Merged & time-sorted feed of all notifications */
  allNotifications: AnyNotification[];
  unreadCount: number;
  connected: boolean;
  markAllRead: () => void;
  clearAll: () => void;
  /** Subscribe to WebSocket rooms for given symbols */
  subscribeSymbols: (symbols: string[]) => void;
  /** Unsubscribe from WebSocket rooms */
  unsubscribeSymbols: (symbols: string[]) => void;
  /** Call after login to initialise the socket */
  initConnection: () => void;
}

const AlertNotificationContext = createContext<
  AlertNotificationContextType | undefined
>(undefined);

const ALERT_WS_URL =
  process.env.NEXT_PUBLIC_ALERT_WS_URL || 'http://localhost/alerts';

/* ─── Provider ──────────────────────────────────────── */
export function AlertNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [emailStatuses, setEmailStatuses] = useState<
    EmailStatusNotification[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const subscribedSymbols = useRef<Set<string>>(new Set());

  /* ── build merged feed ──────────────────────────── */
  const allNotifications: AnyNotification[] = React.useMemo(() => {
    const merged: AnyNotification[] = [
      ...alerts.map((a) => ({ ...a, _kind: 'alert' as const })),
      ...emailStatuses.map((e) => ({ ...e, _kind: 'email' as const })),
    ];
    merged.sort((a, b) => {
      const ta = a._timestamp ? new Date(a._timestamp).getTime() : 0;
      const tb = b._timestamp ? new Date(b._timestamp).getTime() : 0;
      return tb - ta; // newest first
    });
    return merged;
  }, [alerts, emailStatuses]);

  /* ── socket initialiser ─────────────────────────── */
  const initConnection = useCallback(() => {
    if (socketRef.current) return; // already connected

    const token =
      sessionStorage.getItem('accessToken') ||
      sessionStorage.getItem('token');
    if (!token) return;

    const newSocket = io(ALERT_WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    newSocket.on('connected', (data: any) => {
      setConnected(true);
      // re-subscribe after reconnect
      if (subscribedSymbols.current.size > 0) {
        newSocket.emit('subscribe', {
          symbols: Array.from(subscribedSymbols.current),
        });
      }
    });

    newSocket.on('disconnect', () => setConnected(false));

    newSocket.on('alert:sentiment', (event: any) => {
      const data = event.data as AlertNotification;
      setAlerts((prev) =>
        [{ ...data, _timestamp: event.timestamp }, ...prev].slice(0, 100),
      );
      setUnreadCount((c) => c + 1);
    });

    newSocket.on('alert:email_status', (event: any) => {
      const data = event.data as EmailStatusNotification;
      setEmailStatuses((prev) =>
        [{ ...data, _timestamp: event.timestamp }, ...prev].slice(0, 100),
      );
      setUnreadCount((c) => c + 1);
    });

    socketRef.current = newSocket;

    // Auto-subscribe to user's existing subscriptions
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        const uid = parsed._id || parsed.id || parsed.userId;
        if (uid) {
          subscriptionService
            .getUserSubscriptions(uid)
            .then((data) => {
              const symbols = (data.subscriptions || []).map(
                (s: any) => s.symbol,
              );
              if (symbols.length > 0) {
                symbols.forEach((s: string) =>
                  subscribedSymbols.current.add(s),
                );
                newSocket.emit('subscribe', { symbols });
              }
            })
            .catch(() => {});
        }
      } catch {}
    }
  }, []);

  /* ── connect on mount if token exists ───────────── */
  useEffect(() => {
    initConnection();
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [initConnection]);

  /* ── public helpers ─────────────────────────────── */
  const markAllRead = useCallback(() => setUnreadCount(0), []);

  const clearAll = useCallback(() => {
    setAlerts([]);
    setEmailStatuses([]);
    setUnreadCount(0);
  }, []);

  const subscribeSymbols = useCallback(
    (symbols: string[]) => {
      symbols.forEach((s) => subscribedSymbols.current.add(s.toUpperCase()));
      if (socketRef.current && connected) {
        socketRef.current.emit('subscribe', {
          symbols: symbols.map((s) => s.toUpperCase()),
        });
      }
    },
    [connected],
  );

  const unsubscribeSymbols = useCallback(
    (symbols: string[]) => {
      symbols.forEach((s) =>
        subscribedSymbols.current.delete(s.toUpperCase()),
      );
      if (socketRef.current && connected) {
        socketRef.current.emit('unsubscribe', {
          symbols: symbols.map((s) => s.toUpperCase()),
        });
      }
    },
    [connected],
  );

  return (
    <AlertNotificationContext.Provider
      value={{
        alerts,
        emailStatuses,
        allNotifications,
        unreadCount,
        connected,
        markAllRead,
        clearAll,
        subscribeSymbols,
        unsubscribeSymbols,
        initConnection,
      }}
    >
      {children}
    </AlertNotificationContext.Provider>
  );
}

/* ─── Hook ──────────────────────────────────────────── */
export function useAlertNotification() {
  const ctx = useContext(AlertNotificationContext);
  if (!ctx) {
    throw new Error(
      'useAlertNotification must be used within AlertNotificationProvider',
    );
  }
  return ctx;
}

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAlertNotification, AnyNotification } from '../../contexts/AlertNotificationContext';
import { IconBell, IconAlertTriangle, IconMail, IconCheck, IconX } from '@tabler/icons-react';
import { Plus_Jakarta_Sans } from 'next/font/google';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

function timeAgo(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const { allNotifications, unreadCount, markAllRead, connected } =
    useAlertNotification();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    setOpen((prev) => !prev);
    if (!open && unreadCount > 0) markAllRead();
  };

  const preview = allNotifications.slice(0, 6);

  return (
    <div className={`relative ${pjs.className}`} ref={ref}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-full hover:bg-gray-200/60 transition-colors"
        title="Notifications"
      >
        <IconBell className="w-5 h-5 text-gray-700" />

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Connection dot */}
        <span
          className={`absolute bottom-1 right-1 w-2 h-2 rounded-full border border-white ${
            connected ? 'bg-green-400' : 'bg-gray-300'
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-[99999] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
            <span
              className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                connected
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connected ? 'bg-green-500' : 'bg-red-400'
                }`}
              />
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>

          {/* Items */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {preview.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                <IconBell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            ) : (
              preview.map((n, i) => (
                <NotificationItem key={i} notification={n} />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 bg-gray-50/80">
            <button
              onClick={() => {
                setOpen(false);
                router.push('/alerts');
              }}
              className="w-full py-2.5 text-center text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50/50 transition-colors"
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Individual notification item ─────────────────── */
function NotificationItem({ notification: n }: { notification: AnyNotification }) {
  if (n._kind === 'alert') {
    const isBearish = n.sentiment < 0;
    return (
      <div className="flex gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isBearish ? 'bg-red-100' : 'bg-green-100'
          }`}
        >
          <IconAlertTriangle
            className={`w-4 h-4 ${isBearish ? 'text-red-600' : 'text-green-600'}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-900">{n.symbol}</span>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                isBearish
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700'
              }`}
            >
              {n.sentiment_label}
            </span>
          </div>
          {n.title && (
            <p className="text-[11px] text-gray-600 truncate mt-0.5">
              {n.title}
            </p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">
            {timeAgo(n._timestamp)}
          </p>
        </div>
      </div>
    );
  }

  // email status
  const isSent = n.status === 'sent';
  return (
    <div className="flex gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isSent ? 'bg-emerald-100' : 'bg-red-100'
        }`}
      >
        {isSent ? (
          <IconCheck className="w-4 h-4 text-emerald-600" />
        ) : (
          <IconX className="w-4 h-4 text-red-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <IconMail className="w-3 h-3 text-gray-400" />
          <span className="text-xs font-medium text-gray-900 truncate">
            {n.subject || 'Email notification'}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 truncate mt-0.5">
          To: {n.to}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {isSent ? '✓ Delivered' : '✗ Failed'} · {timeAgo(n._timestamp)}
        </p>
      </div>
    </div>
  );
}

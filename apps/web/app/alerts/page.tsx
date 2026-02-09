'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/src/components/page/Header';
import {
  useAlertNotification,
  AnyNotification,
} from '../../src/contexts/AlertNotificationContext';
import {
  sentimentService,
  SentimentApiResponse,
} from '../../src/services/sentiment.service';
import { Plus_Jakarta_Sans } from 'next/font/google';
import {
  IconBell,
  IconAlertTriangle,
  IconMail,
  IconCheck,
  IconX,
  IconTrash,
  IconWifi,
  IconWifiOff,
  IconNews,
  IconRefresh,
} from '@tabler/icons-react';

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

function formatTime(timestamp: string | undefined) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function NotificationCenterPage() {
  const router = useRouter();
  const {
    alerts,
    emailStatuses,
    allNotifications,
    unreadCount,
    connected,
    markAllRead,
    clearAll,
  } = useAlertNotification();

  const [badNews, setBadNews] = useState<SentimentApiResponse[]>([]);
  const [loadingBadNews, setLoadingBadNews] = useState(true);

  useEffect(() => {
    const token =
      sessionStorage.getItem('accessToken') ||
      sessionStorage.getItem('token');
    if (!token) {
      router.push('/auth');
    }
  }, [router]);

  // Fetch today's bad news on mount
  const fetchBadNews = useCallback(async () => {
    try {
      setLoadingBadNews(true);
      const data = await sentimentService.getNegativeSentimentsToday(
        undefined,
        0,
        50,
      );
      setBadNews(data);
    } catch (err) {
      console.error('Failed to fetch bad news:', err);
    } finally {
      setLoadingBadNews(false);
    }
  }, []);

  useEffect(() => {
    fetchBadNews();
  }, [fetchBadNews]);

  // Mark all read when page is viewed
  useEffect(() => {
    if (unreadCount > 0) markAllRead();
  }, [unreadCount, markAllRead]);

  return (
    <div className={`min-h-screen bg-gray-50 ${pjs.className}`}>
      <Header status={{ connected: true, clientId: null, instanceId: null }} />

      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Page Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <IconBell className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Notification Center
                </h1>
                <p className="text-sm text-gray-500">
                  Real-time sentiment alerts & email delivery status
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {allNotifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 transition-colors border border-gray-200 rounded-lg hover:border-red-200"
                >
                  <IconTrash className="w-3.5 h-3.5" />
                  Clear all
                </button>
              )}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                  connected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {connected ? (
                  <IconWifi className="w-3.5 h-3.5" />
                ) : (
                  <IconWifiOff className="w-3.5 h-3.5" />
                )}
                {connected ? 'Live' : 'Offline'}
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {allNotifications.length}
              </p>
              <p className="text-xs text-gray-500 font-medium">
                Total Events
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">
                {alerts.length}
              </p>
              <p className="text-xs text-amber-600 font-medium">
                Sentiment Alerts
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4 text-center">
              <p className="text-2xl font-bold text-red-600">
                {badNews.length}
              </p>
              <p className="text-xs text-red-600 font-medium">
                Bad News Today
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">
                {emailStatuses.filter((e) => e.status === 'sent').length}
              </p>
              <p className="text-xs text-emerald-600 font-medium">
                Emails Sent
              </p>
            </div>
          </div>

          {/* Today's Bad News Section */}
          <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-red-100 bg-red-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconNews className="w-4 h-4 text-red-600" />
                <h2 className="text-sm font-semibold text-red-900">
                  Today&apos;s Bad News
                </h2>
              </div>
              <button
                onClick={fetchBadNews}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-100 rounded-md transition-colors"
              >
                <IconRefresh className={`w-3.5 h-3.5 ${loadingBadNews ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {loadingBadNews ? (
              <div className="text-center py-10 text-gray-400">
                <IconRefresh className="w-8 h-8 mx-auto mb-2 animate-spin opacity-30" />
                <p className="text-sm">Loading today&apos;s news…</p>
              </div>
            ) : badNews.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <IconCheck className="w-10 h-10 mx-auto mb-2 opacity-20 text-green-500" />
                <p className="text-sm font-medium text-green-600">
                  No bad news today!
                </p>
                <p className="text-xs mt-1">
                  All sentiment analyses so far today are neutral or positive.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-red-50">
                {badNews.map((item) => (
                  <BadNewsRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>

          {/* Notification Feed */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-sm font-semibold text-gray-900">
                Activity Feed
              </h2>
            </div>

            {allNotifications.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <IconBell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">No notifications yet</p>
                <p className="text-xs mt-1 max-w-xs mx-auto">
                  Subscribe to symbols on the Dashboard to receive real-time
                  sentiment alerts and email delivery updates.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {allNotifications.map((n, i) => (
                  <NotificationRow key={i} notification={n} />
                ))}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-blue-900 mb-3">
              How it works
            </h3>
            <div className="space-y-2 text-sm text-blue-800">
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[10px] font-bold mt-0.5">
                  1
                </span>
                <p>
                  You subscribe to symbols (e.g. BTCUSDT) on the{' '}
                  <strong>Dashboard</strong> or <strong>Subscriptions</strong>{' '}
                  page.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[10px] font-bold mt-0.5">
                  2
                </span>
                <p>
                  When negative news appears, the{' '}
                  <strong>Symbol Alert Service</strong> detects it and notifies
                  all subscribers.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[10px] font-bold mt-0.5">
                  3
                </span>
                <p>
                  Alerts are pushed to this page via{' '}
                  <strong>WebSocket</strong> (the 🔔 bell icon shows a red
                  badge), and email alerts are delivered by the{' '}
                  <strong>Email Service</strong> via RabbitMQ.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Notification Row ─────────────────────────────── */
function NotificationRow({
  notification: n,
}: {
  notification: AnyNotification;
}) {
  if (n._kind === 'alert') {
    const isBearish = n.sentiment < 0;
    return (
      <div className="flex gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            isBearish ? 'bg-red-100' : 'bg-green-100'
          }`}
        >
          <IconAlertTriangle
            className={`w-5 h-5 ${isBearish ? 'text-red-600' : 'text-green-600'}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">
                {n.symbol}
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isBearish
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {n.sentiment_label} ({n.sentiment?.toFixed(2)})
              </span>
            </div>
            <span className="text-xs text-gray-400">
              {timeAgo(n._timestamp)}
            </span>
          </div>
          {n.title && (
            <p className="text-sm text-gray-700 mt-1">{n.title}</p>
          )}
          {n.reason && (
            <p className="text-xs text-gray-500 mt-0.5">{n.reason}</p>
          )}
          <p className="text-[10px] text-gray-400 mt-1">
            {n.notified_count ?? 0} user(s) notified ·{' '}
            {formatTime(n._timestamp)}
          </p>
        </div>
      </div>
    );
  }

  // Email status notification
  const isSent = n.status === 'sent';
  return (
    <div className="flex gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isSent ? 'bg-emerald-100' : 'bg-red-100'
        }`}
      >
        {isSent ? (
          <IconCheck className="w-5 h-5 text-emerald-600" />
        ) : (
          <IconX className="w-5 h-5 text-red-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconMail className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm font-medium text-gray-900">
              Email {isSent ? 'delivered' : 'failed'}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {timeAgo(n._timestamp)}
          </span>
        </div>
        <p className="text-sm text-gray-700 mt-0.5 truncate">
          {n.subject || 'No subject'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          To: {n.to} · {formatTime(n._timestamp)}
        </p>
      </div>
    </div>
  );
}

/* ─── Bad News Row ─────────────────────────────────── */
function BadNewsRow({ item }: { item: SentimentApiResponse }) {
  return (
    <div className="flex gap-4 px-5 py-4 hover:bg-red-50/30 transition-colors">
      <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-red-100">
        <IconAlertTriangle className="w-5 h-5 text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">
              {item.symbol}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {item.emotion} ({item.sentiment?.toFixed(2)})
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {timeAgo(item.published)}
          </span>
        </div>
        {item.title && (
          <p className="text-sm text-gray-700 mt-1">
            {item.link ? (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-red-600 hover:underline"
              >
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </p>
        )}
        {item.reason && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
            {item.reason}
          </p>
        )}
        <p className="text-[10px] text-gray-400 mt-1">
          {formatTime(item.published)}
          {item.created_at && ` · Analyzed ${formatTime(item.created_at)}`}
        </p>
      </div>
    </div>
  );
}

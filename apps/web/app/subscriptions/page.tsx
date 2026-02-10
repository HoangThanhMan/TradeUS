'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/src/components/page/Header';
import {
  subscriptionService,
  Subscription,
} from '../../src/services/subscription.service';
import { Plus_Jakarta_Sans } from 'next/font/google';
import {
  IconBell,
  IconBellOff,
  IconPlus,
  IconTrash,
  IconMail,
  IconMailOff,
  IconScribble,
} from '@tabler/icons-react';
import { useAlertNotification } from '../../src/contexts/AlertNotificationContext';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const POPULAR_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'DOGEUSDT',
  'DOTUSDT',
];

export default function SubscriptionsPage() {
  const router = useRouter();
  const { subscribeSymbols, unsubscribeSymbols } = useAlertNotification();
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [customSymbol, setCustomSymbol] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    const token = sessionStorage.getItem('accessToken');
    if (!token) {
      router.push('/auth');
      return;
    }

    const storedUser = sessionStorage.getItem('user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      const id = parsed._id || parsed.id || parsed.userId || '';
      setUserId(id);
      if (id) fetchSubscriptions(id);
    }
  }, [router]);

  const fetchSubscriptions = async (uid: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await subscriptionService.getUserSubscriptions(uid);
      setSubscriptions(data.subscriptions || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load subscriptions');
      if (err.response?.status === 401) {
        sessionStorage.removeItem('accessToken');
        router.push('/auth');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (symbol: string) => {
    if (!userId) return;
    try {
      setActionLoading(symbol);
      setError(null);
      await subscriptionService.subscribe(userId, symbol.toUpperCase());
      subscribeSymbols([symbol.toUpperCase()]);
      setSuccess(`Subscribed to ${symbol.toUpperCase()}`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchSubscriptions(userId);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to subscribe');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnsubscribe = async (symbol: string) => {
    if (!userId) return;
    try {
      setActionLoading(symbol);
      setError(null);
      await subscriptionService.unsubscribe(userId, symbol);
      unsubscribeSymbols([symbol]);
      setSuccess(`Unsubscribed from ${symbol}`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchSubscriptions(userId);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to unsubscribe');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCustomSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSymbol.trim()) return;
    await handleSubscribe(customSymbol.trim());
    setCustomSymbol('');
  };

  const isSubscribed = (symbol: string) =>
    subscriptions.some((s) => s.symbol === symbol);

  return (
    <div className={`min-h-screen bg-gray-50 ${pjs.className}`}>
      <Header status={{ connected: true, clientId: null, instanceId: null }} />
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2  rounded-lg">
                <IconBell className="w-7.5 h-7.5 text-gray-700" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Symbol Subscriptions
                </h1>
                <p className="text-sm text-gray-500">
                  Subscribe to symbols to receive sentiment alerts
                </p>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          {/* Custom Symbol */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-[16px] flex items-center font-semibold text-gray-900 mb-3">
              <div
                className={`p-2 mr-3 rounded-lg ${emailEnabled ? 'bg-blue-100' : 'bg-blue-100'}`}
              >
                <IconScribble className="w-5 h-5 text-blue-600 flex flex-col" />
              </div>
              Subscribe to a symbol
            </h2>
            <form onSubmit={handleCustomSubscribe} className="flex gap-3 mb-5">
              <input
                type="text"
                placeholder="Enter symbol (e.g. BTCUSDT)"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                className="flex-1 placeholder-black placeholder:text-[12px] px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={!customSymbol.trim() || actionLoading !== null}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <IconPlus className="w-4 h-4" />
                <div className="text-[12px]">Subscribe</div>
              </button>
            </form>
            {/* Popular Symbols */}
            <div className="bg-white rounded-xl mb-6">
              <h2 className="text-[12px] font-medium text-gray-900 mb-3">
                Popular Symbols
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {POPULAR_SYMBOLS.map((symbol) => {
                  const subscribed = isSubscribed(symbol);
                  return (
                    <button
                      key={symbol}
                      onClick={() =>
                        subscribed
                          ? handleUnsubscribe(symbol)
                          : handleSubscribe(symbol)
                      }
                      disabled={actionLoading === symbol}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium transition-colors ${
                        subscribed
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                          : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200'
                      } disabled:opacity-50`}
                    >
                      {actionLoading === symbol ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                      ) : subscribed ? (
                        <IconBellOff className="w-4 h-4" />
                      ) : (
                        <IconBell className="w-4 h-4" />
                      )}
                      {symbol}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Email Notification Setting */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${emailEnabled ? 'bg-emerald-100' : 'bg-gray-100'}`}
                >
                  {emailEnabled ? (
                    <IconMail className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <IconMailOff className="w-5 h-5 text-gray-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Email Notifications
                  </h2>
                  <p className="text-xs text-gray-500">
                    Receive email alerts when sentiment changes for your
                    subscribed symbols
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEmailEnabled(!emailEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  emailEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                    emailEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {emailEnabled && (
              <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                ✓ Email alerts are enabled. When negative news is detected, the
                Email Service will send you an alert via RabbitMQ.
              </p>
            )}
          </div>

          {/* Current Subscriptions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Your Subscriptions ({subscriptions.length})
            </h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No subscriptions yet. Subscribe to symbols above to receive
                alerts.
              </div>
            ) : (
              <div className="space-y-2">
                {subscriptions.map((sub) => (
                  <div
                    key={sub._id}
                    className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <span className="font-semibold text-gray-900 text-[13px]">
                        {sub.symbol}
                      </span>
                      <span className="text-xs text-gray-500 ml-2 text-[10px]">
                        since{' '}
                        {new Date(sub.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUnsubscribe(sub.symbol)}
                      disabled={actionLoading === sub.symbol}
                      className="flex items-center gap-1 text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === sub.symbol ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
                      ) : (
                        <IconTrash className="w-4 h-4" />
                      )}
                      
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

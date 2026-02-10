'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { IconBell, IconBellOff, IconLoader2 } from '@tabler/icons-react';
import { subscriptionService } from '../../services/subscription.service';
import { useAlertNotification } from '../../contexts/AlertNotificationContext';

interface SubscribeButtonProps {
  symbol: string;
}

export function SubscribeButton({ symbol }: SubscribeButtonProps) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const { subscribeSymbols, unsubscribeSymbols } = useAlertNotification();

  useEffect(() => {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        const uid = parsed._id || parsed.id || parsed.userId || '';
        setUserId(uid);
      } catch {}
    }
  }, []);

  // Check subscription status when symbol changes
  useEffect(() => {
    if (!userId || !symbol) return;
    let cancelled = false;

    subscriptionService
      .checkSubscription(userId, symbol)
      .then((data) => {
        if (!cancelled) setIsSubscribed(data.subscribed);
      })
      .catch(() => {
        if (!cancelled) setIsSubscribed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, symbol]);

  const handleToggle = useCallback(async () => {
    if (!userId || loading) return;
    setLoading(true);
    try {
      if (isSubscribed) {
        await subscriptionService.unsubscribe(userId, symbol);
        unsubscribeSymbols([symbol]);
        setIsSubscribed(false);
      } else {
        await subscriptionService.subscribe(userId, symbol);
        subscribeSymbols([symbol]);
        setIsSubscribed(true);
      }
    } catch (err) {
      console.error('Subscription toggle failed:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, symbol, isSubscribed, loading, subscribeSymbols, unsubscribeSymbols]);

  if (!userId) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      title={isSubscribed ? `Unsubscribe from ${symbol}` : `Subscribe to ${symbol} alerts`}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
        transition-all duration-200 border
        ${loading ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
        ${
          isSubscribed
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200'
        }
      `}
    >
      {loading ? (
        <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isSubscribed ? (
        <IconBellOff className="w-3.5 h-3.5" />
      ) : (
        <IconBell className="w-3.5 h-3.5" />
      )}
      {isSubscribed ? 'Subscribed' : 'Subscribe'}
    </button>
  );
}

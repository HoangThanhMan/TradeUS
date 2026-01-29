// src/components/dashboard/SentimentPanel.tsx

'use client';

import React, { useState, useEffect } from 'react';
import {
  useSentimentWebSocket,
  SentimentResultData,
  SentimentAlertData,
} from '../../hooks/useSentimentWebSocket';

const SENTIMENT_WS_URL = process.env.NEXT_PUBLIC_SENTIMENT_WS_URL || 'http://localhost/sentiment';

interface SentimentNews {
  id: string;
  title: string;
  summary: string;
  sentiment: 'Optimism' | 'Pessimism' | 'Neutral';
  emotion: string;
  sentimentScore: number;
  publishedAt: string;
  source: string;
  url: string;
  symbol: string;
  isNew: boolean; // Published within 24 hours
}

interface SentimentPanelProps {
  symbol: string;
  onClose: () => void;
}

/**
 * Check if a date is within the last 24 hours
 */
const isWithin24Hours = (dateString: string): boolean => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours >= 0 && diffHours <= 24;
};

/**
 * Map WebSocket data to SentimentNews interface
 */
const mapToSentimentNews = (data: SentimentResultData): SentimentNews => {
  // Determine sentiment category based on score
  let sentimentCategory: 'Optimism' | 'Pessimism' | 'Neutral';
  if (data.sentiment > 0.2) {
    sentimentCategory = 'Optimism';
  } else if (data.sentiment < -0.2) {
    sentimentCategory = 'Pessimism';
  } else {
    sentimentCategory = 'Neutral';
  }

  // Extract source from URL
  let source = 'Unknown';
  try {
    const url = new URL(data.link);
    source = url.hostname.replace('www.', '');
  } catch {
    source = 'News';
  }

  const publishedAt = data.published || data.created_at || new Date().toISOString();

  return {
    id: data.id || `${Date.now()}-${Math.random()}`,
    title: data.title,
    summary: data.reason,
    sentiment: sentimentCategory,
    emotion: data.emotion,
    sentimentScore: data.sentiment,
    publishedAt,
    source,
    url: data.link,
    symbol: data.symbol,
    isNew: isWithin24Hours(publishedAt),
  };
};

export function SentimentPanel({ symbol, onClose }: SentimentPanelProps) {
  const [news, setNews] = useState<SentimentNews[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);

  const {
    status,
    error,
    sentimentResults,
    alerts,
    batchInfo,
    subscribe,
    unsubscribe,
    clearResults,
  } = useSentimentWebSocket(SENTIMENT_WS_URL);

  // Subscribe khi component mount và symbol thay đổi
  useEffect(() => {
    if (status.connected && symbol) {
      console.log('📥 Subscribing to sentiment for:', symbol);
      subscribe([symbol]);

      return () => {
        console.log('📤 Unsubscribing from sentiment for:', symbol);
        unsubscribe([symbol]);
      };
    }
  }, [status.connected, symbol, subscribe, unsubscribe]);

  // Update news when sentimentResults changes
  useEffect(() => {
    const filteredResults = sentimentResults.filter(
      (r) => r.symbol?.toUpperCase() === symbol.toUpperCase()
    );
    const mappedNews = filteredResults.map(mapToSentimentNews);
    
    // Sort by published date (newest first)
    mappedNews.sort((a, b) => {
      const dateA = new Date(a.publishedAt);
      const dateB = new Date(b.publishedAt);
      return dateB.getTime() - dateA.getTime();
    });
    
    setNews(mappedNews);
  }, [sentimentResults, symbol]);

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    
    if (diffMs < 0) return 'just now';
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return 'just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    }
    if (diffDays < 7) {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    }
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'Optimism':
        return 'text-green-500';
      case 'Pessimism':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'Optimism':
        return '📈';
      case 'Pessimism':
        return '📉';
      default:
        return '➡️';
    }
  };

  const getAlertTypeColor = (alertType: string) => {
    switch (alertType) {
      case 'extreme_positive':
        return 'bg-green-100 text-green-800';
      case 'extreme_negative':
        return 'bg-red-100 text-red-800';
      case 'trend_change':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredAlerts = alerts.filter(
    (a) => a.symbol?.toUpperCase() === symbol.toUpperCase()
  );

  // Count new news (within 24h)
  const newNewsCount = news.filter(n => n.isNew).length;

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">📰</span>
          <h3 className="font-semibold text-gray-900">Sentiment News</h3>
          {newNewsCount > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full font-medium min-w-[20px] text-center">
              {newNewsCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status indicator */}
          <div
            className={`w-2 h-2 rounded-full ${
              status.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}
            title={status.connected ? 'Connected' : 'Disconnected'}
          />
          <button
            onClick={clearResults}
            className="text-gray-400 hover:text-blue-500 transition-colors"
            title="Clear"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => setShowAlerts(false)}
          className={`flex-1 py-2 text-sm font-medium ${
            !showAlerts
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📊 Results ({news.length})
        </button>
        <button
          onClick={() => setShowAlerts(true)}
          className={`flex-1 py-2 text-sm font-medium ${
            showAlerts
              ? 'text-red-600 border-b-2 border-red-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ⚠️ Alerts ({filteredAlerts.length})
        </button>
      </div>

      {/* Batch Info */}
      {batchInfo && (
        <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 flex-shrink-0">
          <div className="flex items-center gap-1">
            <span>📦</span>
            <span>
              Last batch: {batchInfo.total_analyzed} analyzed | Avg:{' '}
              {batchInfo.average_sentiment?.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!status.connected ? (
          <div className="flex flex-col items-center justify-center h-32 text-yellow-600 p-4">
            <span className="text-2xl mb-2">🔌</span>
            <span className="text-sm text-center">Connecting to sentiment stream...</span>
            {error && (
              <span className="text-xs text-red-500 mt-1">{error}</span>
            )}
          </div>
        ) : showAlerts ? (
          // Alerts Tab
          filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <span className="text-2xl mb-2">🔔</span>
              <span>No alerts for {symbol}</span>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {filteredAlerts.map((alert, index) => (
                <div
                  key={index}
                  className="bg-red-50 rounded-lg p-3 border border-red-100"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${getAlertTypeColor(
                        alert.alert_type
                      )}`}
                    >
                      {alert.alert_type.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500">{alert.symbol}</span>
                  </div>
                  <p className="text-sm text-gray-700">{alert.message}</p>
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <span>Score: {alert.sentiment_score?.toFixed(2)}</span>
                    <span>Threshold: {alert.threshold}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : // Results Tab
        news.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <span className="text-2xl mb-2">📭</span>
            <span>Waiting for sentiment data...</span>
            <span className="text-xs text-gray-400 mt-1">
              Subscribed to {symbol}
            </span>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {news.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg p-3 border transition-colors ${
                  item.isNew 
                    ? 'bg-green-50 border-green-200 ring-1 ring-green-100' 
                    : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                }`}
              >
                {/* Header with badges */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {/* NEW badge for news within 24h */}
                      {item.isNew && (
                        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded font-bold uppercase animate-pulse">
                          New
                        </span>
                      )}
                      {/* Source badge */}
                      <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded">
                        {item.source}
                      </span>
                    </div>
                    <h4 className="font-medium text-gray-900 text-sm leading-tight">
                      {item.title}
                    </h4>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-blue-500 flex-shrink-0"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>

                {/* AI Analysis Box */}
                <div className="bg-green-50 border border-green-100 rounded-md p-2 mb-2">
                  <div className="flex items-center gap-1 text-green-600 text-xs font-medium mb-1">
                    <span>🤖</span>
                    <span>AI Market Analysis</span>
                  </div>
                  <p
                    className={`text-xs text-gray-600 ${
                      expandedId === item.id ? '' : 'line-clamp-3'
                    }`}
                  >
                    {item.summary}
                  </p>
                  {item.summary && item.summary.length > 100 && (
                    <button
                      onClick={() =>
                        setExpandedId(expandedId === item.id ? null : item.id)
                      }
                      className="text-xs text-green-600 hover:text-green-700 mt-1"
                    >
                      {expandedId === item.id ? '▲ Read less' : '▼ Read more'}
                    </button>
                  )}
                </div>

                {/* Sentiment & Meta */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Sentiment:</span>
                    <span
                      className={`font-medium flex items-center gap-1 ${getSentimentColor(
                        item.sentiment
                      )}`}
                    >
                      {getSentimentIcon(item.sentiment)} {item.sentiment}
                    </span>
                    <span className="text-gray-400">
                      ({item.sentimentScore > 0 ? '+' : ''}
                      {item.sentimentScore.toFixed(2)})
                    </span>
                  </div>
                </div>

                {/* Emotion Badge */}
                <div className="flex items-center justify-between mt-2 text-xs">
                  <div className="flex items-center gap-1 text-gray-500">
                    <span>Emotion:</span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-600 rounded">
                      {item.emotion}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                  <div className="flex items-center gap-1">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>{formatTimeAgo(item.publishedAt)}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-gray-200 rounded text-gray-600">
                    {item.symbol}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Status */}
      <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span>
            {status.connected ? (
              <span className="text-green-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                Live
              </span>
            ) : (
              <span className="text-red-600">● Disconnected</span>
            )}
          </span>
          <span>{symbol} | {news.length} news</span>
        </div>
      </div>
    </div>
  );
}
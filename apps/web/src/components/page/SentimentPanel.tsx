// src/components/dashboard/SentimentPanel.tsx

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  useSentimentWebSocket,
  SentimentResultData,
  SentimentAlertData,
} from '../../hooks/useSentimentWebSocket';
import { sentimentService } from '../../services/sentiment.service';

const SENTIMENT_WS_URL = process.env.NEXT_PUBLIC_SENTIMENT_WS_URL || 'http://localhost/sentiment';

type NewsTimeCategory = 'latest' | 'today' | 'yesterday' | 'earlier';

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
  timeCategory: NewsTimeCategory;
}

interface SentimentPanelProps {
  symbol: string;
  onClose: () => void;
}

/**
 * Get time category for a date
 */
const getTimeCategory = (dateString: string): NewsTimeCategory => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (diffHours <= 1) {
    return 'latest';
  } else if (diffHours <= 24) {
    return 'today';
  } else if (diffHours <= 48) {
    return 'yesterday';
  }
  return 'earlier';
};

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
    timeCategory: getTimeCategory(publishedAt),
  };
};

/**
 * Map API response to SentimentNews interface
 */
const mapApiToSentimentNews = (data: any): SentimentNews => {
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
    id: data.id || data._id || `${Date.now()}-${Math.random()}`,
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
    timeCategory: getTimeCategory(publishedAt),
  };
};

/**
 * Get category label for display
 */
const getCategoryLabel = (category: NewsTimeCategory): string => {
  switch (category) {
    case 'latest':
      return '🔴 Latest (1 hour)';
    case 'today':
      return '🟡 Today';
    case 'yesterday':
      return '🔵 Yesterday';
    case 'earlier':
      return '⚪ Earlier';
  }
};

/**
 * Get category badge color
 */
const getCategoryBadgeStyle = (category: NewsTimeCategory): string => {
  switch (category) {
    case 'latest':
      return 'bg-red-500 text-white animate-pulse';
    case 'today':
      return 'bg-yellow-500 text-white';
    case 'yesterday':
      return 'bg-blue-500 text-white';
    case 'earlier':
      return 'bg-gray-400 text-white';
  }
};

export function SentimentPanel({ symbol, onClose }: SentimentPanelProps) {
  const [news, setNews] = useState<SentimentNews[]>([]);
  const [historicalNews, setHistoricalNews] = useState<SentimentNews[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
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

  // Load historical news from API when symbol changes
  const loadHistoricalNews = useCallback(async () => {
    if (!symbol) return;
    
    setIsLoadingHistory(true);
    try {
      console.log('📚 Loading historical news for:', symbol);
      // Load up to 50 historical news items
      const data = await sentimentService.getSentimentsBySymbol(symbol, 50, 0);
      const mapped = data.map(mapApiToSentimentNews);
      
      // Sort by published date (newest first)
      mapped.sort((a, b) => {
        const dateA = new Date(a.publishedAt);
        const dateB = new Date(b.publishedAt);
        return dateB.getTime() - dateA.getTime();
      });
      
      setHistoricalNews(mapped);
      console.log(`📚 Loaded ${mapped.length} historical news items`);
    } catch (err) {
      console.error('Failed to load historical news:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [symbol]);

  // Load historical news on mount and when symbol changes
  useEffect(() => {
    loadHistoricalNews();
  }, [loadHistoricalNews]);

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

  // Combine realtime news with historical news
  useEffect(() => {
    const filteredResults = sentimentResults.filter(
      (r) => r.symbol?.toUpperCase() === symbol.toUpperCase()
    );
    const realtimeNews = filteredResults.map(mapToSentimentNews);
    
    // Merge realtime and historical, removing duplicates by id
    const allNewsMap = new Map<string, SentimentNews>();
    
    // Add historical news first
    historicalNews.forEach(item => {
      allNewsMap.set(item.id, item);
    });
    
    // Add realtime news (will overwrite if same id)
    realtimeNews.forEach(item => {
      allNewsMap.set(item.id, item);
    });
    
    // Convert to array and sort
    const combinedNews = Array.from(allNewsMap.values());
    combinedNews.sort((a, b) => {
      const dateA = new Date(a.publishedAt);
      const dateB = new Date(b.publishedAt);
      return dateB.getTime() - dateA.getTime();
    });
    
    setNews(combinedNews);
  }, [sentimentResults, historicalNews, symbol]);

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

  // Count news by category
  const latestNewsCount = news.filter(n => n.timeCategory === 'latest').length;
  const todayNewsCount = news.filter(n => n.timeCategory === 'today').length;
  const newNewsCount = latestNewsCount + todayNewsCount;

  // Group news by category for display
  const groupedNews = {
    latest: news.filter(n => n.timeCategory === 'latest'),
    today: news.filter(n => n.timeCategory === 'today'),
    yesterday: news.filter(n => n.timeCategory === 'yesterday'),
    earlier: news.filter(n => n.timeCategory === 'earlier'),
  };

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
        isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center h-32 text-blue-600 p-4">
            <span className="text-2xl mb-2 animate-spin">⏳</span>
            <span className="text-sm text-center">Loading historical news...</span>
          </div>
        ) : news.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <span className="text-2xl mb-2">📭</span>
            <span>No sentiment data available</span>
            <span className="text-xs text-gray-400 mt-1">
              Subscribed to {symbol}
            </span>
            <button
              onClick={loadHistoricalNews}
              className="mt-2 px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              🔄 Reload
            </button>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Render grouped news by category */}
            {(['latest', 'today', 'yesterday', 'earlier'] as NewsTimeCategory[]).map(category => {
              const categoryNews = groupedNews[category];
              if (categoryNews.length === 0) return null;
              
              return (
                <div key={category}>
                  {/* Category Header */}
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white py-1 z-10">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${getCategoryBadgeStyle(category)}`}>
                      {getCategoryLabel(category)}
                    </span>
                    <span className="text-xs text-gray-400">({categoryNews.length})</span>
                  </div>
                  
                  {/* News items */}
                  <div className="space-y-3">
                    {categoryNews.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg p-3 border transition-colors ${
                  item.timeCategory === 'latest'
                    ? 'bg-red-50 border-red-200 ring-1 ring-red-100'
                    : item.timeCategory === 'today'
                    ? 'bg-yellow-50 border-yellow-200'
                    : item.timeCategory === 'yesterday'
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                }`}
              >
                {/* Header with badges */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {/* Time category badge */}
                      {item.timeCategory === 'latest' && (
                        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded font-bold uppercase animate-pulse">
                          🔴 Latest
                        </span>
                      )}
                      {item.timeCategory === 'today' && (
                        <span className="px-1.5 py-0.5 bg-yellow-500 text-white text-[10px] rounded font-bold uppercase">
                          Today
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Status */}
      <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
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
          <span>{symbol} | {news.length} tin</span>
        </div>
        {/* Category summary */}
        <div className="flex items-center gap-2 text-[10px]">
          {latestNewsCount > 0 && (
            <span className="text-red-500">🔴 {latestNewsCount} mới nhất</span>
          )}
          {todayNewsCount > 0 && (
            <span className="text-yellow-600">🟡 {todayNewsCount} hôm nay</span>
          )}
          {groupedNews.yesterday.length > 0 && (
            <span className="text-blue-500">🔵 {groupedNews.yesterday.length} hôm qua</span>
          )}
        </div>
      </div>
    </div>
  );
}
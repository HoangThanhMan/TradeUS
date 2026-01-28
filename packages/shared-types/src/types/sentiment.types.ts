// Sentiment event types
export enum SentimentEventType {
  SENTIMENT_ANALYZED = 'sentiment.analyzed',
  SENTIMENT_ALERT = 'sentiment.alert',
  SENTIMENT_BATCH_COMPLETE = 'sentiment.batch_complete',
  NEWS_RECEIVED = 'news.received',
  NEWS_COLLECTED = 'news.collected',
}

// Base message interface for all sentiment RabbitMQ messages
export interface SentimentBaseMessage {
  event: string;
  timestamp: string;
  source: string;
  correlation_id?: string;
}

// Sentiment result data payload (flat format for real-time events)
export interface SentimentResultData {
  id?: string;
  symbol: string;
  sentiment: number; // -1 to 1
  emotion: string;
  reason: string;
  title: string;
  link: string;
  published?: string;
  created_at?: string;
}

// Sentiment historical data payload (nested format for API responses)
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
    emotion: 'positive' | 'negative' | 'neutral' | 'mixed';
    reason: string;
    confidence: number;
    processedAt: string;
  };
}

// Sentiment result message
export interface SentimentResultMessage extends SentimentBaseMessage {
  event: SentimentEventType.SENTIMENT_ANALYZED;
  data: SentimentResultData;
}

// Sentiment alert data payload
export interface SentimentAlertData {
  symbol: string;
  sentiment_score: number;
  emotion: string;
  alert_type: 'extreme_positive' | 'extreme_negative' | 'trend_change';
  message: string;
  threshold: number;
}

// Sentiment alert message
export interface SentimentAlertMessage extends SentimentBaseMessage {
  event: SentimentEventType.SENTIMENT_ALERT;
  data: SentimentAlertData;
}

// Batch complete data payload
export interface BatchCompleteData {
  total_analyzed: number;
  symbols: string[];
  average_sentiment: number;
  duration_seconds?: number;
  source?: string;
}

// Batch complete message
export interface BatchCompleteMessage extends SentimentBaseMessage {
  event: SentimentEventType.SENTIMENT_BATCH_COMPLETE;
  data: BatchCompleteData;
}

// News data payload
export interface NewsMessageData {
  title: string;
  content?: string;
  summary?: string;
  link: string;
  source?: string;
  symbol?: string;
  published_at?: string;
  metadata?: Record<string, unknown>;
}

// News message
export interface NewsMessage extends SentimentBaseMessage {
  event: SentimentEventType.NEWS_RECEIVED | SentimentEventType.NEWS_COLLECTED;
  data: NewsMessageData;
}

// Union type for all sentiment messages
export type SentimentMessage =
  | SentimentResultMessage
  | SentimentAlertMessage
  | BatchCompleteMessage
  | NewsMessage;

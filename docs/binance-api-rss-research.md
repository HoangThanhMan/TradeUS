# Binance API & RSS Feeds Research Documentation

> **Author:** Data & ML Team (Nhi)  
> **Date:** December 2024  
> **Purpose:** Research documentation for Trade-X Week 2 implementation

---

## Table of Contents

1. [Binance API Overview](#1-binance-api-overview)
2. [WebSocket Streams](#2-websocket-streams)
3. [REST API Endpoints](#3-rest-api-endpoints)
4. [Rate Limits & Best Practices](#4-rate-limits--best-practices)
5. [RSS Feeds for Crypto News](#5-rss-feeds-for-crypto-news)
6. [Implementation Recommendations](#6-implementation-recommendations)

---

## 1. Binance API Overview

### 1.1 Base URLs

| Environment | REST API | WebSocket |
|-------------|----------|-----------|
| **Production** | `https://api.binance.com` | `wss://stream.binance.com:9443/ws` |
| **Testnet** | `https://testnet.binance.vision` | `wss://testnet.binance.vision/ws` |

### 1.2 Authentication

- **Public endpoints:** No authentication required (market data, prices)
- **Private endpoints:** Require API Key + Secret (trading, account info)

For Trade-X Week 1-2, we only need **public endpoints** for price data collection.

### 1.3 API Key Generation (for future use)

1. Go to Binance → API Management
2. Create new API key with appropriate permissions
3. Store securely (never commit to git)

---

## 2. WebSocket Streams

### 2.1 Connection Details

```
Base URL: wss://stream.binance.com:9443
Single stream: /ws/<streamName>
Combined streams: /stream?streams=<stream1>/<stream2>
```

### 2.2 Available Streams for Price Data

#### 2.2.1 Mini Ticker (Recommended for Real-time Prices)

**Stream:** `<symbol>@miniTicker`  
**Update frequency:** ~1 second

```json
{
  "e": "24hrMiniTicker",
  "E": 1703836800000,
  "s": "BTCUSDT",
  "c": "42180.50",
  "o": "41950.00",
  "h": "42500.00",
  "l": "41800.00",
  "v": "12345.678",
  "q": "519876543.21"
}
```

| Field | Description |
|-------|-------------|
| `e` | Event type |
| `E` | Event time (ms) |
| `s` | Symbol |
| `c` | Close price |
| `o` | Open price |
| `h` | High price |
| `l` | Low price |
| `v` | Base asset volume |
| `q` | Quote asset volume |

#### 2.2.2 Kline/Candlestick

**Stream:** `<symbol>@kline_<interval>`  
**Intervals:** 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M

```json
{
  "e": "kline",
  "E": 1703836800000,
  "s": "BTCUSDT",
  "k": {
    "t": 1703836800000,
    "T": 1703836859999,
    "s": "BTCUSDT",
    "i": "1m",
    "f": 123456789,
    "L": 123456799,
    "o": "42150.00",
    "c": "42180.50",
    "h": "42200.00",
    "l": "42100.00",
    "v": "100.123",
    "n": 150,
    "x": false,
    "q": "4218765.43",
    "V": "60.456",
    "Q": "2547890.12"
  }
}
```

#### 2.2.3 Trade Stream (Individual Trades)

**Stream:** `<symbol>@trade`

```json
{
  "e": "trade",
  "E": 1703836800123,
  "s": "BTCUSDT",
  "t": 123456789,
  "p": "42180.50",
  "q": "0.123",
  "T": 1703836800100,
  "m": true
}
```

#### 2.2.4 Aggregate Trade Stream

**Stream:** `<symbol>@aggTrade`

More efficient than individual trades for high-volume pairs.

### 2.3 Combined Streams

Connect to multiple streams in one WebSocket:

```
wss://stream.binance.com:9443/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker
```

Or using the shorter format:
```
wss://stream.binance.com:9443/ws/btcusdt@miniTicker/ethusdt@miniTicker
```

### 2.4 WebSocket Best Practices

1. **Connection Limits:** Max 5 messages per second per connection
2. **Ping/Pong:** Server sends ping every 3 minutes; respond with pong
3. **Reconnection:** Implement exponential backoff
4. **Connection Lifetime:** Connections are valid for 24 hours

---

## 3. REST API Endpoints

### 3.1 Market Data (Public)

#### Get Current Price

```http
GET /api/v3/ticker/price?symbol=BTCUSDT
```

Response:
```json
{
  "symbol": "BTCUSDT",
  "price": "42180.50000000"
}
```

#### Get 24h Ticker

```http
GET /api/v3/ticker/24hr?symbol=BTCUSDT
```

#### Get Klines (Historical)

```http
GET /api/v3/klines?symbol=BTCUSDT&interval=1h&limit=100
```

Response: Array of OHLCV data

#### Get Order Book

```http
GET /api/v3/depth?symbol=BTCUSDT&limit=100
```

### 3.2 Exchange Info

```http
GET /api/v3/exchangeInfo
```

Returns all trading pairs, filters, and limits.

---

## 4. Rate Limits & Best Practices

### 4.1 Rate Limits

| Limit Type | Value |
|------------|-------|
| Request weight | 1200/minute |
| Orders | 10/second |
| WebSocket connections | 5/IP |
| Messages per connection | 5/second |

### 4.2 Best Practices

1. **Use WebSocket for real-time data** (not REST polling)
2. **Cache exchange info** (updates infrequently)
3. **Handle rate limit headers:**
   - `X-MBX-USED-WEIGHT-1M`
   - `Retry-After`
4. **Implement circuit breaker** for API failures
5. **Use testnet for development**

---

## 5. RSS Feeds for Crypto News

### 5.1 Recommended RSS Feeds

#### 5.1.1 Major Crypto News Sources

| Source | RSS URL | Update Frequency |
|--------|---------|------------------|
| **CoinDesk** | `https://www.coindesk.com/arc/outboundfeeds/rss/` | High |
| **CoinTelegraph** | `https://cointelegraph.com/rss` | High |
| **Bitcoin Magazine** | `https://bitcoinmagazine.com/.rss/full/` | Medium |
| **The Block** | `https://www.theblock.co/rss.xml` | High |
| **Decrypt** | `https://decrypt.co/feed` | Medium |

#### 5.1.2 Financial News (Crypto Coverage)

| Source | RSS URL |
|--------|---------|
| **Reuters Crypto** | `https://www.reuters.com/technology/rss` |
| **Bloomberg Crypto** | `https://www.bloomberg.com/feed/bview/sitemap_news.xml` |
| **Yahoo Finance** | `https://finance.yahoo.com/news/rssindex` |

#### 5.1.3 Technical/Development News

| Source | RSS URL |
|--------|---------|
| **Bitcoin Core** | `https://bitcoin.org/en/rss/releases.rss` |
| **Ethereum Blog** | `https://blog.ethereum.org/feed.xml` |

### 5.2 RSS Feed Structure

Typical RSS feed entry:

```xml
<item>
  <title>Bitcoin Surges Past $42,000</title>
  <link>https://example.com/article/123</link>
  <description>Bitcoin reached new highs...</description>
  <pubDate>Sun, 29 Dec 2024 10:30:00 GMT</pubDate>
  <category>Bitcoin</category>
  <category>Price Analysis</category>
</item>
```

### 5.3 Parsing Libraries

#### Python

```python
import feedparser

feed = feedparser.parse("https://www.coindesk.com/arc/outboundfeeds/rss/")
for entry in feed.entries:
    print(entry.title, entry.published)
```

#### Node.js

```javascript
import Parser from 'rss-parser';

const parser = new Parser();
const feed = await parser.parseURL('https://www.coindesk.com/arc/outboundfeeds/rss/');
feed.items.forEach(item => {
    console.log(item.title, item.pubDate);
});
```

### 5.4 RSS Best Practices

1. **Polling interval:** 5-15 minutes (respect `ttl` tag)
2. **Caching:** Store last fetch time and ETags
3. **Deduplication:** Track seen article GUIDs
4. **Error handling:** Feeds may be temporarily unavailable

---

## 6. Implementation Recommendations

### 6.1 Week 2 Priorities

1. **collector-news service (Node.js)**
   - Fetch RSS feeds periodically
   - Parse and normalize articles
   - Publish to RabbitMQ (`tradex.news` exchange)

2. **Enhance sentiment-service (Python)**
   - Consume news from RabbitMQ
   - Apply NLP sentiment analysis
   - Store results in Redis/MongoDB

### 6.2 Suggested Architecture

```
                                    ┌─────────────────────┐
┌─────────────────┐                 │                     │
│   RSS Feeds     │────────────────>│  collector-news     │
│  (CoinDesk,     │                 │    (Node.js)        │
│  CoinTelegraph) │                 │                     │
└─────────────────┘                 └──────────┬──────────┘
                                               │
                                               │ Publish
                                               ▼
┌─────────────────┐                 ┌─────────────────────┐
│  Binance API    │────────────────>│     RabbitMQ        │
│   WebSocket     │   (Already      │   tradex.prices     │
└─────────────────┘    done!)       │   tradex.news       │
        │                           └──────────┬──────────┘
        │                                      │
        │                                      │ Consume
        ▼                                      ▼
┌─────────────────────┐             ┌─────────────────────┐
│  collector-price    │             │  sentiment-service  │
│    (Node.js)        │             │     (Python)        │
│    ✅ Week 1        │             │  Transformer/BERT   │
└─────────────────────┘             └─────────────────────┘
```

### 6.3 Data Models

#### News Article (RabbitMQ message)

```typescript
interface NewsArticle {
  id: string;           // GUID from RSS
  source: string;       // "coindesk", "cointelegraph"
  title: string;
  summary: string;
  url: string;
  publishedAt: number;  // timestamp
  categories: string[];
  relatedSymbols: string[]; // ["BTC", "ETH"] - extracted
}
```

#### Sentiment Result

```python
@dataclass
class SentimentResult:
    article_id: str
    sentiment: Literal["positive", "negative", "neutral"]
    confidence: float  # 0.0 - 1.0
    symbols_mentioned: list[str]
    processed_at: datetime
```

### 6.4 ML Model Recommendations

| Task | Model | Notes |
|------|-------|-------|
| Sentiment Analysis | `finbert` or `distilbert-base-uncased-finetuned-sst-2` | Financial domain |
| Entity Extraction | `spaCy` + custom patterns | Extract coin symbols |
| Summarization | `facebook/bart-large-cnn` | Optional |

### 6.5 Testing Strategy

1. **Unit tests:** Mock RSS responses
2. **Integration tests:** Use testnet for Binance
3. **Load tests:** Simulate high message volume

---

## Appendix A: Binance Symbol List (Top 20)

```
BTCUSDT, ETHUSDT, BNBUSDT, XRPUSDT, SOLUSDT,
ADAUSDT, DOGEUSDT, DOTUSDT, MATICUSDT, LTCUSDT,
AVAXUSDT, LINKUSDT, ATOMUSDT, UNIUSDT, ETCUSDT,
XLMUSDT, FILUSDT, TRXUSDT, NEARUSDT, APTUSDT
```

## Appendix B: Useful Links

- [Binance API Documentation](https://binance-docs.github.io/apidocs/)
- [Binance WebSocket Streams](https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams)
- [RSS 2.0 Specification](https://www.rssboard.org/rss-specification)
- [FinBERT Model](https://huggingface.co/ProsusAI/finbert)

---

*This document will be updated as we progress through Week 2 implementation.*

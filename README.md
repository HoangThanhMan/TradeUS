# USTrading 📈

> **Trade Smarter, Not Harder** — A real-time cryptocurrency trading platform powered by AI-driven sentiment analysis, price prediction, and advanced backtesting.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Database Design](#database-design)
- [Design Patterns](#design-patterns)
- [Getting Started](#getting-started)
- [Services](#services)
- [Advanced Modules](#advanced-modules)
- [Team](#team)

---

## Overview

USTrading is a full-stack microservices-based trading platform built for cryptocurrency market analysis. It combines real-time price data streaming, machine learning price prediction, AI-powered sentiment analysis, and a comprehensive backtesting engine — all in a single, unified interface.

The system was designed to evolve through three architectural versions, scaling from a monolithic backend to a fully distributed microservices architecture with message broker, load balancing, and container orchestration.

🎬 [Watch Demo on YouTube](https://www.youtube.com/watch?v=X3NT7YbfFSU)

---

## Features

### 📊 Charts & Analysis
- **Single Chart** — Real-time candlestick/line/bar/area charts with live 1-second updates
- **Multi Chart** — Monitor 2–4 trading pairs simultaneously on one screen
- **Multi Timeframe** — View the same symbol across multiple timeframes (1s, 1m, 1h, 1d) side by side
- **Technical Indicators** — MA, EMA, SMA, BOLL, SAR, BBI, RSI, MACD, VOL and more
- **Drawing Tools** — Trendlines, Fibonacci Retracement, geometric shapes

### 🤖 AI-Powered Tools
- **Price Prediction** — LSTM-based ML model predicting next candle log return, with BUY/SELL/HOLD recommendation
- **Sentiment Analysis** — Fine-tuned RoBERTa model classifying news into Optimism, Fear, Greed, Anger, Pessimism with a continuous sentiment score (-1 to +1)
- **AI Chatbot Assistant** — Conversational AI (powered by Gemini) providing real-time market analysis, support/resistance levels, and risk notes
- **News Feed** — Aggregated news from Yahoo Finance, CryptoNews, Reddit with AI-generated summaries and per-article sentiment scores

### 🧪 Backtesting
- Test strategies against historical OHLCV data from Binance
- Pre-built strategy templates: Moving Average Crossover, Bollinger Bands Bounce, RSI Overbought/Oversold, MACD Cross, Volume Breakout
- Custom strategy builder with multi-condition logic (SMA, EMA, Price, RSI, MACD, Bollinger Bands, Keltner Channel, candlestick patterns)
- AI-assisted signal filtering integrated into backtest engine
- Full trade history, win rate, P&L, and visual BUY/SELL/EXIT markers on chart

### 👤 User Management & VIP
- JWT-based authentication (login/register)
- Role-based access: Standard User, VIP Member, Administrator
- VIP subscription (Monthly / Yearly) with VietQR payment integration
- Admin dashboard to approve/reject VIP requests and configure QR payment settings
- Account management with password change and VIP membership details

---

## Architecture

The system evolved through three architectural versions:

### Version 1 — Monolith
Simple Next.js frontend communicating directly with a single backend server via API Gateway. Suitable for early development and small user counts.

### Version 2 — Microservices
System split into independent services: `User Service`, `Sentiment Service`, `Prediction Service`. Added API Gateway for routing. AI/ML tasks separated into Python-based services.

### Version 3 — Production-Ready (Current)
![Architecture](assets/images/architecture.png)


**Key architectural properties:**
- **Performance**: RabbitMQ async processing + Redis caching reduce DB load and latency
- **Scalability**: Each service scales independently; pub/sub allows new consumers without modifying publishers
- **Reliability**: Service isolation prevents cascading failures; RabbitMQ persists messages when consumers are unavailable

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) |
| API Gateway | NestJS |
| User Service | NestJS + TypeScript |
| Sentiment Service | Python (FastAPI / RoBERTa) |
| Prediction Service | Python (PyTorch LSTM, TorchScript) |
| Message Broker | RabbitMQ |
| Primary Database | MongoDB (Mongoose) |
| Cache | Redis |
| Load Balancer | Nginx (IP Hash) |
| Containerization | Docker + Docker Compose |
| Price Data Source | Binance WebSocket & REST API |
| News Sources | Yahoo Finance, CryptoNews, Reddit |
| AI / LLM | Gemini API (chatbot + hybrid sentiment) |
| Payment | VietQR |

---

## Database Design

The system uses **MongoDB** with five main collections:

### `users`
Stores user credentials, roles (`user`, `vip`, `admin`), and VIP subscription metadata (`vipStatus`, `vipPlan`, `vipExpiry`).

### `vip_requests`
Tracks VIP upgrade requests from users including payment plan, amount, and processing status (`PENDING`, `APPROVED`, `REJECTED`).

### `qr_configs`
Admin-managed bank account and QR template configuration for monthly/yearly VIP payment generation via VietQR.

### `collected_news`
Raw news articles scraped from external sources. Includes `metadata.analyzed` flag and reference to the corresponding sentiment record.

### `sentiments`
Stores AI-generated sentiment analysis results per article: numeric `sentiment` score, emotion label, affected trading `symbol`, and the model's `reason`.

### Indexes
```js
// Fast login lookups and duplicate checks
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

// Efficient news queries by source, sorted newest first
collectedNewsSchema.index({ source: 1, published_at: -1 });
```

---

## Design Patterns

| Pattern | Usage in USTrading |
|---|---|
| **Singleton** | `RedisService` — single shared Redis connection across the app |
| **Factory** | `PaymentFactory` — creates `MonthlyPayment` or `YearlyPayment` handler by type |
| **Dependency Injection** | NestJS `@Injectable()` — services receive dependencies via constructor |
| **Repository** | `UserRepository` — encapsulates all Mongoose CRUD; services never touch DB directly |
| **Observer / Pub-Sub** | `BinanceKlineClient` publishes kline events; consumers (storage, alerts, analysis) subscribe via callbacks |
| **Adapter** | `BinanceKlineAdapter` — normalizes raw Binance data into the unified `MarketKline` interface |
| **Builder** | `UserBuilder` / `PaymentBuilder` — fluent API for constructing complex objects step by step |
| **Template Method** | `PassportStrategy` base class; `JwtStrategy` and `LocalStrategy` implement only their specific `validate()` logic |
| **Strategy** | `CanActivate` interface with interchangeable guards: `JwtAuthGuard`, `RolesGuard`, `AdminGuard` |
| **Facade** | `AuthService` — exposes `login`, `register`, `refreshTokens`, `getProfile` while hiding JWT, hashing, and microservice calls |

---

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- Python 3.10+

### Run the full stack

```bash
git clone https://github.com/your-org/ustrading.git
cd ustrading
docker-compose -f docker-compose.dev.yml up --build
```

This will spin up:
- MongoDB
- Redis
- RabbitMQ
- API Gateway (NestJS)
- User Service
- Collector Price Service
- Sentiment Service
- Prediction Service
- WebSocket Gateway (×2 instances)
- Nginx Load Balancer
- Next.js Frontend

### Environment Variables

Each service has its own `.env` file. Copy from the provided `.env.example`:

```bash
cp .env.example .env
```

Key variables:

```env
# API Gateway
JWT_SECRET=your_jwt_secret
JWT_REFRESH_EXPIRY=7d

# MongoDB
MONGO_URI=mongodb://localhost:27017/tradex

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# Gemini (AI Chatbot)
GEMINI_API_KEY=your_gemini_api_key

# Binance
BINANCE_WS_URL=wss://stream.binance.com:9443
```

---

## Services

| Service | Port | Description |
|---|---|---|
| `api-gateway` | 3000 | Central routing, auth, JWT validation |
| `user-service` | 3001 | User CRUD, VIP management, Redis caching |
| `collector-price` | — | Binance WebSocket listener, publishes to RabbitMQ |
| `sentiment-service` | 5001 | News collection + RoBERTa inference + Gemini hybrid analysis |
| `prediction-service` | 5002 | LSTM model inference, RESTful prediction endpoint |
| `ws-gateway-1/2` | 3010/3011 | WebSocket gateways behind Nginx load balancer |
| `symbol-alert-service` | — | Consumes RabbitMQ alerts, stores to Redis |
| `frontend` | 3100 | Next.js web app |

---

## Advanced Modules

### 🧠 Sentiment Analysis (RoBERTa + Gemini Hybrid)
- Base model: `RoBERTa` (~125M params), fine-tuned on financial Twitter/news data from Hugging Face
- Labels: spam filter → emotion classification (Anger, Excitement, Fear, Greed, Optimism, Pessimism) → continuous sentiment score
- Training: Partial Freezing (first 6 layers frozen), Dynamic Masking, Linear Warmup LR, CrossEntropyLoss + MSELoss
- Hybrid layer: for high-volatility news, Gemini API identifies affected trading pairs and explains sentiment shifts

### 📉 Price Prediction (LSTM)
- Input features: OHLCV + technical indicators (RSI, MACD, Bollinger Bands) + sentiment score
- Target: Log Return (stabilizes time series, avoids large absolute price swings)
- Preprocessing: `RobustScaler` (IQR-based, resistant to pump/dump outliers)
- Sliding window: 24 past candles → predict 1 future candle
- Training: PyTorch + CUDA on Colab, Adam optimizer, MSE loss
- Deployment: TorchScript (`.pt`) compiled model served via FastAPI microservice with zero-downtime model swapping

### 🐳 Docker Compose
All services are containerized and declared in `docker-compose.dev.yml` with explicit network topology, port bindings, and dependency ordering. Services include infrastructure (MongoDB, Redis, RabbitMQ), data collection, AI/ML, backend, WebSocket cluster, and load balancer.

### 💳 VietQR Payment
Admin configures bank account details once via the Admin Panel. The system uses the VietQR library to encode payment metadata into a standard QR code, which is rendered on the VIP checkout page. Users scan with any Vietnamese banking app — all fields pre-populated.

---

## Team

| Student ID | Name |
|---|---|
| 22120192 | Nguyễn Đăng Long |
| 22120200 | Hoàng Thanh Mẫn |
| 22120212 | Trần Đức Minh |

**Faculty of Information Technology — University of Science, VNU-HCM**
Designed & developed: February 2026

---

## References

1. Sam Newman, *Building Microservices*, O'Reilly Media, 2015
2. Martin Fowler, "Microservices Architecture", martinfowler.com
3. Docker Documentation — docker.com
4. RabbitMQ Documentation — rabbitmq.com
5. Redis Documentation — redis.io
6. NestJS Official Documentation — docs.nestjs.com
7. Binance API Documentation — binance-docs.github.io
8. Next.js Documentation — nextjs.org
9. Ian Goodfellow et al., *Deep Learning*, MIT Press, 2016
10. AWS Auto Scaling and Load Balancing — aws.amazon.com

---

> ⚠️ *Price predictions and sentiment scores are for informational purposes only and do not constitute financial advice.*
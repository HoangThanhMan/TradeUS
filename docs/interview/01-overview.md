# 1. Overview

## What it is

A cryptocurrency trading-analysis platform: live Binance price data streamed to a
charting frontend, plus news sentiment analysis, an LSTM price predictor, a
strategy backtester, and a chat assistant that answers market questions from the
system's own data.

It is a university capstone built by three people between **November 2025 and
September 2026**. It is a portfolio and coursework system — it has never carried
production traffic or real money.

## What you personally built

Backend and infrastructure: the event-driven service topology, the WebSocket
delivery tier, the API gateway and shared auth, containerisation, the load
balancer configuration, CI, and the evaluation work on the two ML components.

## The 30-second version

> "It's a crypto trading platform built as eleven services around a RabbitMQ
> topic exchange. Binance data comes in through a collector, fans out to two
> WebSocket gateways behind an Nginx load balancer, and reaches the browser in
> single-digit milliseconds — I load-tested it to a thousand concurrent clients
> at about 1,150 messages a second. The interesting part for me was the
> measurement: I wrote evaluation harnesses for the two ML models, and both came
> back negative — the LSTM doesn't beat a majority-class baseline and a LoRA
> fine-tune scored worse than the checkpoint it started from. Documenting that
> honestly was more useful than shipping either one."

## The two-minute version

Start with the data path, because it is the spine of the system:

1. `collector-price` holds WebSocket connections to Binance futures streams for
   five symbols and publishes each update to a RabbitMQ **topic** exchange
   (`tradex.prices`) with a routing key of `price.<symbol>`.
2. Two `ws-gateway` instances each bind their **own queue** to that exchange, so
   both receive every message rather than competing for it. Each keeps
   Socket.IO rooms per symbol and interval, and pushes to the browsers in that
   room.
3. Nginx sits in front with `ip_hash`, so a given client always lands on the same
   gateway — necessary because subscription state lives in gateway memory.
4. Separately, `sentiment-service` collects news on a schedule, scores it, and
   publishes results to its own exchange; `symbol-alert-service` consumes those
   and pushes user alerts, with a Redis TTL key as a per-user cooldown.

Then the honest framing of the AI work: the chat agent is real tool-calling and
retrieval, and the evaluation harnesses are real measurement — but both models
underperform their baselines, and the documents say so.

## Team and scope

Three-person team. Splitting work meant the frontend charting workspace and much
of the VIP/payment feature belong to teammates; be precise about that in an
interview rather than implying sole ownership of the whole repo.

## Numbers worth memorising

| Fact | Value |
|---|---|
| Services | 11 (8 microservices, API gateway, WebSocket gateway, Next.js app) |
| Peak concurrent WebSocket clients tested | 1,000, zero failed connections |
| Delivery throughput at that load | ~1,150 msg/s |
| Delivery latency, gateway to client | p50 5 ms, p95 10 ms, p99 13 ms |
| Broker ingest | ~118 msg/s across 5 symbols |
| CI | 4 jobs, GitHub Actions |
| LSTM directional accuracy | 49.1% against a 50.9% majority-class floor |
| Sentiment: local base vs paid API | 66.0% vs 56.0% bucket accuracy |

Every one of these is reproduced in a later section with the command that
produced it.

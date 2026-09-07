# 2. Architecture

## The eleven services

| Service | Runtime | Port | Job |
|---|---|---|---|
| `nginx` | Nginx | 80 | Single entry point, load balances the WebSocket tier |
| `api-gateway` | NestJS | 3001 | Routing, JWT validation, proxies to backends |
| `user-service` | NestJS | 3010 | Users, roles, VIP requests, QR payment config |
| `ws-gateway-1/2` | NestJS | 3002/3003 | Socket.IO delivery to browsers |
| `collector-price` | Node/TS | — | Binance WebSocket client, publishes to RabbitMQ |
| `sentiment-service` | FastAPI | 8001 | News collection and sentiment scoring |
| `prediction-service` | FastAPI | 8002 | LSTM inference over a rolling price buffer |
| `email-service` | FastAPI | 8003 | Consumes events, sends mail |
| `symbol-alert-service` | FastAPI | 8004 | Threshold alerts with a Redis cooldown |
| `symbol-subscription-service` | FastAPI | 8005 | Which user follows which symbol |
| `chat-agent-service` | FastAPI | 8006 | Tool-calling agent with news retrieval |

Plus the Next.js app, MongoDB, Redis and Qdrant.

## Why event-driven

The decision to make is *why a message broker instead of HTTP calls between
services*, and the answer is about coupling, not speed.

Price updates have **one producer and several unrelated consumers** — the
WebSocket gateways, and potentially alerting, storage, and analytics. With HTTP,
the collector would need to know every consumer's address and handle each one's
failures. With a topic exchange it publishes once to `tradex.prices` and never
learns who listens. Adding a consumer is a new queue binding, with no change to
the publisher and no redeploy.

Three properties follow, and they are the ones worth saying out loud:

- **Failure isolation.** A gateway crash does not stop ingestion. Its queue holds
  messages until it returns.
- **Independent scaling.** The gateways scale with user count; the collector
  scales with symbol count. They are different axes and the broker decouples them.
- **Backpressure has somewhere to go.** A slow consumer grows its own queue
  rather than blocking the producer. At the 1,000-client load test the backlog
  stayed at 0, which is the evidence that the consumers kept up.

## Exchange topology

Six exchanges, all topic type:

| Exchange | Published by | Consumed by | Binding pattern |
|---|---|---|---|
| `tradex.prices` | `collector-price` | both ws-gateways | `price.#` |
| `sentiment.exchange` | `sentiment-service` | ws-gateway, alert service | `sentiment.result.#`, `sentiment.batch.#`, `sentiment.alert.#` |
| `alert.exchange` | `symbol-alert-service` | ws-gateway, email service | `alert.notification.#`, `alert.email.#` |
| `email.exchange` | `email-service` | status consumers | — |
| `news.exchange` | news collection | sentiment pipeline | — |
| `prediction.exchange` | `prediction-service` | sentiment updates | — |

### The one design detail interviewers probe

**Each gateway binds its own queue, so both receive every message.** If they
shared a queue, RabbitMQ would round-robin between them and each price update
would reach only half the connected users.

That is why the broker shows roughly **double** the publish rate on the delivery
side: ~118 msg/s in, ~235 msg/s out to two gateways. Fan-out, not load sharing.
Load sharing happens one layer up, at Nginx, across *connections* — not messages.

## Request path vs stream path

Two distinct paths, and conflating them is a common interview stumble:

**Stream (read-heavy, one-way).** Binance → collector → RabbitMQ → gateway →
browser over Socket.IO. No HTTP involved after the initial handshake.

**Request/response.** Browser → Nginx → api-gateway → the relevant backend. The
gateway validates the JWT once and forwards; backends trust the gateway.

The chat assistant crosses both: the browser posts to a Next.js route, which
proxies to `chat-agent-service`, which calls two backends and Qdrant, then streams
the answer back over SSE — a third transport, chosen because the response is
one-directional and text-shaped.

## Shared code

Four workspace packages keep the NestJS services from re-implementing the same
things:

- `@tradex/amqp-client` — connection handling, publisher, consumer.
- `@tradex/auth-shared` — JWT and local strategies, guards, `@Roles` and
  `@CurrentUser` decorators, password hashing.
- `@tradex/database` — Mongoose and Redis modules.
- `@tradex/shared-types` — DTOs and enums shared with the frontend, including
  `UserRole` (`user`, `vip`, `admin`).

The tradeoff to acknowledge: shared packages mean a monorepo and coupled
deployments. For a three-person team that is the right trade; at a larger scale
the duplication would be safer than the coupling.

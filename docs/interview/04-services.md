# 4. Services, auth and data

## API gateway

NestJS. Every browser request enters here. It validates the JWT once and proxies
to the service that owns the data, which means backends do not each re-implement
authentication.

Route groups: `auth` (login, register, refresh, logout), `users`/`profile`,
`admin` (VIP approve/reject, QR config), and proxy controllers for
`prediction`, `sentiment` and `subscription`.

**The tradeoff to name:** backends trust the gateway, so anything that can reach
a backend directly bypasses auth. On a single Docker network that is acceptable;
exposed publicly it would not be. The fix is service-to-service authentication or
network policy that makes the gateway the only reachable path.

## Authentication

Lives in `@tradex/auth-shared` so services share one implementation:

- **Strategies** — `local` (username/password at login) and `jwt` (bearer token
  on every subsequent request), both Passport.
- **Guards** — `JwtAuthGuard`, `RolesGuard`, `LocalAuthGuard`.
- **Decorators** — `@Roles(UserRole.ADMIN)`, `@CurrentUser()`, `@Public()`.
- **Roles** — `user`, `vip`, `admin`.
- **Passwords** — hashed in `password.service.ts`; never stored in plaintext.

Access plus refresh tokens, so the access token can be short-lived without forcing
users to log in constantly.

## Data stores

### MongoDB

Four collections: `users`, `sentiments`, `collected_news`, `subscriptions`.

Chosen because the documents are naturally nested and the schema moved constantly
during development — a news article with per-article scores and an emotion label
is one document, not four joined tables. The counter-argument is worth conceding:
`users` is relational-shaped and would have been just as happy in Postgres.

### Redis

Used for **alert cooldown** in `symbol-alert-service`: when an alert fires, the
service writes `alert:cooldown:<user>:<symbol>` with `SETEX` and the configured
TTL, and skips any alert that finds the key present. Expiry is the whole feature —
Redis deletes the key and the cooldown ends, with no scheduler and no cleanup job.

**Be precise here.** Redis is *not* a general cache for user data in this system.
The root README once claimed "user-service Redis caching"; `user-service` contains
no Redis code at all. If asked about caching, describe what exists — a TTL-based
rate limiter — rather than repeating the old claim.

### Qdrant

Vector index for news retrieval, holding **227 article embeddings** in a
`news_chunks` collection with symbol, title, link and published-at as payload. It
backs one tool of the chat agent. Covered in [section 5](05-ai.md).

## The Python services

All FastAPI, all with the same `/health`, `/ready`, `/live` split — `/live` for
the container healthcheck, `/ready` for dependency status.

**`sentiment-service`** collects news from Yahoo Finance, CryptoNews and Reddit
on a schedule, scores each article, and stores it with a record of which backend
produced the score. `SENTIMENT_BACKEND` selects `gemini` or `local`.

**`prediction-service`** keeps a rolling price buffer fed from RabbitMQ and runs
a TorchScript LSTM over the last 24 candles. Endpoints: `/predict`,
`/buffer-status`, `/model-info`, `/update-sentiment`. It needs 24 candles before
it can answer; on a cold start it returns an explicit "need 24, have N" error
rather than a fabricated number.

**`symbol-alert-service`**, **`symbol-subscription-service`** and
**`email-service`** are small consumers: who follows what, threshold crossings,
and outbound mail.

## Frontend, in one paragraph

Next.js. Charting on KLineCharts with a single-chart view, a multi-chart view of
up to four panes (1x1, 1x2, 2x1, 2x2), a multi-timeframe view, ten indicators and
drawing tools.

**The backtester runs entirely in the browser** — it is frontend code under
`apps/web/app/backtest`, with no backend service behind it. Do not describe it as
a backend feature.

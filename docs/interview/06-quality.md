# 6. Testing, CI, and bugs worth telling

## CI

Four jobs on GitHub Actions, triggered on pull requests and pushes to `main`:

| Job | Checks |
|---|---|
| `prediction-service` | ruff + pytest (17 indicator tests) |
| `chat-agent-service` | ruff + pytest (57 tests) |
| `sentiment-service` | ruff + pytest (14 backend tests) |
| `user-service` | eslint + jest |

**Only hermetic tests run** — no MongoDB, no RabbitMQ, no API keys, no model
downloads. A suite that needs live infrastructure (`sentiment-service/tests/test_main.py`)
is excluded **by path**, not skipped silently, so what is not covered stays
visible in the workflow file.

Two decisions worth defending:

- **Lint is scoped to the files this work added**, not whole services. The
  pre-existing code carries findings that are their own cleanup; bundling a
  50-file reformat into "introduce CI" makes both changes unreviewable.
- **eslint is invoked directly, not through `npm run lint`**, because the package
  script passes `--fix`. CI must report, not rewrite.

### The compromise to admit

The `user-service` lint step is `continue-on-error: true` — it reports but cannot
fail the build. That service has ~494 existing findings, mostly
`@typescript-eslint/no-unsafe-*` from untyped Mongoose returns plus prettier
formatting. Typing that properly is a real piece of work.

Do not present this as a finished CI story. The accurate version: "three of four
jobs gate; the fourth reports because the debt predates the pipeline, and the
comment in the workflow says what has to happen before it gates."

## Bugs found, and what each one teaches

These are the most interview-useful part of the project. Each is real, each was
diagnosed, and each has a general lesson.

### 1. Nginx could not start when one backend was down

`upstream` blocks resolve their hostnames while nginx parses the config, and nginx
**refuses to start** if any of them is missing. `api-gateway` and `web` were
declared that way, and `docker-compose.dev.yml` has no `web` service at all — the
frontend runs via `npm run dev` on the host. So the load balancer died at boot,
taking the WebSocket path down with it.

Fix: resolve both through Docker's embedded DNS (`resolver 127.0.0.11`) with the
address held in a variable, which defers the lookup to request time. Verified:
`/health` returns 200 and Socket.IO serves traffic while `/api` and `/` return 502
on their own.

*Lesson:* a shared component that refuses to start on a partial outage converts a
one-service failure into a whole-system failure. Also a nginx gotcha worth
knowing — a variable in `proxy_pass` stops nginx appending the matched URI, so
`$request_uri` has to be passed explicitly.

### 2. The collector stalled while reporting healthy

During load testing, `collector-price` stopped at exactly 52,366 messages. Publish
rate went to zero. Its health endpoint still reported `klineConnected: true`.

*Lesson:* a health check that reports **connection state** rather than **progress**
cannot detect a silently dead stream. The fix is to health-check on time since the
last message, not on whether a socket object exists. Still open — say so.

### 3. Blocking CPU work on the async event loop

`search_news` embedded the query inline, so the first request serialised all three
tools behind a 20-second model load. Moving it to `asyncio.to_thread` took it from
**25 s to 52 ms** per tool.

*Lesson:* one synchronous CPU call inside an async handler stalls every concurrent
request on that worker, not just its own.

### 4. A health check that broke the thing it checked

`/health` constructed a second Qdrant client. In embedded mode that fails, because
the first client holds an exclusive lock — so the health check reported the
dependency as unreachable *because the health check itself broke it*. Fixed by
reusing the shared client.

*Lesson:* health checks must observe, never allocate.

### 5. Credentials committed to a public repo

A Gmail address and App Password sat as **defaults in `config.py`**, and a Gemini
API key had been committed the same way — which is almost certainly why Google
suspended it. Both now come from the environment, and the email service defaults
to `console` so a missing config logs instead of silently sending real mail.

*Lesson:* removing a secret from the current code does not remove it from history.
The password still needs to be revoked. Also: a suspended key blocked four
separate pieces of work — the agent loop, the sentiment evaluation, the
distillation labels and the embeddings — which is a concrete illustration of why
secret hygiene is not paperwork.

### 6. A test that never ran

`app.controller.spec.ts` still asserted the NestJS generator's default
`"Hello World!"` while the service returned its own banner. Nobody noticed,
because the suite had never been executed. Introducing CI failed on it
immediately.

*Lesson:* an unrun test is not coverage. It is a comment that looks like coverage.

## What is not tested

Be ready to volunteer this rather than be caught by it:

- No integration tests across services — everything hermetic is unit-level.
- No end-to-end browser test. The chat panel was never exercised in a browser
  during this work.
- No load test in CI; the numbers in [section 3](03-realtime.md) were produced by
  hand.
- Seven of the eleven services have no CI job.

# Sprint 3 — Completion Report

> Covers T3.1–T3.6 of [`sprint-plan.md`](./sprint-plan.md). Continues from
> [`sprint-2-report.md`](./sprint-2-report.md).

| ID | Task | Status |
|---|---|---|
| T3.1 | Scaffold `chat-agent-service` (FastAPI, config, health) | ✅ Done |
| T3.2 | Three tools: prediction, sentiment, news search | ✅ Done |
| T3.3 | Gemini function-calling loop + SSE streaming | ✅ Done (loop untested against live Gemini) |
| T3.4 | `apps/web` chatbot route proxies the agent | ✅ Done (not run in a browser) |
| T3.5 | E2E demo pass | ⚠️ Partial — real run captured, no screen recording |
| T3.6 | CI workflow + README badge | ✅ Done (never executed on GitHub) |

---

## T3.1 / T3.2 — Service and tools

**Delivered:** [`app/main.py`](../services/chat-agent-service/app/main.py),
[`app/health.py`](../services/chat-agent-service/app/health.py),
[`app/tools.py`](../services/chat-agent-service/app/tools.py),
[`app/routes/chat_routes.py`](../services/chat-agent-service/app/routes/chat_routes.py),
`Dockerfile`, compose entry on port 8006.

| Tool | Backed by |
|---|---|
| `get_prediction(symbol, interval?)` | `prediction-service` `GET /predictions/predict` |
| `get_sentiment_summary(symbol, days?)` | `sentiment-service` `GET /sentiments/symbol/{s}/average` |
| `search_news(query, symbol?, limit?)` | Qdrant `news_chunks` top-k |

Three design choices worth stating:

- **Tools never raise.** Every failure returns `{"error": ...}` so the model can
  say "I couldn't get that" instead of the request 500ing. A degraded answer
  beats a dead endpoint.
- **Results are trimmed before they reach the model.** `get_prediction` drops
  the colour codes and emoji strings from the upstream payload;
  `get_sentiment_summary` adds a `sentiment_bucket` using the same ±0.2
  thresholds as the Sprint 1 evals, because a raw float means little to an LLM.
- **`/health` reports each dependency separately** and returns `degraded`, not
  `unhealthy`, when one is down — the agent is designed to survive that. The
  Docker healthcheck probes `/live` for the same reason.

## T3.3 — The agent loop

**Delivered:** [`app/agent.py`](../services/chat-agent-service/app/agent.py)

Send question + tool schemas → execute requested calls → feed results back →
repeat until it answers, capped at 3 rounds. Tools in the same round run
concurrently via `asyncio.gather`. No framework; the loop is about twenty lines.

If the cap is hit with a function call still pending, the loop asks once more
with tools withheld, so a turn always ends in prose rather than a dangling call.

**Every turn produces a trace** — which tools ran, with what arguments, how long
each took — exposed both in the logs and via `POST /chat/debug`. That is what
makes the DoD's "verify via logs" checkable with curl instead of by inspection.

### The rule-based fallback

`AGENT_BACKEND=rules` plans tools by keyword, runs them, and renders a templated
answer with no LLM. It exists because the Gemini key is suspended and without it
none of this would be demonstrable or testable. It drives the identical
execution path, so what it proves about the plumbing is real. Its output states
plainly that no model wrote it.

Gemini falls back to `rules` on any failure, so `/chat` always answers.

`search_news` always runs in the plan — it is the grounding tool, and there is no
market question where real headlines hurt. The other two are keyword-gated.
Writing the planner surfaced that *"is now a good time to look at it?"* is a
forecast question containing no forecast words; it now matches on decision
phrasing, with a regression test named after the demo question.

## T3.4 — Frontend proxy

[`apps/web/app/api/chatbot/route.ts`](../apps/web/app/api/chatbot/route.ts) is
now a thin proxy to `chat-agent-service`. The SSE wire format is unchanged —
`data: {"text": "..."}` then `data: [DONE]` — so **`ChatbotPanel.tsx` needed no
changes**, which was the point.

The proxy adds an abort timeout (default 60s, since a tool-calling turn takes
longer than a plain completion) and clears it on stream *flush* rather than on
headers, so a slow answer is not cut off mid-sentence. It also sets
`X-Accel-Buffering: no`, without which nginx buffers the whole response and
destroys the streaming effect.

The removed direct-Gemini implementation also contained a `stripMarkdown` helper
that was never called; it is gone with it.

## T3.5 — E2E demo

Captured in [`sprint-3-demo.md`](./sprint-3-demo.md). Run against real
processes: sentiment-service on 8001, prediction-service on 8002, the agent on
8006, 227 articles in Qdrant.

Asking *"What's the sentiment on ETH right now and is now a good time to look at
it?"*:

| Tool | Result | Duration |
|---|---|---|
| `get_prediction` | error — *"Need 24 candles, have 0"* | 534 ms |
| `get_sentiment_summary` | ok — 0 samples in window | 268 ms |
| `search_news` | ok — 3 headlines | 223 ms |

841 ms warm, end to end. The answer cites three real headlines from the index,
verbatim.

**Against the DoD:**

- ✅ All three tools fire, verified in logs *and* in the response trace.
- ✅ The answer cites a real retrieved headline.
- ✅ Streaming works: 97 SSE frames in the format the frontend already parses.
- ⚠️ **No screen recording.** A text transcript is not a GIF. The browser
  capture is a short job once the stack is up, and it is the remaining piece.
- ⚠️ **`ChatbotPanel.tsx` was not exercised in a browser.** The SSE contract is
  covered by tests that assert the exact wire format, and the component is
  unmodified, but nobody has watched it stream.

**Two tool results were failures, and both were real system state, not stubs.**
`get_prediction` needs a price buffer that RabbitMQ fills, and RabbitMQ was not
running. `get_sentiment_summary` found nothing because the corpus is
January–February while the system date is August, so the 7-day window is empty.
Both tools behaved correctly; the data behind them was absent. The agent
reported both plainly rather than inventing numbers, which is the behaviour that
matters.

## T3.6 — CI

**Delivered:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), badge
in the root README, and 17 new unit tests for `TechnicalIndicatorCalculator`.

Four jobs on PR and push to `main`:

| Job | Checks |
|---|---|
| `prediction-service` | ruff + pytest (17 indicator tests) |
| `chat-agent-service` | ruff + pytest (57 tests) |
| `sentiment-service` | ruff + pytest (14 backend tests) |
| `user-service` | eslint + jest |

Only hermetic tests run: no MongoDB, no RabbitMQ, no API keys, no model
downloads. `sentiment-service/tests/test_main.py` is excluded by path rather
than skipped silently, so what is *not* covered stays visible.

Two deliberate choices:

- **Lint scope is the files these sprints added**, not whole services. The
  pre-existing code has ~50 findings; cleaning those up is its own change, not
  something to bundle into introducing CI. The scoping is commented in the
  workflow.
- **eslint is invoked directly, not via `npm run lint`** — the package script
  passes `--fix`, and CI must report rather than rewrite.

One of the new indicator tests pins the 100× `bb_width` train/serve mismatch
found in Sprint 1, so that discrepancy cannot be silently "fixed" on one side
without the test failing and forcing the model to be retrained or the serving
path rescaled.

---

## Bugs found and fixed while building this

1. **Blocking CPU work on the event loop.** `search_news` embedded queries
   inline, so the first request serialised all three tools behind a 20-second
   model load. Moved to `asyncio.to_thread`: 25 s → 52 ms per tool.
2. **Cold start on first request.** Added a startup warmup for the embedder and
   Qdrant client; without it the first user waits ~20 s on what looks like a
   hung chatbot.
3. **`/health` broke the thing it was checking.** It built a second Qdrant
   client, which in embedded mode fails because the first holds an exclusive
   lock — so the health check reported the dependency as unreachable *because
   the health check itself broke it*. Now reuses the shared client.
4. **Nested error dicts rendered as Python reprs** in chat replies. Now the
   readable message is extracted at the tool boundary.
5. **The planner missed the demo question entirely** (see T3.3).

## Honest status

Three things in this sprint are **written and tested but never executed in their
real environment**:

- **The Gemini function-calling loop.** `run_gemini_agent` has never run against
  live Gemini — the key is suspended. Its structure follows the SDK's documented
  function-calling flow and the fallback path around it is tested, but the first
  real call may need adjustment. Everything downstream of it (tool execution,
  tracing, streaming) is exercised.
- **The CI workflow.** Never run on GitHub. Each job's lint and test commands
  were verified locally, but Actions runner behaviour, `npm ci` on this
  workspace, and the jest job are unproven. Expect one or two fixup commits.
- **The browser.** The proxy and the SSE contract are tested; nobody has loaded
  the page.

The Sprint 3 DoD item *"a PR against `main` shows a green CI run"* therefore
cannot be ticked from here — it needs a push.

## Recommended next steps

1. **Open the PR** and let CI run. That closes the last DoD item and shakes out
   the workflow.
2. **Restore the Gemini key** (still Sprint 1 blocker #1). It unblocks the real
   agent loop, the real sentiment eval, the distillation retrain, and Gemini
   embeddings — four sprints' worth of half-finished results in one fix.
3. **Record the browser demo.** Everything needed is running; it is the one
   DoD item with nothing technical left in the way.
4. **Start RabbitMQ and the price collector** before demoing, so
   `get_prediction` returns a real forecast rather than an empty buffer.

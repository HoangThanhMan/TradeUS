# Sprint 3 — Grounded Chat Demo (captured run)

> Verbatim output from a live run of the stack, not an illustration.
> Reproduction commands are at the bottom.

The Sprint 3 definition of done asks for a screen recording. This is a text
transcript instead — the run is real and reproducible, but **no video was
recorded**, so that DoD item is only partly met. Capturing the same exchange in
the browser is a short job once the stack is up.

## The question

> *"What's the sentiment on ETH right now and is now a good time to look at it?"*

sent to `POST /chat` with `symbol=ETHUSDT`, `currentPrice=2013.5`.

## 1. All three tools fired

Server log:

```
rule-based plan: ['get_prediction', 'get_sentiment_summary', 'search_news']
tool get_prediction({"symbol": "ETHUSDT"}) -> error: Need 24 candles, have 0 in 561ms
tool get_sentiment_summary({"symbol": "ETHUSDT"}) -> ok in 258ms
tool search_news({"query": "What's the sentiment on ETH right now and is now a good time to look at it?", "symbol": "ETHUSDT"}) -> ok in 33ms
```

The same thing from the response trace (`POST /chat/debug`):

| Tool | Result | Duration | Arguments |
|---|---|---|---|
| `get_prediction` | **error** | 534 ms | `{'symbol': 'ETHUSDT'}` |
| `get_sentiment_summary` | ok | 268 ms | `{'symbol': 'ETHUSDT'}` |
| `search_news` | ok | 223 ms | `{'query': "What's the sentiment on ETH right now and is now a good time to look at it?", 'symbol': 'ETHUSDT'}` |

Total round trip: **841 ms** warm.

## 2. The answer cites real retrieved headlines

```
⚠️ No prediction available for ETHUSDT right now — Need 24 candles, have 0.

No sentiment data has been collected for ETHUSDT recently.

💡 Recent coverage:
• Ethereum Price Drops to $2,000: Is This a Breakdown or a Long-Term Opportunity?
• Leverage Decay Is Destroying ETHU Faster Than Ethereum’s Actual Drop
• Bitcoin and Ethereum Traders Should Watch 'Narrative Whipsaw' Heading into Fed Decision

Generated without an LLM — the assistant is running its rule-based fallback because no language model backend is configured. The figures above are real, the wording is templated. Not financial advice.
```

Those headlines are verbatim payload values from the Qdrant `news_chunks`
collection — they came from `search_news`, not from a model's memory. Check
independently:

```bash
cd services/chat-agent-service
python -m scripts.search_news "sentiment on ETH" --symbol ETHUSDT -k 3 \
  --backend local --qdrant-path .qdrant
```

## 3. The stream is the format the frontend already parses

First and last frames of the SSE response (97 frames total):

```
data: {"text": "\u26a0\ufe0f "}
data: {"text": "No "}
data: {"text": "prediction "}
data: {"text": "available "}
...
data: {"trace": {"backend": "rules", "rounds": 1, "tools": [{"name": "get_prediction", "arguments": {"symbol": "ETHUSDT"}, "duration_ms": 560.6, "ok": false}, {"name": "get_sentiment_summary", "arguments": {"symbol": "ETHUSDT"}, "duration_ms": 258.3, "ok": true}, {"name": "search_news", "arguments": {"query": "What's the sentiment on ETH right now and is now a good time to look at it?", "symbol": "ETHUSDT"}, "duration_ms": 33.0, "ok": true}], "error": null}}
data: [DONE]
```

`data: {"text": ...}` chunks terminated by `data: [DONE]` — exactly what
`ChatbotPanel.tsx` consumed from the old direct-to-Gemini route, which is why
that component needed no changes. The `trace` frame is additive: the client
ignores frames with no `text` key.

## What is honest about this run

- **The two tool "failures" are real system state, not stubs.**
  `get_prediction` returned *"Need 24 candles, have 0"* because
  prediction-service fills its price buffer from RabbitMQ, which was not
  running. `get_sentiment_summary` returned zero samples because the collected
  corpus is January–February while the system date is August, so nothing falls
  inside the 7-day window. Both tools worked correctly; the data behind them
  was absent.
- **The prose came from the rule-based planner, not an LLM.** The Gemini key is
  suspended (Sprint 1 blocker #1), so `AGENT_BACKEND=gemini` falls back to
  `rules`. The tool selection, execution, retrieval, grounding and streaming are
  all real; the wording is templated, and the answer says so in its final
  paragraph rather than passing itself off as model output.

With a working key the same request runs `run_gemini_agent` instead: the model
picks the tools, the identical functions execute, and the model writes the
prose. Nothing else in the path changes.

## Reproducing

```bash
# 1. Infra + downstream services
docker compose -f docker-compose.dev.yml up -d qdrant mongodb
#    (sentiment-service on 8001 and prediction-service on 8002)

# 2. Build the news index
cd services/chat-agent-service
python -m scripts.ingest_news --backend local --qdrant-path .qdrant

# 3. Start the agent
AGENT_BACKEND=rules EMBEDDING_BACKEND=local QDRANT_PATH=.qdrant \
  PREDICTION_SERVICE_URL=http://127.0.0.1:8002 \
  SENTIMENT_SERVICE_URL=http://127.0.0.1:8001 \
  python -m uvicorn app.main:app --port 8006

# 4. Ask, and see the tool trace
curl -N -X POST http://localhost:8006/chat/debug \
  -H 'Content-Type: application/json' \
  -d '{"message":"What is the sentiment on ETH right now and is now a good time to look at it?","symbol":"ETHUSDT"}'
```

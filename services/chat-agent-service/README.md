# Chat Agent Service

RAG + tool-calling agent for the TradeX chatbot.

Complete: retrieval, three tools, the function-calling loop, and SSE streaming
to the existing chat panel.

## Layout

```
app/
  config.py        settings (Mongo, Qdrant, embeddings, agent backend)
  embeddings.py    Gemini and local embedding providers
  qdrant_store.py  news_chunks schema, upsert, top-k search
  tools.py         the three tools + their Gemini function declarations
  agent.py         function-calling loop, fallback planner, SSE
  health.py        dependency-aware health checks
  routes/          POST /chat (SSE), POST /chat/debug (JSON + trace)
scripts/
  ingest_news.py   MongoDB collected_news -> embeddings -> Qdrant
  search_news.py   manual top-k query
```

## The agent

`POST /chat` streams a grounded answer. The loop sends the question plus the
tool schemas to Gemini, executes whatever it asks for, feeds the results back,
and repeats until it answers — capped at `MAX_TOOL_ROUNDS` (default 3). Tools in
the same round run concurrently.

| Tool | Backed by |
|---|---|
| `get_prediction(symbol, interval?)` | `prediction-service` `GET /predictions/predict` |
| `get_sentiment_summary(symbol, days?)` | `sentiment-service` `GET /sentiments/symbol/{s}/average` |
| `search_news(query, symbol?, limit?)` | Qdrant `news_chunks` top-k |

No orchestration framework: the loop is ~20 lines and every step is in the logs.

**Tools never raise.** A failure comes back as `{"error": ...}` so the model can
say "I couldn't get that" instead of the request 500ing.

**`POST /chat/debug`** returns the same answer as JSON with the full tool trace —
which tools ran, with what arguments, how long each took. That is how "did it
actually call the tool?" gets answered with curl rather than by inspection.

### Backends

`AGENT_BACKEND=gemini` (default) uses real function calling. `rules` uses a
deterministic keyword planner over the same tools and renders a templated
answer — no LLM. Gemini falls back to `rules` on any failure, so the endpoint
always answers. The templated output states plainly that no model wrote it.

## Quick start

```bash
cd services/chat-agent-service
pip install -r requirements.txt
cp .env.example .env          # then set GEMINI_API_KEY

docker compose -f ../../docker-compose.dev.yml up -d qdrant
python -m scripts.ingest_news
python -m scripts.search_news "ETF inflows" --symbol BTCUSDT

python -m uvicorn app.main:app --port 8006
```

See [`docs/sprint-3-demo.md`](../../docs/sprint-3-demo.md) for a captured
end-to-end run.

### Without Docker or an API key

Both dependencies are optional for development. `--qdrant-path` swaps the server
for an embedded on-disk store, and the `local` embedding backend runs a small
sentence encoder on CPU:

```bash
pip install -r requirements-local.txt
python -m scripts.ingest_news  --backend local --qdrant-path .qdrant
python -m scripts.search_news  --self-test --backend local --qdrant-path .qdrant
```

The client API is identical in both modes, so nothing downstream changes.

## The `news_chunks` collection

One point per article — at this corpus's length (Yahoo summaries, ~150
characters) an article *is* a chunk, so there is no sliding window.

| | |
|---|---|
| Vector | article embedding, cosine distance |
| `symbol` | trading pair (`BTCUSDT`), **keyword index** — the agent filters on it |
| `published_at` | ISO-8601, **datetime index** — answers are time sensitive |
| `title`, `link` | for citation |
| `content`, `source` | so a hit can be quoted without a second MongoDB round trip |
| `fingerprint` | hash of the embedded text, for incremental re-ingestion |

Point IDs are `uuid5(namespace, link)`, so re-running ingestion updates articles
in place instead of duplicating them.

## Embedding backends

| | `gemini` | `local` |
|---|---|---|
| Model | `models/embedding-001` | `all-MiniLM-L6-v2` |
| Dimensions | 768 | 384 |
| Needs | `GEMINI_API_KEY` | `requirements-local.txt` |
| Cost | per call | none |

**The two cannot share a collection.** Different vector widths mean incompatible
spaces, so `ensure_collection` refuses to attach a mismatched embedder and tells
you to `--recreate`. Silently tolerating it would produce retrieval results that
look plausible and mean nothing.

Switching backends is a full re-index:

```bash
python -m scripts.ingest_news --backend gemini --recreate
```

## Re-running ingestion

Cheap and idempotent. Each point stores a fingerprint of its embedded text, so a
second run embeds only new or edited articles:

```
227 loaded, 0 embedded, 227 skipped
```

Use `--force` to re-embed everything anyway, `--recreate` to rebuild the
collection from scratch.

## Tests

```bash
python -m pytest tests/ -q
```

57 tests. Downstream services are stubbed with `httpx.MockTransport` and the
end-to-end ones use embedded Qdrant with a stub embedder, so the suite needs no
Docker, no API key and no model download.

The SSE tests are the load-bearing ones: `ChatbotPanel.tsx` parses that stream
by hand, so the wire format is a contract with a real consumer.

> One caveat worth knowing: embedded Qdrant ignores payload indexes and filters
> by brute force. Filter *behaviour* is covered by the tests, but the index
> *types* are only exercised against a real server.

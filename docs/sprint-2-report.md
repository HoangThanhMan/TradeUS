# Sprint 2 — Progress Report

> Tracks T2.1–T2.5 of [`sprint-plan.md`](./sprint-plan.md). Continues from
> [`sprint-1-report.md`](./sprint-1-report.md).

| ID | Task | Status |
|---|---|---|
| T2.1 | `evaluate_distill.py` — student vs. teacher and vs. human | ✅ Done |
| T2.2 | *(stretch)* `SENTIMENT_BACKEND=gemini\|local` wiring | ✅ Done |
| T2.3 | Qdrant in `docker-compose.dev.yml` + `news_chunks` collection | ✅ Done |
| T2.4 | `ingest_news.py` — MongoDB → embeddings → Qdrant | ✅ Done |
| T2.5 | Buffer / spillover | Spent on the embedding fallback + tests |

---

## T2.1 — Distillation evaluation

**Delivered:** [`training/evaluate_distill.py`](../services/sentiment-service/training/evaluate_distill.py) → [`training/report.md`](../services/sentiment-service/training/report.md), `report.json`

```bash
cd services/sentiment-service
python -m eval.evaluate              # pipeline vs human (from T1.2)
python -m training.evaluate_distill  # student vs teacher, vs human, vs base
```

### The headline result

All three systems scored the **same 50 hand-labelled articles**, bucketed with the same thresholds:

| | Student (LoRA) | Pipeline (API path) | **Base checkpoint, untrained** |
|---|---|---|---|
| Sentiment-bucket accuracy | 58.0% | 56.0% | **66.0%** |
| Emotion accuracy | 28.0% | 24.0% | n/a (3-class model) |
| Majority-class baseline | 36.0% | 36.0% | 36.0% |
| Mean latency / article | **59 ms** | 229 ms | ~same as student |
| Marginal cost | **$0** | ~1,350 input tokens/article | $0 |

**The LoRA fine-tune made the model 8 points worse than doing no training at all.**

That third column is an ablation I added because the student's number is uninterpretable without it. The base checkpoint (`mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis`) is already a 3-class financial-sentiment classifier, so it maps straight onto bearish/neutral/bullish and can be scored zero-shot. It gets 66.0%. Training on the platform's own labels dragged it down to 58.0%.

This is the correct and expected outcome given what those labels are — **the training set was 100% keyword-mock output**, per T1.3. The run did exactly what training on noisy labels does: it partially overwrote a competent public model with a regex's opinions. It vindicates the guard in `export_training_data.py` that refuses mock-dominated exports.

### Supporting evidence

**The student stopped imitating its teacher.** Spearman 0.172, MAE 0.668, bucket agreement 27.8% on the held-out split. It did *not* learn to reproduce the keyword heuristic — which, given the teacher, is the least-bad failure mode, but it means no distillation has been demonstrated.

**The student collapsed onto directional buckets.** Neutral recall is **6.2%** — of 16 genuinely neutral articles it catches 1, forcing the other 15 into bullish or bearish. Prediction spread:

- Base (untrained): `{bearish: 19, neutral: 14, bullish: 17}` — well calibrated
- Student: `{bearish: 18, bullish: 29, neutral: 3}` — neutral has effectively collapsed

For the trading use case this is worse than the headline number suggests: a model that never says "no clear signal" manufactures a directional call on every article, feeding noise straight into the BUY/SELL/HOLD path.

**Paired comparison** (same articles, so this is the meaningful one rather than two aggregate figures): both right 18, only student 11, only pipeline 10, both wrong 11 — 58% agreement. The student's +2 points over the pipeline is 1 article on a 50-article set, i.e. noise.

### Cost finding

Token accounting on the API path turned up something worth acting on independently of the student:

| | Tokens |
|---|---|
| Prompt template | 1,289 |
| Mean article | 61 |
| **Mean input / article** | **1,350** |

**95.5% of every Gemini call is the prompt template**, not the article. `SENTIMENT_ANALYSIS_PROMPT` is a long instruction block and the Yahoo summaries are ~150 characters, so the platform pays mostly to re-send identical instructions thousands of times. Prompt caching or a shorter template is the cheapest available cost win and needs no ML work at all.

No dollar figure is printed — pass `--input-price-per-million <rate>` with the current published rate. A hardcoded price would go stale, and the token counts are the durable part. (Counted with the RoBERTa BPE tokenizer, not Gemini's; approximate to roughly ±20%.)

### Integrity checks the script enforces

- **Eval-set isolation is verified, not assumed.** Before scoring anything it confirms none of the 50 labelled articles appear in the student's 140 train / 36 val rows, and it's a hard error rather than a warning — a leak would silently turn the headline number into a memorisation score. ✅ Clean.
- **The base checkpoint name is read from `training_run.json`**, so the adapter can never be silently attached to a different base than it was trained against.

### What T2.1 does *not* deliver

The Sprint 2 DoD asks for "Gemini-vs-human and student-vs-human accuracy on the same hand-labeled set." **The Gemini row is still empty** — the key is suspended (Sprint 1 blocker #1), so the "pipeline" column above is the keyword fallback, not Gemini. Every script is ready; restoring the key and re-running the chain fills it in with no code changes.

---

## T2.2 — `SENTIMENT_BACKEND` switch

**Delivered:**
- [`app/ml/local_model.py`](../services/sentiment-service/app/ml/local_model.py) — local inference, lazy-loaded and cached
- [`app/config.py`](../services/sentiment-service/app/config.py) — `SENTIMENT_BACKEND` + `LOCAL_MODEL_*`
- [`app/services/sentiment_service.py`](../services/sentiment-service/app/services/sentiment_service.py) — routing and fallback
- [`tests/test_local_backend.py`](../services/sentiment-service/tests/test_local_backend.py) — 14 tests
- `requirements-local.txt`, `.env.example`, `docker-compose.dev.yml`, `/health`

```bash
SENTIMENT_BACKEND=local LOCAL_MODEL_VARIANT=base uvicorn app.main:app --port 8001
```

### Two local variants, because T2.1 said so

`LOCAL_MODEL_VARIANT` selects between:

- `student` — the LoRA adapter from T1.4 (58.0% bucket accuracy)
- `base` — the public checkpoint with no adapter (**66.0%**)

Wiring in only the student would have shipped the worse model. The base
checkpoint is a 3-class financial-sentiment classifier, so it maps directly onto
bearish/neutral/bullish; its score is the probability-weighted expectation over
those labels rather than a hard snap, so a marginal positive scores lower than a
confident one. It has no emotion head, so emotions are derived from the score by
a documented deterministic mapping — the reason string says so rather than
implying a prediction.

`.env.example` and `docker-compose.dev.yml` both default the variant to `base`.

### Fallback chain

`SENTIMENT_BACKEND` never becomes a way to break the service:

1. `USE_MOCK_LLM=true` → mock (explicit override wins)
2. `SENTIMENT_BACKEND=local` → local model; on any failure, log and fall through
3. No Gemini key → mock
4. Otherwise → Gemini

Writing the tests surfaced a real ordering bug: the original wiring checked the
missing-key guard *before* the local branch, so `SENTIMENT_BACKEND=local` with
no Gemini key silently fell to the mock and never loaded the local model —
exactly backwards, since running locally is the case where you have no key.
Fixed, and covered by `test_local_backend_needs_no_gemini_key`.

Verified end to end: `local:base`, `local:student`, default `gemini`, and a
local backend pointed at a non-existent artifacts directory (falls back cleanly,
no crash).

### Backend provenance is now recorded

This closes **Sprint 1 blocker #2**. `SentimentAnalysisResult`,
`SentimentDocument` and `SentimentResponse` gained an optional `backend` field
(`gemini` / `local:student` / `local:base` / `mock`), stamped on every path and
persisted to MongoDB. The silent-fallback bug that made all 226 stored records
look like Gemini output can no longer happen unnoticed — and the Gemini
exception handler now logs at `ERROR` rather than passing quietly.

`GET /health` reports both the configured and the *effective* backend, so an
unloaded local model is visible from outside instead of being inferred.

### Deployment notes

The service imports torch/transformers/peft **lazily**, so it still starts with
only `requirements.txt` installed — the ML extras (`requirements-local.txt`) are
needed only when `SENTIMENT_BACKEND=local`. The Dockerfile is unchanged and
still builds the Gemini-only image; switching the deployed container to `local`
means adding those extras to the image and shipping `training/artifacts`.

### Two incidental fixes

- The model architecture moved into `app/ml/local_model.py`, and
  `training/train_distill.py` now imports it from there. Previously the class
  was defined only in the training script, so the service would have needed its
  own copy — and a saved adapter could silently load into a drifted class.
- `os.path.relpath` in the training and eval scripts crashed on Windows when the
  output directory sat on a different drive, discarding a *finished* training
  run at the final metadata-writing step. Replaced with a `display_path` helper
  that degrades to the absolute path.

Both training and all three evaluation scripts were re-run after the refactor
and produce identical numbers.

### Recommendation, unchanged

Building the switch does not change what T2.1 measured. If you enable the local
backend, **use `LOCAL_MODEL_VARIANT=base`** — it beats both the student (58.0%)
and the current live pipeline (56.0%) at 66.0%, runs ~4x faster than the API
path, and costs nothing. Enabling `student` would deploy the worst of the three.

---

## T2.3 — Qdrant

**Delivered:** `qdrant` service in [`docker-compose.dev.yml`](../docker-compose.dev.yml), `qdrant_data` volume, and the `news_chunks` schema in [`app/qdrant_store.py`](../services/chat-agent-service/app/qdrant_store.py).

```bash
docker compose -f docker-compose.dev.yml up -d qdrant   # :6333 REST, :6334 gRPC
```

The collection is created by code rather than by a migration file, so ingestion
is self-bootstrapping and the schema lives next to the queries that depend on it.

### `news_chunks` schema

One point per article. At this corpus's length (Yahoo summaries, ~150 characters)
an article *is* a chunk, so there is no sliding-window chunking.

| Field | Purpose |
|---|---|
| vector | article embedding, cosine distance |
| `symbol` | trading pair, **keyword index** — the agent filters on it |
| `published_at` | ISO-8601, **datetime index** — answers are time sensitive |
| `title`, `link` | citation |
| `content`, `source` | quote a hit without a second MongoDB round trip |
| `fingerprint` | hash of the embedded text, for incremental re-ingestion |

## T2.4 — News ingestion

**Delivered:** [`scripts/ingest_news.py`](../services/chat-agent-service/scripts/ingest_news.py), [`scripts/search_news.py`](../services/chat-agent-service/scripts/search_news.py), [`app/embeddings.py`](../services/chat-agent-service/app/embeddings.py), [`tests/test_ingest.py`](../services/chat-agent-service/tests/test_ingest.py) (24 tests), plus config/requirements/README.

Only the pieces T2.4 needs — the FastAPI app is T3.1's job, deliberately not
built ahead of it.

### Result

```
Articles   : 227 loaded, 227 embedded, 0 skipped
Points     : 227 in collection
Symbols    : {BTCUSDT: 81, ETHUSDT: 51, SOLUSDT: 38, XRPUSDT: 36, BNBUSDT: 21}
```

Re-running embeds nothing (`227 loaded, 0 embedded, 227 skipped`) — each point
stores a fingerprint of its embedded text, and point IDs are `uuid5(ns, link)`
so articles update in place rather than duplicating.

### Retrieval quality — the DoD check

`python -m scripts.search_news --self-test` runs five queries with an obvious
expected topic. Top hits:

| Query | Top result |
|---|---|
| spot ETF inflows and institutional adoption | *Ether ETFs Pull In $117M, Breaking Four Days of Outflows* (0.497) |
| price crash and liquidations | *Binance pins crypto's worst-ever liquidation day on macro risks* (0.612) |
| stablecoin launch by a traditional finance company | *Fidelity to Launch a Stablecoin* (0.664) |
| meme coin trading activity | *Pippin and Pengu Crypto Lift Meme Coin Market* (0.667) |
| regulatory action or lawsuit | *Ex-SEC Lawyer Backs Ripple's CLARITY Act Stance* (0.327) |

On-topic across the board. The symbol filter works too — querying "price
prediction and upside target" with `--symbol XRPUSDT` returns only XRP articles.

The regulatory query scores noticeably lower (0.33 vs 0.5–0.67), which is the
honest weak spot: that topic is thinly represented in a 227-article corpus.

### Embedding backends

The plan specifies Gemini `embedding-001`. That is the default and the code path
is correct — it constructs fine and fails only at the API call, with the same
`CONSUMER_SUSPENDED` 403 as everything else.

So there is also a `local` backend (`all-MiniLM-L6-v2`, 384-dim, CPU, no key),
which is what produced the numbers above. Without it, T2.4 would have been
undemonstrable and the Sprint 2 DoD unmeetable.

**The two cannot share a collection** — 768-dim vs 384-dim are incompatible
spaces. `ensure_collection` refuses a mismatched embedder with an actionable
message rather than tolerating it, because mixed vectors produce retrieval
results that look plausible and mean nothing. Switching backends is
`--recreate` plus a full re-index.

Ingestion deliberately does *not* fall back between backends: a silent switch
mid-corpus would poison the collection. That is the opposite of the T2.2 policy,
and for a good reason — there, degrading keeps the service answering; here, it
would corrupt the index.

### A bug the tests did not catch

`published_at` was indexed as `KEYWORD` while `search()` filters it with
`DatetimeRange`. Every local test passed anyway, because **embedded Qdrant
ignores payload indexes and filters by brute force** — so the wrong index type
would only have surfaced against the real server. Fixed to `DATETIME`.

Worth remembering for T3.2: the embedded mode is excellent for testing query
*behaviour* and useless for validating index *types*.

---

## Sprint 2 definition of done

> - [x] `report.md` shows Gemini-vs-human and student-vs-human accuracy on the *same* hand-labeled set, plus student-vs-Gemini Spearman/MAE and one latency/cost comparison.
> - [x] Qdrant container runs via `docker-compose`, and a manual top-k query against `news_chunks` returns sane, on-topic articles.

Both met, with two honest gaps:

1. **The "Gemini" columns are the keyword fallback, not Gemini.** The key is
   suspended. Structure, scripts and reports are complete; restoring the key
   fills in the real numbers with no code changes.
2. **The Qdrant container was not started here** — no Docker daemon in this
   environment. The compose entry is written and the YAML validates, but
   `docker compose up -d qdrant` is unverified. Everything downstream was proven
   against embedded Qdrant, which shares the client API. **Please run it once
   before T3.2 depends on it**, and check the healthcheck in particular: the
   qdrant image ships no curl/wget, so it probes the port through bash
   `/dev/tcp`, which I could not test.

---

## What this means for Sprint 3

The distillation workstream has now produced its honest answer, and it is negative: **on the current data, the LoRA pass is worse than shipping the public checkpoint unmodified.** Three consequences:

1. **Do not do T2.2 (wire the student into the service).** It would be wiring in a model measurably worse than both the base checkpoint and the current pipeline. The sprint plan already lists T2.2 as the second thing to cut; this is the evidence for cutting it.

2. **If the Gemini key gets restored,** re-run the chain (`export_training_data` → `train_distill` → `evaluate_distill`). The ablation column is now permanent, so the retrained student has to beat 66.0% to justify itself. That is a real bar, and clearing it would be a genuine result.

3. **A cheaper win is sitting right there:** the untrained base checkpoint at 66.0% already beats the live pipeline's 56.0%, runs in 59 ms vs 229 ms, and costs nothing. If the goal is a better sentiment feature rather than a distillation story, adopting the public checkpoint as-is is strictly better than what is deployed today — no training required.

**Sprint 3 is unblocked.** T3.2's `search_news` tool can call
`app.qdrant_store.search` directly — `scripts/search_news.py` already makes
exactly that call, so the retrieval half of the agent is proven before the agent
exists.

Two things to do first:

- **Start the Qdrant container once** and confirm the healthcheck, since it is
  the one piece of Sprint 2 that could not be run here.
- **Re-index with Gemini embeddings** if the key is restored
  (`--backend gemini --recreate`), so retrieval and the agent share one provider
  as the plan intends.

Still outstanding from Sprint 1 and gating the quality of every accuracy number
above: **the 50 labels are LLM-drafted pending human review**
(`label_source: "llm_draft"`).

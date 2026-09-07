# Sprint Plan — Improvement Plan Execution

> Breaks [`improvement-plan.md`](./improvement-plan.md) into 3 sprints of 5 working days each.
> **Assumption:** solo dev, part-time/side-project pace. Treat each "day" as an effort unit, not a literal calendar day — compress into evenings/weekends or stretch across more calendar time as your schedule allows. Adjust if this is actually a team effort.

---

## Sprint 1 — Evaluation rigor + distillation data

**Goal:** Both existing AI components (LSTM, Gemini sentiment) have a measured number behind them, and the RoBERTa distillation has its training set exported and a first LoRA adapter trained (doesn't need to be good yet — Sprint 2 evaluates it).

| ID | Task | Workstream | Est. | Depends on |
|---|---|---|---|---|
| T1.1 | `prediction-service/app/ml/evaluate.py`: RMSE/MAE + directional accuracy vs. naive & persistence baselines | WS1 | 1d | — |
| T1.2 | Label 40–60 articles from `collected_news`; `sentiment-service/eval/evaluate.py` + bucket-accuracy report | WS2 | 1d | — |
| T1.3 | `sentiment-service/eval/export_training_data.py`: pull `sentiments` collection → `(text, sentiment_score, emotion)` triples, excluding whatever went into T1.2's eval set | WS3a | 0.5d | T1.2 |
| T1.4 | `training/train_distill.py`: LoRA fine-tune (regression + emotion heads) on a public financial-sentiment base checkpoint, domain-adapted with the exported data | WS3b | 1.5d | T1.3 |
| T1.5 | Buffer / spillover | — | 1d | — |

**Sprint 1 definition of done:**
- [ ] `report.md` exists for the LSTM with directional accuracy beating both baselines (or an honest note if it doesn't — that's still a valid finding).
- [ ] `report.md` exists for sentiment with bucket-accuracy % and at least 3 worst-disagreement examples written up.
- [ ] A LoRA adapter checkpoint exists from a completed training run (loss curve sane, no eval judgment yet — that's Sprint 2).

T1.1 and T1.2 have no shared dependency — do them in either order, or split across two evenings. T1.3 depends on T1.2 only because the eval set needs to be carved out first so training and eval data never overlap.

---

## Sprint 2 — Distillation eval + RAG groundwork

**Goal:** The distilled model has an honest accuracy number next to Gemini's, and Qdrant is populated with real, queryable embeddings — the prerequisite for Sprint 3's agent loop.

| ID | Task | Workstream | Est. | Depends on |
|---|---|---|---|---|
| T2.1 | `training/evaluate_distill.py`: student-vs-Gemini Spearman/MAE, then re-run T1.2's hand-labeled set through the student for a direct student-vs-human vs. Gemini-vs-human comparison; `report.md` | WS3c | 1d | T1.4, T1.2 |
| T2.2 | *(stretch)* Add `SENTIMENT_BACKEND=gemini\|local` to `sentiment-service` config, wire in the student model as an alternate path | WS3d | 0.5d | T2.1 |
| T2.3 | Add `qdrant` to `docker-compose.dev.yml`; create `news_chunks` collection (schema: vector + `symbol`/`title`/`link`/`published_at` payload) | WS4a | 0.5d | — |
| T2.4 | `chat-agent-service/scripts/ingest_news.py`: pull `collected_news` → embed (Gemini `embedding-001`) → upsert to Qdrant | WS4b | 1.5d | T2.3 |
| T2.5 | Buffer / spillover | — | 1.5d | — |

**Sprint 2 definition of done:**
- [ ] `report.md` shows Gemini-vs-human and student-vs-human accuracy on the *same* hand-labeled set, plus student-vs-Gemini Spearman/MAE and one latency/cost comparison.
- [ ] Qdrant container runs via `docker-compose`, and a manual top-k query against `news_chunks` returns sane, on-topic articles.

T2.3/T2.4 have no dependency on T2.1/T2.2 — if the distillation eval numbers come out weak and need another training pass, start the Qdrant work in parallel rather than blocking on it.

---

## Sprint 3 — Agent loop, frontend wiring, CI

**Goal:** The chatbot is provably grounded — it calls real tools, retrieves real news, and streams a synthesized answer. CI catches regressions in the two most important services.

| ID | Task | Workstream | Est. | Depends on |
|---|---|---|---|---|
| T3.1 | Scaffold `chat-agent-service` (FastAPI: config, health checks — mirror existing services' structure) | WS4c | 0.5d | — |
| T3.2 | Implement 3 tools: `get_prediction` → `prediction-service`, `get_sentiment_summary` → `sentiment-service`, `search_news` → Qdrant | WS4c | 1d | T2.4, T3.1 |
| T3.3 | Gemini function-calling loop (max 3 tool rounds) + SSE streaming of the final answer | WS4d | 1.5d | T3.2 |
| T3.4 | Swap `apps/web/app/api/chatbot/route.ts` to proxy `chat-agent-service` instead of calling Gemini directly | WS4e | 0.5d | T3.3 |
| T3.5 | E2E demo pass: ask the ETH sentiment+prediction+news question, confirm all 3 tools fire, record a screen capture | WS4 DoD | 0.5d | T3.4 |
| T3.6 | `.github/workflows/ci.yml`: lint + pytest for `prediction-service`, lint + jest for one NestJS service; README badge | WS5 | 1d | — |

**Sprint 3 definition of done:**
- [ ] Asking the chatbot a sentiment+prediction question triggers the correct tool calls (verify via logs) and the final answer cites a real retrieved headline.
- [ ] `ChatbotPanel.tsx` works unchanged in the browser — streaming still feels live.
- [ ] A PR against `main` shows a green CI run.
- [ ] Screen recording / GIF of the grounded chat exchange saved for the portfolio.

T3.6 has no dependency on the rest of Sprint 3 — pull it forward to an earlier sprint's buffer slot if the agent work runs long and you want CI done regardless.

---

## If you're short on time

Cut in this order (matches the "cut here" notes in `improvement-plan.md`):
1. Drop T3.6 (CI) entirely — lowest resume payoff per effort.
2. Drop T2.2 (wiring the distilled model into the live service) — a trained adapter with an honest eval report (T1.4 + T2.1) is already a legitimate artifact even if `sentiment-service` keeps calling Gemini in production.
3. Drop `search_news`/Qdrant (T2.3, T2.4, and the `search_news` part of T3.2) — keep only the two service-calling tools in the agent. Still legitimate function calling, just not RAG.
4. Reduce T1.2's labeled set to 30 items and skip the emotion confusion matrix.
5. Last resort — drop workstream 3 (distillation, T1.3/T1.4/T2.1) entirely if a sprint has to go. This is the last cut, not the first: it's the one workstream that turns "I called an LLM API" into an actual fine-tuning story, which is disproportionately valuable for an AI Engineer application relative to its cost.

Never cut T1.1/T1.2 — they're the cheapest, highest-payoff items in the whole plan.

## Backlog (not committed to any sprint)

- Hook `ingest_news.py` into the existing `collector_scheduler.py` cadence for continuous re-embedding.
- Extend CI to the remaining 7 services.
- Multi-symbol LSTM generalization.
- Re-run the distillation training pass periodically as the `sentiments` collection accumulates more labels, and track whether accuracy improves with data volume (a nice learning-curve chart if there's time).

# Sprint 1 — Completion Report

> Covers T1.1–T1.4 of [`sprint-plan.md`](./sprint-plan.md).
> Every number below is reproducible from the commands listed in each section.

---

## Definition of done

| # | Criterion | Status |
|---|---|---|
| 1 | `report.md` for the LSTM, directional accuracy vs. both baselines (or an honest note if it loses) | ✅ Done — **it loses**, see [T1.1](#t11--lstm-evaluation-harness) |
| 2 | `report.md` for sentiment with bucket-accuracy % and ≥3 worst-disagreement examples | ✅ Done — 5 examples, but see the backend caveat |
| 3 | A LoRA adapter checkpoint from a completed training run | ✅ Done — see [T1.4](#t14--lora-fine-tune) |

All three met. Two of them came with findings that change what Sprint 2 should do — read the [blockers](#blockers-found) section before starting it.

---

## T1.1 — LSTM evaluation harness

**Delivered:** [`services/prediction-service/app/ml/evaluate.py`](../services/prediction-service/app/ml/evaluate.py) → [`eval/report.md`](../services/prediction-service/eval/report.md), `report.json`, `pred_vs_actual.png`

```bash
cd services/prediction-service
pip install -r eval/requirements.txt
python -m app.ml.evaluate
```

The script rebuilds the dataset from `notebook/train_v3.ipynb` step for step — same sentiment CSV, same Binance fetch, same `ta` indicators, same 80/20 chronological split — then scores the deployed checkpoint on the held-out window.

**Reconstruction is verified, not assumed.** The checkpoint stores the notebook's test RMSE (`367.9495` USD); rebuilding from scratch reproduces `367.9495` USD (Δ 5e-05). Every other number is therefore measured on exactly the bars the notebook used.

### Result

| Model | RMSE (log-ret) | MAE (log-ret) | RMSE (USD) | Directional Acc. |
|---|---|---|---|---|
| Naive (0-change) | 0.005874 | 0.003809 | 367.44 | n/a |
| Majority class | 0.005874 | 0.003809 | 367.44 | 50.9% |
| Persistence | 0.008396 | 0.005631 | 524.26 | 48.0% |
| **LSTM (ours)** | **0.005883** | **0.003820** | **367.95** | **49.1%** |
| LSTM (serving-path bb_width) | 0.005884 | 0.003822 | 368.01 | 49.3% |

**The LSTM has no directional edge.** 49.1% against a 50.9% majority-class floor, on 4,995 test bars. Its RMSE is also marginally *worse* than predicting "no change" — the model has learned to output near-zero returns, which minimises MSE and carries no information. Re-running at a 90/10 split gives the same picture (49.5% vs a 50.0% floor), so this is not an artefact of where the split lands.

The sprint plan anticipated this: *"or an honest note if it doesn't — that's still a valid finding."* It is the single most useful thing this harness could have produced, and it is worth far more in an interview than an unexamined RMSE.

**What to say about it:** "I built an evaluation harness for the LSTM and it showed the model has no directional edge over a majority-class baseline — the single RMSE the training notebook reported was hiding that, because RMSE on log returns is minimised by predicting zero." That is a stronger sentence than any accuracy number.

---

## T1.2 — Sentiment ground-truth evaluation

**Delivered:**
- [`eval/build_labeled_set.py`](../services/sentiment-service/eval/build_labeled_set.py) — stratified sampler → `labeled_set.jsonl`
- [`eval/evaluate.py`](../services/sentiment-service/eval/evaluate.py) → [`eval/report.md`](../services/sentiment-service/eval/report.md), `report.json`

```bash
cd services/sentiment-service
python -m eval.build_labeled_set --size 50
python -m eval.evaluate
```

50 articles were drawn from `collected_news` (227 unique available), stratified across a keyword prior *and* symbol so the set deliberately contains ambiguous headlines rather than 50 easy ones. Final balance: 18 bullish / 16 neutral / 16 bearish.

### Result

| Metric | Value |
|---|---|
| Sentiment-bucket accuracy | **56.0%** |
| Majority-class baseline | 36.0% |
| Emotion accuracy | **24.0%** |
| Random baseline (6 emotions) | 16.7% |
| Mean latency / article | ~200 ms |

### ⚠ These are not Gemini's numbers

The harness runs a Gemini preflight and counts fallbacks per article. It found that **0 of 50 articles were scored by Gemini** — all 50 were scored by `SentimentService._mock_sentiment_analysis`, the keyword heuristic.

The configured API key returns `403 CONSUMER_SUSPENDED`. `_gemini_sentiment_analysis` catches every exception and returns the mock result, so the service keeps answering `200 OK` and nothing downstream can tell the difference. The ~200 ms mean latency is mostly the failed network round-trip that production pays on every single article for nothing.

So: **56% is the accuracy of the keyword fallback that is actually running in production.** Gemini's real number is still unmeasured. Re-run the same command with a working key to get it — the harness needs no changes.

Two caveats on the labels themselves, both stated in the report:
- The 50 labels are **LLM-drafted, not human-verified** (`label_source: "llm_draft"`). Reviewing them is ~1 hour and is the highest-value hour available before Sprint 2. Re-running `build_labeled_set` preserves any label you correct.
- Article bodies are Yahoo Finance summaries (~150 chars), not full text.

---

## T1.3 — Training-set export

**Delivered:** [`eval/export_training_data.py`](../services/sentiment-service/eval/export_training_data.py) → `training/data/{train,val}.jsonl` + [`export_report.md`](../services/sentiment-service/training/data/export_report.md)

```bash
cd services/sentiment-service
python -m eval.export_training_data
```

| | |
|---|---|
| Analyses in MongoDB | 251 (across `tradex_sentiment` + `tradex`) |
| After de-duplication | 226 |
| Held out (in eval set) | 50 |
| Exported | **140 train / 36 val**, split chronologically |

Eval-set isolation is enforced by link, so the workstream-2 labelled articles never reach training — the student-vs-human comparison in Sprint 2 stays clean.

**The export also detects teacher provenance.** It reconstructs every reason string `_generate_mock_reason` can emit and matches stored rows against them. Result: **226 of 226 rows carry mock labels, 0 from Gemini.** The script refuses to export a mock-dominated set unless you pass `--allow-mock-labels`, precisely so nobody trains a "distilled Gemini" on keyword output by accident.

---

## T1.4 — LoRA fine-tune

**Delivered:** [`training/train_distill.py`](../services/sentiment-service/training/train_distill.py) → `training/artifacts/` (LoRA adapter, heads, loss curve, `report.md`)

```bash
cd services/sentiment-service
pip install -r training/requirements.txt
python -m training.train_distill
```

Base checkpoint: `mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis` — already tuned on a public financial-sentiment corpus, so this run is a **domain-adaptation pass on top**, which is both the safer story w.r.t. Google's ToS and the better one to tell in an interview (per the note in the improvement plan).

Architecture: frozen encoder + LoRA adapters on the attention `query`/`value` projections, with two heads — a `tanh` regression head for the −1..+1 score and a 6-way emotion classifier. Mean pooling over unmasked tokens.

### What LoRA bought

| | Params |
|---|---|
| Full model | 82,418,695 |
| Trainable (LoRA + heads) | 300,295 |
| &nbsp;&nbsp;of which LoRA adapters | 294,912 |
| &nbsp;&nbsp;of which task heads | 5,383 |
| **Trainable share** | **0.36%** |

**0.36% of parameters receive gradients.** That is the concrete number behind the resume claim, and it is what turned this into a ~10-minute CPU run on a laptop instead of a GPU job. The saved adapter is 1.2 MB against an 82M-parameter base.

### Training curve

Train loss falls monotonically 2.47 → 1.40 across 10 epochs. Validation loss bottoms at **epoch 2 (2.2060)** and rises steadily after — the run overfits, which is exactly what 140 training rows buys you.

The script snapshots the best-validation weights and restores them before saving, so **the checkpoint on disk is epoch 2, not epoch 10**. Shipping the final-epoch weights would have handed Sprint 2 the worst checkpoint of the run.

| Metric (held-out val) | Selected (epoch 2) | Last epoch (10) |
|---|---|---|
| Val loss | **2.2060** | 2.6207 |
| Val MAE (sentiment score) | **0.6676** | 0.7214 |
| Val emotion accuracy | **36.1%** (random = 16.7%) | 38.9% |
| Val Spearman (student vs teacher) | **0.172** | 0.165 |

### Reading these numbers honestly

They are student-vs-*teacher* on 36 held-out rows, and the teacher is the keyword mock. Spearman of 0.17 means the student has barely learned to rank the way its teacher does — unsurprising given 140 rows and a teacher that is itself a bag of keywords. **Do not cite these as distillation quality.** The DoD for this task was a completed run with a sane loss curve and no eval judgment, and that is what this is: the pipeline works end to end, so the moment real Gemini labels exist the same command produces a meaningful adapter.

---

## Blockers found

Ranked by how much they change Sprint 2.

### 1. The Gemini API key is suspended — blocks the real T1.2 number and all of workstream 3

`403 PERMISSION_DENIED / CONSUMER_SUSPENDED`. The key is hardcoded as a default in [`services/sentiment-service/app/config.py`](../services/sentiment-service/app/config.py) and is committed to the repo, which is almost certainly why Google revoked it.

**Do this before Sprint 2:**
1. Issue a new key. Put it in `.env` only — remove the default from `config.py` so a missing key fails loudly instead of silently degrading.
2. Re-analyse the article backlog so `sentiments` fills with real Gemini labels.
3. Re-run `eval.evaluate` (real Gemini accuracy), then `eval.export_training_data` (confirm `gemini` share ≈ 100%), then `training.train_distill`.

Until then, T2.1's student-vs-Gemini comparison has no teacher to compare against.

### 2. Silent fallback masks the outage

`_gemini_sentiment_analysis` swallows every exception and returns mock output with no marker in the stored document. A dead key, a rate limit and a healthy pipeline are indistinguishable from outside. Worth fixing regardless of the key: log at `ERROR`, and stamp the backend onto the stored document so provenance never has to be reverse-engineered from reason strings again.

### 3. `bb_width` is 100× off between training and serving

- Training used `ta.BollingerBands.bollinger_wband()` → a **percentage** (e.g. `4.269930`)
- Serving uses `TechnicalIndicatorCalculator.calculate_bollinger_width()` → a **fraction** (`0.042699`)
- Measured ratio: **99.999997×**

The model receives a feature ~100× smaller than anything it saw in training. The measured accuracy impact is small here only because the model has no edge to lose — fix it before drawing any conclusion from a retrained model. There is a second, smaller mismatch: training windows end one bar before the predicted bar, while the service builds its window up to the latest candle.

### 4. The README describes a model that isn't in the repo

`README.md` claims a fine-tuned RoBERTa (~125M params, partial freezing, dynamic masking, CrossEntropy + MSE) behind the sentiment feature. `sentiment-service` contains no RoBERTa — only the Gemini call and the keyword mock. T1.4's adapter is the first real encoder in the repo. Either land workstream 3 properly and let the claim become true, or amend the README.

---

## Suggested Sprint 2 adjustment

The plan's T2.1 assumes a trained student worth evaluating. Right now the adapter was trained on keyword labels, so its Sprint 2 eval would measure how well a transformer imitates a regex. Two options:

- **Recommended:** spend the first half-day of Sprint 2 on blocker #1 (new key + backlog re-analysis), then re-run T1.3/T1.4 unchanged. Every script already works; only the data changes. T2.1 then produces a real number.
- **Fallback:** if no key is available, pull T2.3/T2.4 (Qdrant + ingestion) forward — the sprint plan explicitly allows this — and treat workstream 3 as parked rather than done.

Also worth doing early since it is pure human time and gates the quality of everything downstream: review the 50 drafted labels in `labeled_set.jsonl`.

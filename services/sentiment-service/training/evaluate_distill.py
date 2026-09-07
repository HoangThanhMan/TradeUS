"""
Evaluate the distilled student against both its teacher and the human labels.

Answers three questions, in increasing order of how much they matter:

1. **Student vs. teacher** — Spearman and MAE on the held-out `val.jsonl` split.
   This says how faithfully the student imitates whatever produced its training
   labels. It is a fidelity number, not a quality number.

2. **Student vs. human** — the student re-scored over workstream 2's
   hand-labelled set (`eval/labeled_set.jsonl`), bucketed with the same
   thresholds the labeller used.

3. **Student vs. human, next to pipeline vs. human, on the same 50 articles** —
   the honest "how much quality did we trade for speed and cost" answer. Because
   both systems scored the identical articles, this is a *paired* comparison:
   the report breaks results down into who got what right, rather than putting
   two unrelated accuracy figures side by side.

Plus a latency and cost comparison: measured local CPU inference against the
measured API round-trip, and the token accounting behind the per-article cost.

Before any of that, the script verifies that no article in the labelled set
appears in the student's training data. If that check fails, every number below
it is meaningless, so it is a hard error rather than a warning.

Usage:
    cd services/sentiment-service
    python -m training.evaluate_distill
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import torch

from eval.evaluate import (
    BUCKETS,
    accuracy,
    bucket_score,
    confusion_matrix,
    per_class_scores,
)
from training.train_distill import EMOTIONS, DualHeadStudent, spearman

logger = logging.getLogger(__name__)

TRAINING_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_DIR = os.path.dirname(TRAINING_DIR)
DEFAULT_ARTIFACTS_DIR = os.path.join(TRAINING_DIR, "artifacts")
DEFAULT_DATA_DIR = os.path.join(TRAINING_DIR, "data")
DEFAULT_LABELED_SET = os.path.join(SERVICE_DIR, "eval", "labeled_set.jsonl")
DEFAULT_PIPELINE_REPORT = os.path.join(SERVICE_DIR, "eval", "report.json")
DEFAULT_REPORT_MD = os.path.join(TRAINING_DIR, "report.md")
DEFAULT_REPORT_JSON = os.path.join(TRAINING_DIR, "report.json")


def load_jsonl(path: str) -> list[dict[str, Any]]:
    """Read a JSONL file into a list of dicts."""
    if not os.path.exists(path):
        raise SystemExit(f"Missing {path}")
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


# ---------------------------------------------------------------------------
# Student loading and inference
# ---------------------------------------------------------------------------


def load_student(
    artifacts_dir: str, device: torch.device
) -> tuple[DualHeadStudent, Any, dict[str, Any]]:
    """
    Rebuild the trained student from the saved adapter and heads.

    The base checkpoint name comes from ``training_run.json`` rather than a
    constant, so the evaluation can never silently attach the adapter to a
    different base than the one it was trained against.
    """
    from peft import PeftModel
    from transformers import AutoModel, AutoTokenizer

    run_path = os.path.join(artifacts_dir, "training_run.json")
    if not os.path.exists(run_path):
        raise SystemExit(
            f"Missing {run_path}. Run `python -m training.train_distill` first."
        )
    with open(run_path, encoding="utf-8") as fh:
        run_metadata = json.load(fh)

    base_model = run_metadata["config"]["base_model"]
    adapter_dir = os.path.join(artifacts_dir, "lora_adapter")
    heads_path = os.path.join(artifacts_dir, "heads.pt")

    logger.info("Loading base %s + adapter %s", base_model, adapter_dir)
    tokenizer = AutoTokenizer.from_pretrained(adapter_dir)
    base_encoder = AutoModel.from_pretrained(base_model)
    encoder = PeftModel.from_pretrained(base_encoder, adapter_dir)

    heads = torch.load(heads_path, map_location="cpu", weights_only=False)
    emotions = heads.get("emotions", EMOTIONS)

    model = DualHeadStudent(encoder, base_encoder.config.hidden_size, len(emotions))
    model.regression_head.load_state_dict(heads["regression_head"])
    model.emotion_head.load_state_dict(heads["emotion_head"])
    model.to(device)
    model.eval()

    run_metadata["emotions"] = emotions
    return model, tokenizer, run_metadata


@torch.no_grad()
def score_texts(
    model: DualHeadStudent,
    tokenizer,
    texts: list[str],
    device: torch.device,
    emotions: list[str],
    max_length: int = 256,
    batch_size: int = 16,
) -> tuple[list[float], list[str]]:
    """Run the student over a list of texts, returning scores and emotion labels."""
    scores: list[float] = []
    predicted_emotions: list[str] = []

    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        encoded = tokenizer(
            batch,
            truncation=True,
            max_length=max_length,
            padding=True,
            return_tensors="pt",
        ).to(device)

        score, emotion_logits = model(
            encoded["input_ids"], encoded["attention_mask"]
        )
        scores.extend(score.cpu().tolist())
        predicted_emotions.extend(
            emotions[i] for i in emotion_logits.argmax(dim=-1).cpu().tolist()
        )

    return scores, predicted_emotions


def measure_latency(
    model: DualHeadStudent,
    tokenizer,
    texts: list[str],
    device: torch.device,
    emotions: list[str],
    max_length: int = 256,
) -> dict[str, float]:
    """
    Time single-article inference, the way the service would call it.

    Batched throughput is reported too, but the per-article figure is what
    compares like-for-like against the API round-trip the pipeline pays.
    """
    # One warm-up pass so lazy kernel init does not land in the first sample.
    score_texts(model, tokenizer, texts[:2], device, emotions, max_length, 2)

    single: list[float] = []
    for text in texts:
        started = time.perf_counter()
        score_texts(model, tokenizer, [text], device, emotions, max_length, 1)
        single.append(time.perf_counter() - started)

    started = time.perf_counter()
    score_texts(model, tokenizer, texts, device, emotions, max_length, 16)
    batched_total = time.perf_counter() - started

    single.sort()
    return {
        "mean_single": sum(single) / len(single),
        "median_single": single[len(single) // 2],
        "p95_single": single[min(int(len(single) * 0.95), len(single) - 1)],
        "batched_per_article": batched_total / len(texts),
        "n": len(texts),
    }


# ---------------------------------------------------------------------------
# Integrity
# ---------------------------------------------------------------------------


def check_leakage(labeled_rows: list[dict[str, Any]], data_dir: str) -> dict[str, Any]:
    """
    Confirm the labelled set never reached the student's training data.

    The export script holds these articles out by link; this verifies it
    actually happened, because a leak would silently turn the headline
    student-vs-human number into a memorisation score.
    """
    labeled_links = {row["link"] for row in labeled_rows}

    train_links = {r["link"] for r in load_jsonl(os.path.join(data_dir, "train.jsonl"))}
    val_links = {r["link"] for r in load_jsonl(os.path.join(data_dir, "val.jsonl"))}

    overlap_train = labeled_links & train_links
    overlap_val = labeled_links & val_links

    return {
        "n_labeled": len(labeled_links),
        "n_train": len(train_links),
        "n_val": len(val_links),
        "overlap_train": len(overlap_train),
        "overlap_val": len(overlap_val),
        "clean": not overlap_train and not overlap_val,
        "examples": sorted(overlap_train | overlap_val)[:5],
    }


# ---------------------------------------------------------------------------
# Comparisons
# ---------------------------------------------------------------------------


def evaluate_vs_teacher(
    model: DualHeadStudent,
    tokenizer,
    val_rows: list[dict[str, Any]],
    device: torch.device,
    emotions: list[str],
) -> dict[str, Any]:
    """Student vs. the labels it was trained to imitate, on the held-out split."""
    texts = [row["text"] for row in val_rows]
    scores, predicted_emotions = score_texts(
        model, tokenizer, texts, device, emotions
    )

    teacher_scores = [float(row["sentiment_score"]) for row in val_rows]
    teacher_emotions = [row["emotion"] for row in val_rows]

    absolute_errors = [abs(s - t) for s, t in zip(scores, teacher_scores, strict=True)]
    emotion_hits = sum(
        1 for p, t in zip(predicted_emotions, teacher_emotions, strict=True) if p == t
    )

    student_buckets = [bucket_score(s) for s in scores]
    teacher_buckets = [bucket_score(s) for s in teacher_scores]
    bucket_hits = sum(
        1 for s, t in zip(student_buckets, teacher_buckets, strict=True) if s == t
    )

    return {
        "n": len(val_rows),
        "spearman": spearman(scores, teacher_scores),
        "mae": sum(absolute_errors) / len(absolute_errors),
        "emotion_accuracy": emotion_hits / len(val_rows),
        "bucket_agreement": bucket_hits / len(val_rows),
        "teacher": Counter(row.get("teacher", "unknown") for row in val_rows).most_common(1)[0][0],
    }


def evaluate_vs_human(
    model: DualHeadStudent,
    tokenizer,
    labeled_rows: list[dict[str, Any]],
    device: torch.device,
    emotions: list[str],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Student vs. the hand labels, scored exactly as workstream 2 scored the pipeline."""
    texts = [
        f"{row['title']}\n\n{row['content']}"
        if row["content"] and row["content"] != row["title"]
        else row["title"]
        for row in labeled_rows
    ]
    scores, predicted_emotions = score_texts(
        model, tokenizer, texts, device, emotions
    )

    predictions = []
    for row, score, emotion in zip(labeled_rows, scores, predicted_emotions, strict=True):
        predictions.append(
            {
                "link": row["link"],
                "title": row["title"],
                "label_bucket": row["label_sentiment_bucket"],
                "label_emotion": row.get("label_emotion"),
                "pred_score": score,
                "pred_bucket": bucket_score(score),
                "pred_emotion": emotion,
            }
        )

    bucket_cm = confusion_matrix(
        predictions, "label_bucket", "pred_bucket", BUCKETS
    )
    label_counts = Counter(p["label_bucket"] for p in predictions)

    metrics = {
        "n": len(predictions),
        "bucket_accuracy": accuracy(predictions, "label_bucket", "pred_bucket"),
        "emotion_accuracy": accuracy(predictions, "label_emotion", "pred_emotion"),
        "bucket_confusion_matrix": bucket_cm,
        "bucket_scores": per_class_scores(bucket_cm, BUCKETS),
        "prediction_distribution": dict(
            Counter(p["pred_bucket"] for p in predictions)
        ),
        "majority_class_baseline": max(label_counts.values()) / len(predictions),
    }
    return metrics, predictions


@torch.no_grad()
def evaluate_base_checkpoint(
    base_model: str,
    labeled_rows: list[dict[str, Any]],
    device: torch.device,
    batch_size: int = 16,
) -> dict[str, Any]:
    """
    Score the untrained public checkpoint on the same labelled set.

    This is the control the student's number is meaningless without. The base is
    already a 3-class financial-sentiment classifier
    (negative/neutral/positive), which maps straight onto the bearish/neutral/
    bullish taxonomy — so it can be scored zero-shot, with no adapter and no
    training. If it matches the student, the LoRA pass bought nothing and the
    report should say so.
    """
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    logger.info("Scoring the untrained base checkpoint as a control")
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    model = AutoModelForSequenceClassification.from_pretrained(base_model)
    model.to(device)
    model.eval()

    label_map = {"negative": "bearish", "neutral": "neutral", "positive": "bullish"}
    id2label = {
        int(i): label_map.get(str(name).lower(), "neutral")
        for i, name in model.config.id2label.items()
    }

    texts = [
        f"{row['title']}\n\n{row['content']}"
        if row["content"] and row["content"] != row["title"]
        else row["title"]
        for row in labeled_rows
    ]

    predictions: list[dict[str, Any]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        encoded = tokenizer(
            batch, truncation=True, max_length=256, padding=True, return_tensors="pt"
        ).to(device)
        logits = model(**encoded).logits
        for offset, index in enumerate(logits.argmax(dim=-1).cpu().tolist()):
            row = labeled_rows[start + offset]
            predictions.append(
                {
                    "link": row["link"],
                    "label_bucket": row["label_sentiment_bucket"],
                    "pred_bucket": id2label.get(index, "neutral"),
                }
            )

    matrix = confusion_matrix(predictions, "label_bucket", "pred_bucket", BUCKETS)
    return {
        "base_model": base_model,
        "n": len(predictions),
        "bucket_accuracy": accuracy(predictions, "label_bucket", "pred_bucket"),
        "bucket_confusion_matrix": matrix,
        "bucket_scores": per_class_scores(matrix, BUCKETS),
        "prediction_distribution": dict(
            Counter(p["pred_bucket"] for p in predictions)
        ),
        "id2label": {str(k): v for k, v in id2label.items()},
    }


def paired_comparison(
    student_predictions: list[dict[str, Any]],
    pipeline_predictions: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Break the two systems down article by article on the same labelled set.

    Two aggregate accuracies can be equal while the systems disagree on most
    articles, so the useful comparison is the paired one: who got what right.
    """
    pipeline_by_link = {p["link"]: p for p in pipeline_predictions}

    both_right = only_student = only_pipeline = both_wrong = 0
    disagreements: list[dict[str, Any]] = []

    for student in student_predictions:
        pipeline = pipeline_by_link.get(student["link"])
        if pipeline is None:
            continue

        label = student["label_bucket"]
        student_right = student["pred_bucket"] == label
        pipeline_right = pipeline["pred_bucket"] == label

        if student_right and pipeline_right:
            both_right += 1
        elif student_right:
            only_student += 1
            disagreements.append(
                {
                    "title": student["title"],
                    "label": label,
                    "student": student["pred_bucket"],
                    "pipeline": pipeline["pred_bucket"],
                    "winner": "student",
                }
            )
        elif pipeline_right:
            only_pipeline += 1
            disagreements.append(
                {
                    "title": student["title"],
                    "label": label,
                    "student": student["pred_bucket"],
                    "pipeline": pipeline["pred_bucket"],
                    "winner": "pipeline",
                }
            )
        else:
            both_wrong += 1

    n = both_right + only_student + only_pipeline + both_wrong
    return {
        "n": n,
        "both_right": both_right,
        "only_student_right": only_student,
        "only_pipeline_right": only_pipeline,
        "both_wrong": both_wrong,
        "agreement": (both_right + both_wrong) / n if n else 0.0,
        "disagreements": disagreements[:10],
    }


def estimate_cost(
    tokenizer,
    labeled_rows: list[dict[str, Any]],
    input_price_per_million: float | None,
) -> dict[str, Any]:
    """
    Account for the tokens the API path spends per article.

    The dollar figure only appears when a price is supplied, because published
    rates change and a stale constant baked into a report is worse than no
    number at all.
    """
    from app.services.sentiment_service import SENTIMENT_ANALYSIS_PROMPT

    # The prompt template dwarfs the article on this corpus, which is the whole
    # cost story -- measure it rather than guess.
    template_tokens = len(tokenizer.encode(SENTIMENT_ANALYSIS_PROMPT))
    article_tokens = [
        len(tokenizer.encode(f"{row['title']} {row['content']}"))
        for row in labeled_rows
    ]
    mean_article = sum(article_tokens) / len(article_tokens)
    mean_total = template_tokens + mean_article

    result: dict[str, Any] = {
        "prompt_template_tokens": template_tokens,
        "mean_article_tokens": mean_article,
        "mean_input_tokens_per_article": mean_total,
        "template_share": template_tokens / mean_total,
        "tokenizer_note": (
            "Counted with the student's RoBERTa BPE tokenizer, not Gemini's. "
            "Treat as an approximation good to roughly +/-20%."
        ),
        "input_price_per_million": input_price_per_million,
    }
    if input_price_per_million is not None:
        result["usd_per_1k_articles"] = (
            mean_total * 1000 / 1_000_000 * input_price_per_million
        )
    return result


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _pct(value: float | None) -> str:
    """Format a 0-1 ratio as a percentage."""
    if value is None:
        return "n/a"
    return f"{value * 100:.1f}%"


def render_markdown(report: dict[str, Any]) -> str:
    """Render the full comparison as report.md."""
    teacher = report["student_vs_teacher"]
    student = report["student_vs_human"]
    pipeline = report["pipeline_vs_human"]
    base = report["base_checkpoint_control"]
    paired = report["paired"]
    latency = report["latency"]
    cost = report["cost"]
    leakage = report["leakage_check"]
    provenance = report["provenance"]

    lines: list[str] = []
    lines.append("# Distilled Student — Evaluation Report")
    lines.append("")
    lines.append(
        f"> Generated by `python -m training.evaluate_distill` on "
        f"{report['generated_at']}."
    )
    lines.append("")

    # --- Provenance banner ------------------------------------------------
    if provenance["teacher"] != "gemini" or provenance["pipeline_backend"] != "gemini":
        lines.append("## ⚠ Read this before quoting any number below")
        lines.append("")
        lines.append(
            "The configured Gemini key returns "
            f"`{provenance.get('gemini_status', 'an error')}`, so **there is no "
            "Gemini anywhere in this comparison**:"
        )
        lines.append("")
        lines.append(
            f"- The student's training labels came from `{provenance['teacher']}` "
            "— the keyword fallback in `SentimentService._mock_sentiment_analysis`."
        )
        lines.append(
            f"- The \"pipeline\" column below is that same fallback "
            f"(`{provenance['pipeline_backend']}`, "
            f"{provenance['pipeline_n_gemini']}/{provenance['pipeline_n_total']} "
            "articles reached Gemini)."
        )
        lines.append("")
        lines.append(
            "So this is **student-vs-keyword-heuristic**, not student-vs-Gemini. "
            "The Sprint 2 definition of done asks for Gemini-vs-human next to "
            "student-vs-human; that row cannot be filled until a working key "
            "exists. Every script here is ready — restore the key, re-analyse the "
            "backlog, re-run T1.3/T1.4, then re-run this."
        )
        lines.append("")
        lines.append(
            "What *is* legitimate below: the student-vs-human numbers (the student "
            "is a real trained model and the labels are real), the paired "
            "comparison, and the latency measurements."
        )
        lines.append("")

    # --- Integrity --------------------------------------------------------
    lines.append("## Eval-set isolation")
    lines.append("")
    if leakage["clean"]:
        lines.append(
            f"✅ None of the {leakage['n_labeled']} labelled articles appear in the "
            f"student's {leakage['n_train']} training or {leakage['n_val']} "
            "validation rows. The student-vs-human number below is measured on "
            "articles the student has never seen."
        )
    else:
        lines.append(
            f"❌ **{leakage['overlap_train'] + leakage['overlap_val']} labelled "
            "articles leaked into the student's training data.** The "
            "student-vs-human number is a memorisation score, not an accuracy."
        )
    lines.append("")

    # --- Headline ---------------------------------------------------------
    lines.append("## The comparison that matters")
    lines.append("")
    lines.append(
        f"Both systems scored the same {student['n']} hand-labelled articles, "
        "bucketed with the same thresholds."
    )
    lines.append("")
    lines.append(
        "| | Student (local) | Pipeline (API path) | Base checkpoint, untrained |"
    )
    lines.append("|---|---|---|---|")
    lines.append(
        f"| Sentiment-bucket accuracy | **{_pct(student['bucket_accuracy'])}** "
        f"| **{_pct(pipeline['bucket_accuracy'])}** "
        f"| **{_pct(base['bucket_accuracy'])}** |"
    )
    lines.append(
        f"| Emotion accuracy | {_pct(student['emotion_accuracy'])} "
        f"| {_pct(pipeline['emotion_accuracy'])} | n/a (3-class model) |"
    )
    lines.append(
        f"| Majority-class baseline | {_pct(student['majority_class_baseline'])} "
        f"| {_pct(student['majority_class_baseline'])} "
        f"| {_pct(student['majority_class_baseline'])} |"
    )
    lines.append(
        f"| Mean latency / article | **{latency['student']['mean_single'] * 1000:.0f} ms** "
        f"| {latency['pipeline_mean'] * 1000:.0f} ms | ~same as student |"
    )
    usd = cost.get("usd_per_1k_articles")
    api_cost_cell = (
        f"${usd:.3f}"
        if usd is not None
        else f"~{cost['mean_input_tokens_per_article']:.0f} input tokens/article"
    )
    lines.append(
        f"| Marginal cost / 1k articles | **$0** (local CPU) | {api_cost_cell} | $0 |"
    )
    lines.append("")

    delta = student["bucket_accuracy"] - pipeline["bucket_accuracy"]
    base_delta = student["bucket_accuracy"] - base["bucket_accuracy"]

    speedup = latency["pipeline_mean"] / latency["student"]["mean_single"]
    if delta >= 0:
        lines.append(
            f"The student is {delta * 100:+.1f} points on bucket accuracy against the "
            f"path it was distilled from, at {speedup:.1f}x the speed and no "
            "marginal cost."
        )
    else:
        lines.append(
            f"The student gives up {abs(delta) * 100:.1f} points of bucket accuracy "
            "against the path it was distilled from, in exchange for "
            f"{speedup:.1f}x the speed and no marginal cost."
        )
    if base_delta < -0.02:
        lines.append("")
        lines.append(
            "**But that is the wrong comparison to lead with.** The third column is "
            f"the one that matters: the *untrained* base checkpoint scores "
            f"{_pct(base['bucket_accuracy'])} on the same articles, so the trained "
            f"student is {abs(base_delta) * 100:.1f} points **worse than doing no "
            "training at all**. See below."
        )
    lines.append("")

    # --- Did the training do anything? ------------------------------------
    lines.append("### Did the LoRA pass actually do anything?")
    lines.append("")
    base_delta = student["bucket_accuracy"] - base["bucket_accuracy"]
    lines.append(
        f"The base checkpoint (`{base['base_model']}`) is already a 3-class "
        "financial-sentiment classifier, so it can be scored on the same articles "
        "with **no adapter and no training at all**. That is the control that makes "
        "the student's number interpretable."
    )
    lines.append("")
    if abs(base_delta) < 0.05:
        lines.append(
            f"Untrained base: **{_pct(base['bucket_accuracy'])}**. Student: "
            f"**{_pct(student['bucket_accuracy'])}**. That is a "
            f"{base_delta * 100:+.1f}-point difference on 50 articles — **within "
            "noise**. On this data the LoRA pass cannot be shown to have added "
            "anything; essentially all of the student's competence comes from the "
            "public checkpoint it started from."
        )
        lines.append("")
        lines.append(
            "That is consistent with the fidelity number below: Spearman "
            f"{teacher['spearman']:.2f} and {_pct(teacher['bucket_agreement'])} bucket "
            "agreement mean the student did *not* successfully imitate its teacher. "
            "Given the teacher was a keyword heuristic, failing to imitate it is "
            "arguably the best outcome available — but it does mean this run has not "
            "yet demonstrated distillation, only that a good public checkpoint plus "
            "an untrained-on-signal adapter performs like the public checkpoint."
        )
    elif base_delta > 0:
        lines.append(
            f"Untrained base: {_pct(base['bucket_accuracy'])}. Student: "
            f"**{_pct(student['bucket_accuracy'])}** — the LoRA pass added "
            f"**{base_delta * 100:+.1f} points** over the checkpoint it started from."
        )
    else:
        lines.append(
            f"Untrained base: **{_pct(base['bucket_accuracy'])}**. Student: "
            f"{_pct(student['bucket_accuracy'])} — the LoRA pass **cost** "
            f"{abs(base_delta) * 100:.1f} points against the checkpoint it started "
            "from. Training on the current labels actively degraded a working model."
        )
    lines.append("")
    lines.append(
        f"Base prediction spread: {base['prediction_distribution']} · "
        f"student: {student['prediction_distribution']}"
    )
    lines.append("")

    # --- Paired -----------------------------------------------------------
    lines.append("### Paired breakdown")
    lines.append("")
    lines.append(
        "Aggregate accuracies can match while the two systems disagree on most "
        "articles, so here is the article-by-article split:"
    )
    lines.append("")
    lines.append("| Outcome | Articles |")
    lines.append("|---|---|")
    lines.append(f"| Both right | {paired['both_right']} |")
    lines.append(f"| Only the student right | {paired['only_student_right']} |")
    lines.append(f"| Only the pipeline right | {paired['only_pipeline_right']} |")
    lines.append(f"| Both wrong | {paired['both_wrong']} |")
    lines.append(f"| **Agreement rate** | **{_pct(paired['agreement'])}** |")
    lines.append("")

    if paired["disagreements"]:
        lines.append("Where they split (first 10):")
        lines.append("")
        lines.append("| Article | Label | Student | Pipeline |")
        lines.append("|---|---|---|---|")
        for row in paired["disagreements"]:
            title = row["title"][:70] + ("…" if len(row["title"]) > 70 else "")
            student_cell = (
                f"**{row['student']}**" if row["winner"] == "student" else row["student"]
            )
            pipeline_cell = (
                f"**{row['pipeline']}**"
                if row["winner"] == "pipeline"
                else row["pipeline"]
            )
            lines.append(
                f"| {title} | {row['label']} | {student_cell} | {pipeline_cell} |"
            )
        lines.append("")

    # --- Student vs teacher ----------------------------------------------
    lines.append("## Student vs. teacher (fidelity)")
    lines.append("")
    lines.append(
        f"On the {teacher['n']} held-out `val.jsonl` rows — how closely the student "
        f"reproduces the `{teacher['teacher']}` labels it was trained on."
    )
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append(f"| Spearman (student vs teacher score) | **{teacher['spearman']:.3f}** |")
    lines.append(f"| MAE (sentiment score) | **{teacher['mae']:.3f}** |")
    lines.append(f"| Bucket agreement | {_pct(teacher['bucket_agreement'])} |")
    lines.append(f"| Emotion agreement | {_pct(teacher['emotion_accuracy'])} |")
    lines.append("")
    lines.append(
        "This is a fidelity measure, not a quality one. A student can match its "
        "teacher perfectly and still be wrong about the world — which is why the "
        "human-labelled comparison above is the one that counts."
    )
    lines.append("")

    # --- Confusion matrix -------------------------------------------------
    lines.append("## Student confusion matrix (vs. human labels)")
    lines.append("")
    lines.append("Rows are the human label, columns are the student's call.")
    lines.append("")
    lines.append("| actual \\ predicted | " + " | ".join(BUCKETS) + " |")
    lines.append("|---" * (len(BUCKETS) + 1) + "|")
    for true in BUCKETS:
        cells = " | ".join(
            str(student["bucket_confusion_matrix"][true][p]) for p in BUCKETS
        )
        lines.append(f"| **{true}** | {cells} |")
    lines.append("")
    lines.append("| Bucket | Precision | Recall | F1 | Support |")
    lines.append("|---|---|---|---|---|")
    for bucket in BUCKETS:
        s = student["bucket_scores"][bucket]
        lines.append(
            f"| {bucket} | {_pct(s['precision'])} | {_pct(s['recall'])} "
            f"| {s['f1']:.2f} | {int(s['support'])} |"
        )
    lines.append("")
    neutral = student["bucket_scores"]["neutral"]
    lines.append(
        f"Student prediction spread: {student['prediction_distribution']}."
    )
    lines.append("")
    if neutral["recall"] < 0.35:
        lines.append(
            f"**The student cannot identify neutral articles.** Recall on the neutral "
            f"bucket is {_pct(neutral['recall'])} — of "
            f"{int(neutral['support'])} genuinely neutral articles it catches "
            f"{int(neutral['recall'] * neutral['support'])}, pushing the rest into "
            "bullish or bearish. Its headline accuracy is carried entirely by the "
            "easy directional cases."
        )
        lines.append("")
        lines.append(
            "This matters more than the headline number for the trading use case: a "
            "model that never says \"no clear signal\" manufactures a directional "
            "call on every article it sees, which is exactly the behaviour that would "
            "feed noise into the BUY/SELL/HOLD signal downstream. Worth fixing with "
            "class weighting or a wider neutral band before anything consumes this."
        )
        lines.append("")

    # --- Latency / cost ---------------------------------------------------
    lines.append("## Latency and cost")
    lines.append("")
    lines.append("| | Student (local CPU) | Pipeline (API path) |")
    lines.append("|---|---|---|")
    lines.append(
        f"| Mean / article | **{latency['student']['mean_single'] * 1000:.0f} ms** "
        f"| {latency['pipeline_mean'] * 1000:.0f} ms |"
    )
    lines.append(
        f"| Median / article | {latency['student']['median_single'] * 1000:.0f} ms "
        f"| {latency['pipeline_median'] * 1000:.0f} ms |"
    )
    lines.append(
        f"| Batched (16 at a time) | "
        f"{latency['student']['batched_per_article'] * 1000:.0f} ms/article | n/a |"
    )
    lines.append("| Marginal cost | $0 | see below |")
    lines.append("")
    lines.append(
        f"Measured on {latency['student']['n']} articles, {latency['device']}, "
        "one article per call to match how the service invokes it."
    )
    lines.append("")
    lines.append("### Token accounting")
    lines.append("")
    lines.append("| | Tokens |")
    lines.append("|---|---|")
    lines.append(f"| Prompt template | {cost['prompt_template_tokens']:,} |")
    lines.append(f"| Mean article | {cost['mean_article_tokens']:.0f} |")
    lines.append(
        f"| **Mean input / article** | **{cost['mean_input_tokens_per_article']:.0f}** |"
    )
    lines.append("")
    lines.append(
        f"**{_pct(cost['template_share'])} of every API call is the prompt template**, "
        "not the article. `SENTIMENT_ANALYSIS_PROMPT` is a long instruction block and "
        "the Yahoo summaries are ~150 characters, so the platform is paying mostly to "
        "re-send the same instructions thousands of times. Prompt caching or a shorter "
        "template is the cheapest available cost win, independent of the student."
    )
    lines.append("")
    if cost.get("usd_per_1k_articles") is not None:
        lines.append(
            f"At ${cost['input_price_per_million']}/1M input tokens that is "
            f"**${cost['usd_per_1k_articles']:.3f} per 1,000 articles** "
            "(input only; output tokens extra)."
        )
    else:
        lines.append(
            "No dollar figure is shown because no price was supplied. Pass "
            "`--input-price-per-million <rate>` with the current published rate for "
            "your model to have it computed — a hardcoded rate would go stale."
        )
    lines.append("")
    lines.append(f"*{cost['tokenizer_note']}*")
    lines.append("")

    lines.append("## Caveats")
    lines.append("")
    for caveat in report["caveats"]:
        lines.append(f"- {caveat}")
    lines.append("")

    lines.append("## Reproducing")
    lines.append("")
    lines.append("```bash")
    lines.append("cd services/sentiment-service")
    lines.append("python -m eval.evaluate            # pipeline vs human")
    lines.append("python -m training.evaluate_distill  # student vs both")
    lines.append("```")
    lines.append("")

    return "\n".join(lines)


def print_summary(report: dict[str, Any]) -> None:
    """Print the headline comparison to stdout."""
    student = report["student_vs_human"]
    pipeline = report["pipeline_vs_human"]
    teacher = report["student_vs_teacher"]
    latency = report["latency"]

    print()
    print(f"Eval-set isolation : {'clean' if report['leakage_check']['clean'] else 'LEAKED'}")
    print()
    base = report["base_checkpoint_control"]

    print(f"{'':<22}{'student':>12}{'pipeline':>12}{'base (untrained)':>20}")
    print("-" * 66)
    print(
        f"{'bucket accuracy':<22}{_pct(student['bucket_accuracy']):>12}"
        f"{_pct(pipeline['bucket_accuracy']):>12}"
        f"{_pct(base['bucket_accuracy']):>20}"
    )
    print(
        f"{'emotion accuracy':<22}{_pct(student['emotion_accuracy']):>12}"
        f"{_pct(pipeline['emotion_accuracy']):>12}{'n/a':>20}"
    )
    print(
        f"{'latency/article':<22}"
        f"{latency['student']['mean_single'] * 1000:>11.0f}ms"
        f"{latency['pipeline_mean'] * 1000:>11.0f}ms"
    )
    print()
    print(
        f"student vs teacher : spearman {teacher['spearman']:.3f}, "
        f"MAE {teacher['mae']:.3f}"
    )

    delta = student["bucket_accuracy"] - base["bucket_accuracy"]
    if delta < -0.02:
        print(
            f"\n  !! The LoRA pass COST {abs(delta) * 100:.1f} points vs the "
            "untrained base checkpoint."
        )
        print("     Training on keyword-mock labels degraded a working model.")
    print()


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Evaluate the distilled student against teacher and human labels."
    )
    parser.add_argument("--artifacts-dir", default=DEFAULT_ARTIFACTS_DIR)
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    parser.add_argument("--labeled-set", default=DEFAULT_LABELED_SET)
    parser.add_argument("--pipeline-report", default=DEFAULT_PIPELINE_REPORT)
    parser.add_argument("--report-md", default=DEFAULT_REPORT_MD)
    parser.add_argument("--report-json", default=DEFAULT_REPORT_JSON)
    parser.add_argument(
        "--input-price-per-million",
        type=float,
        default=None,
        help="Current API price per 1M input tokens, for the $/1k articles figure",
    )
    parser.add_argument("--device", default=None)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
    )

    device = torch.device(
        args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    )

    labeled_rows = [
        row
        for row in load_jsonl(args.labeled_set)
        if row.get("label_sentiment_bucket")
    ]
    if not labeled_rows:
        raise SystemExit(f"{args.labeled_set} has no labelled rows.")

    leakage = check_leakage(labeled_rows, args.data_dir)
    if not leakage["clean"]:
        raise SystemExit(
            f"\n{leakage['overlap_train'] + leakage['overlap_val']} labelled "
            "articles are present in the student's training data.\n"
            "Re-run `python -m eval.export_training_data` and retrain before "
            f"evaluating.\nExamples: {leakage['examples']}\n"
        )
    logger.info("Eval-set isolation verified: no overlap with train/val")

    model, tokenizer, run_metadata = load_student(args.artifacts_dir, device)
    emotions = run_metadata["emotions"]

    val_rows = load_jsonl(os.path.join(args.data_dir, "val.jsonl"))
    teacher_metrics = evaluate_vs_teacher(
        model, tokenizer, val_rows, device, emotions
    )
    logger.info(
        "Student vs teacher: spearman %.3f, MAE %.3f",
        teacher_metrics["spearman"],
        teacher_metrics["mae"],
    )

    student_metrics, student_predictions = evaluate_vs_human(
        model, tokenizer, labeled_rows, device, emotions
    )
    logger.info(
        "Student vs human: bucket %.1f%%", student_metrics["bucket_accuracy"] * 100
    )

    with open(args.pipeline_report, encoding="utf-8") as fh:
        pipeline_report = json.load(fh)

    paired = paired_comparison(student_predictions, pipeline_report["predictions"])

    base_metrics = evaluate_base_checkpoint(
        run_metadata["config"]["base_model"], labeled_rows, device
    )
    logger.info(
        "Untrained base checkpoint: bucket %.1f%%",
        base_metrics["bucket_accuracy"] * 100,
    )

    texts = [f"{r['title']}\n\n{r['content']}" for r in labeled_rows]
    student_latency = measure_latency(
        model, tokenizer, texts, device, emotions
    )
    logger.info(
        "Student latency: %.0f ms/article", student_latency["mean_single"] * 1000
    )

    cost = estimate_cost(tokenizer, labeled_rows, args.input_price_per_million)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "student": {
            "base_model": run_metadata["config"]["base_model"],
            "adapter": run_metadata["artifacts"]["lora_adapter"],
            "trained_epoch": run_metadata["best_epoch"],
            "trainable_percent": run_metadata["parameters"]["trainable_percent"],
        },
        "provenance": {
            "teacher": teacher_metrics["teacher"],
            "pipeline_backend": pipeline_report["run"]["effective_backend"],
            "pipeline_n_gemini": pipeline_report["run"]["n_gemini"],
            "pipeline_n_total": pipeline_report["n_articles"],
            "gemini_status": pipeline_report["gemini_probe"].get("reason"),
        },
        "leakage_check": leakage,
        "student_vs_teacher": teacher_metrics,
        "student_vs_human": student_metrics,
        "pipeline_vs_human": {
            "n": pipeline_report["n_articles"],
            "bucket_accuracy": pipeline_report["bucket_accuracy"],
            "emotion_accuracy": pipeline_report["emotion_accuracy"],
            "backend": pipeline_report["run"]["effective_backend"],
        },
        "paired": paired,
        "base_checkpoint_control": base_metrics,
        "latency": {
            "student": student_latency,
            "pipeline_mean": pipeline_report["latency_seconds"]["mean"],
            "pipeline_median": pipeline_report["latency_seconds"]["median"],
            "device": str(device),
        },
        "cost": cost,
        "caveats": [
            "The 50 human labels are LLM-drafted pending review "
            "(`label_source: llm_draft`), so these are agreement rates against a "
            "draft reference, not verified ground truth.",
            "50 articles is a small eval set: a single flipped article moves bucket "
            "accuracy by 2 points, so differences under ~5 points are noise.",
            "The pipeline latency includes a failed Gemini round-trip before falling "
            "back, so it measures the current broken path, not a healthy API call.",
            "Student latency is measured on CPU with no ONNX export or quantisation "
            "— it is a floor, not an optimised number.",
            "Article bodies are Yahoo Finance summaries (~150 characters), not full "
            "text.",
        ],
        "student_predictions": student_predictions,
    }

    with open(args.report_json, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    with open(args.report_md, "w", encoding="utf-8") as fh:
        fh.write(render_markdown(report))

    logger.info("Wrote %s and %s", args.report_json, args.report_md)
    print_summary(report)


if __name__ == "__main__":
    main()

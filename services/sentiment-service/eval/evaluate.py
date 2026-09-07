"""
Ground-truth evaluation for the sentiment pipeline.

Runs the real ``SentimentService._analyze_sentiment()`` path over the
hand-labelled set in ``labeled_set.jsonl``, buckets the continuous score the
same way a human labeller did, and reports how often the two agree.

What it measures:
  - Sentiment-bucket accuracy (bullish / neutral / bearish) + confusion matrix.
  - Emotion-label accuracy + confusion matrix.
  - Per-bucket precision/recall, so a model that just guesses "neutral" is
    visibly bad rather than hidden behind a decent headline number.
  - Mean latency per article, for the cost/latency comparison in workstream 3.
  - The worst disagreements, written out in full for failure analysis.

It also records *which backend actually answered*. ``_analyze_sentiment``
silently falls back to the keyword mock whenever the Gemini call raises -- a
bad API key looks exactly like a working pipeline from the outside. This script
counts fallbacks explicitly so a report can never accidentally credit Gemini
for numbers the mock produced.

Usage:
    cd services/sentiment-service
    python -m eval.evaluate
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import re
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

EVAL_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LABELED_SET = os.path.join(EVAL_DIR, "labeled_set.jsonl")
DEFAULT_REPORT_MD = os.path.join(EVAL_DIR, "report.md")
DEFAULT_REPORT_JSON = os.path.join(EVAL_DIR, "report.json")

BUCKETS = ["bullish", "neutral", "bearish"]
EMOTIONS = ["Optimism", "Greed", "Excitement", "Fear", "Anger", "Pessimism"]

# Same thresholds the labelling instructions used.
BULLISH_THRESHOLD = 0.2
BEARISH_THRESHOLD = -0.2

BUCKET_RANK = {"bearish": -1, "neutral": 0, "bullish": 1}


def bucket_score(score: float) -> str:
    """Bucket a continuous -1..+1 sentiment score into the label taxonomy."""
    if score > BULLISH_THRESHOLD:
        return "bullish"
    if score < BEARISH_THRESHOLD:
        return "bearish"
    return "neutral"


def load_labeled_set(path: str) -> list[dict[str, Any]]:
    """Load the labelled worksheet, keeping only rows that actually have a label."""
    if not os.path.exists(path):
        raise SystemExit(
            f"No labelled set at {path}. Run `python -m eval.build_labeled_set` first."
        )

    rows: list[dict[str, Any]] = []
    skipped = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if not row.get("label_sentiment_bucket"):
                skipped += 1
                continue
            rows.append(row)

    if skipped:
        logger.warning("Skipped %d unlabelled rows in %s", skipped, path)
    if not rows:
        raise SystemExit(f"{path} has no labelled rows yet.")

    logger.info("Loaded %d labelled articles", len(rows))
    return rows


def redact_keys(text: str) -> str:
    """
    Strip anything that looks like a Google API key out of error text.

    Google echoes the offending key back in its 403 body, and this report is
    committed to the repo -- so the key must not travel with it.
    """
    return re.sub(r"AIza[0-9A-Za-z_\-]{10,}", "AIza***REDACTED***", text)


def probe_gemini(api_key: str, model: str) -> dict[str, Any]:
    """
    Check whether the configured Gemini key can actually serve requests.

    Done before the run so the report can state plainly which backend produced
    the numbers, instead of inferring it from a silent fallback.
    """
    if not api_key:
        return {"reachable": False, "reason": "no api key configured"}

    try:
        import requests

        response = requests.get(
            f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
            timeout=20,
        )
    except Exception as exc:  # noqa: BLE001 - report any failure, do not crash the run
        return {
            "reachable": False,
            "reason": redact_keys(f"{type(exc).__name__}: {exc}"),
        }

    if response.status_code != 200:
        detail = ""
        try:
            detail = response.json().get("error", {}).get("message", "")
        except Exception:  # noqa: BLE001
            detail = response.text[:200]
        return {
            "reachable": False,
            "status_code": response.status_code,
            "reason": redact_keys(detail),
        }

    names = [
        m["name"]
        for m in response.json().get("models", [])
        if "generateContent" in m.get("supportedGenerationMethods", [])
    ]
    return {
        "reachable": True,
        "status_code": 200,
        "n_models": len(names),
        "configured_model_available": any(model in name for name in names),
    }


async def run_pipeline(
    rows: list[dict[str, Any]], seed: int = 20260218
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Score every labelled article through the live sentiment pipeline.

    Wraps the mock path with a counter first, so the caller can tell how many
    articles Gemini actually answered.
    """
    from app.config import settings
    from app.models.schemas import NewsInput
    from app.services.sentiment_service import SentimentService

    # The mock path draws from `random`; seed it so a mock-backed run is
    # reproducible instead of a different number every time.
    random.seed(seed)

    service = SentimentService.__new__(SentimentService)
    service.repository = None  # never touched: we only call _analyze_sentiment
    service._gemini_model = None

    fallback_counter = {"count": 0}
    original_mock = service._mock_sentiment_analysis

    async def counting_mock(news_input):
        fallback_counter["count"] += 1
        return await original_mock(news_input)

    service._mock_sentiment_analysis = counting_mock

    predictions: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        published = row.get("published_at")
        try:
            published_dt = datetime.fromisoformat(str(published))
        except ValueError:
            published_dt = datetime.now(timezone.utc)

        news_input = NewsInput(
            title=row["title"][:500],
            content=row["content"],
            link=row["link"],
            published_date=published_dt,
            symbol_hint=row.get("symbol_hint"),
        )

        before = fallback_counter["count"]
        started = time.perf_counter()
        result = await service._analyze_sentiment(news_input)
        elapsed = time.perf_counter() - started
        used_mock = fallback_counter["count"] > before

        predictions.append(
            {
                "link": row["link"],
                "title": row["title"],
                "content": row["content"],
                "symbol_hint": row.get("symbol_hint"),
                "label_bucket": row["label_sentiment_bucket"],
                "label_emotion": row.get("label_emotion"),
                "label_note": row.get("label_note"),
                "pred_symbol": result.symbol,
                "pred_score": float(result.sentiment),
                "pred_bucket": bucket_score(float(result.sentiment)),
                "pred_emotion": result.emotion.value,
                "pred_reason": result.reason,
                "latency_seconds": elapsed,
                "backend": "mock" if used_mock else "gemini",
            }
        )

        if index % 10 == 0:
            logger.info("Scored %d/%d articles", index, len(rows))

    backend_counts = Counter(p["backend"] for p in predictions)
    run_meta = {
        "configured_model": settings.gemini_model,
        "use_mock_llm_setting": settings.use_mock_llm,
        "n_gemini": backend_counts.get("gemini", 0),
        "n_mock_fallback": backend_counts.get("mock", 0),
        "effective_backend": (
            "gemini"
            if backend_counts.get("mock", 0) == 0
            else ("mock" if backend_counts.get("gemini", 0) == 0 else "mixed")
        ),
        "seed": seed,
    }
    return predictions, run_meta


def confusion_matrix(
    predictions: list[dict[str, Any]], label_key: str, pred_key: str, classes: list[str]
) -> dict[str, dict[str, int]]:
    """Build a {true_class: {pred_class: count}} matrix over the given classes."""
    matrix: dict[str, dict[str, int]] = {
        true: dict.fromkeys(classes, 0) for true in classes
    }
    for row in predictions:
        true = row.get(label_key)
        pred = row.get(pred_key)
        if true in matrix and pred in matrix[true]:
            matrix[true][pred] += 1
    return matrix


def per_class_scores(
    matrix: dict[str, dict[str, int]], classes: list[str]
) -> dict[str, dict[str, float]]:
    """Precision, recall and F1 per class, computed from the confusion matrix."""
    scores: dict[str, dict[str, float]] = {}
    for cls in classes:
        tp = matrix[cls][cls]
        predicted = sum(matrix[other][cls] for other in classes)
        actual = sum(matrix[cls].values())

        precision = tp / predicted if predicted else 0.0
        recall = tp / actual if actual else 0.0
        f1 = (
            2 * precision * recall / (precision + recall)
            if (precision + recall)
            else 0.0
        )
        scores[cls] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": actual,
        }
    return scores


def accuracy(predictions: list[dict[str, Any]], label_key: str, pred_key: str) -> float:
    """Share of rows where prediction equals label."""
    if not predictions:
        return 0.0
    hits = sum(1 for row in predictions if row.get(label_key) == row.get(pred_key))
    return hits / len(predictions)


def worst_disagreements(
    predictions: list[dict[str, Any]], top_n: int = 5
) -> list[dict[str, Any]]:
    """
    Pick the most instructive failures.

    Ranked by how far apart the buckets are (bearish->bullish is worse than
    neutral->bullish), then by how confident the model was while being wrong.
    """
    scored = []
    for row in predictions:
        distance = abs(
            BUCKET_RANK.get(row["label_bucket"], 0) - BUCKET_RANK.get(row["pred_bucket"], 0)
        )
        if distance == 0:
            continue
        scored.append((distance, abs(row["pred_score"]), row))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [row for _, _, row in scored[:top_n]]


def build_report(
    predictions: list[dict[str, Any]],
    run_meta: dict[str, Any],
    gemini_probe: dict[str, Any],
    labeled_set_path: str,
) -> dict[str, Any]:
    """Assemble every number the report needs into one serialisable dict."""
    bucket_matrix = confusion_matrix(
        predictions, "label_bucket", "pred_bucket", BUCKETS
    )
    emotion_matrix = confusion_matrix(
        predictions, "label_emotion", "pred_emotion", EMOTIONS
    )

    latencies = sorted(row["latency_seconds"] for row in predictions)
    mid = len(latencies) // 2

    label_sources = Counter(
        row.get("label_source", "unknown") for row in predictions
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "labeled_set": os.path.basename(labeled_set_path),
        "n_articles": len(predictions),
        "run": run_meta,
        "gemini_probe": gemini_probe,
        "label_sources": dict(label_sources),
        "bucket_accuracy": accuracy(predictions, "label_bucket", "pred_bucket"),
        "emotion_accuracy": accuracy(predictions, "label_emotion", "pred_emotion"),
        "bucket_confusion_matrix": bucket_matrix,
        "emotion_confusion_matrix": emotion_matrix,
        "bucket_scores": per_class_scores(bucket_matrix, BUCKETS),
        "label_distribution": dict(
            Counter(row["label_bucket"] for row in predictions)
        ),
        "prediction_distribution": dict(
            Counter(row["pred_bucket"] for row in predictions)
        ),
        "majority_class_baseline": (
            max(Counter(row["label_bucket"] for row in predictions).values())
            / len(predictions)
        ),
        "latency_seconds": {
            "mean": sum(latencies) / len(latencies),
            "median": latencies[mid],
            "p95": latencies[min(int(len(latencies) * 0.95), len(latencies) - 1)],
        },
        "worst_disagreements": worst_disagreements(predictions),
        "predictions": predictions,
    }


def _pct(value: float) -> str:
    """Format a 0-1 ratio as a percentage."""
    return f"{value * 100:.1f}%"


def render_markdown(report: dict[str, Any]) -> str:
    """Render the report dict as report.md."""
    run = report["run"]
    probe = report["gemini_probe"]

    lines: list[str] = []
    lines.append("# Sentiment Pipeline — Ground-Truth Evaluation")
    lines.append("")
    lines.append(
        f"> Generated by `python -m eval.evaluate` on {report['generated_at']} "
        f"over {report['n_articles']} labelled articles."
    )
    lines.append("")

    # --- Backend banner: the single most important caveat on these numbers ---
    lines.append("## Which backend produced these numbers")
    lines.append("")
    if run["effective_backend"] == "gemini":
        lines.append(
            f"All {run['n_gemini']} articles were scored by the real Gemini API "
            f"(`{run['configured_model']}`). The accuracy below is Gemini's."
        )
    elif run["effective_backend"] == "mock":
        lines.append(
            f"**None of these numbers are Gemini's.** All {run['n_mock_fallback']} "
            "articles were scored by the keyword fallback in "
            "`SentimentService._mock_sentiment_analysis`."
        )
        lines.append("")
        lines.append(
            f"- Configured model: `{run['configured_model']}`, "
            f"`USE_MOCK_LLM={run['use_mock_llm_setting']}`"
        )
        if not probe.get("reachable"):
            lines.append(
                f"- Gemini preflight failed: **{probe.get('reason', 'unknown')}**"
                + (
                    f" (HTTP {probe['status_code']})"
                    if probe.get("status_code")
                    else ""
                )
            )
        lines.append(
            "- `_gemini_sentiment_analysis` catches every exception and returns the "
            "mock result, so the service keeps answering `200 OK` with keyword "
            "scores. Nothing downstream can tell the difference."
        )
        lines.append("")
        lines.append(
            "**Read the table below as a measurement of the fallback that is "
            "actually running in production, not of the LLM the pipeline claims to "
            "use.** Re-run this script with a working `GEMINI_API_KEY` to get "
            "Gemini's real number."
        )
    else:
        lines.append(
            f"Mixed run: {run['n_gemini']} articles scored by Gemini, "
            f"{run['n_mock_fallback']} by the keyword fallback. Treat the aggregate "
            "numbers with care."
        )
    lines.append("")

    lines.append("## Headline numbers")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append(f"| Sentiment-bucket accuracy | **{_pct(report['bucket_accuracy'])}** |")
    lines.append(
        f"| Majority-class baseline | {_pct(report['majority_class_baseline'])} |"
    )
    lines.append(f"| Emotion accuracy | **{_pct(report['emotion_accuracy'])}** |")
    lines.append("| Random-guess baseline (3 buckets) | 33.3% |")
    lines.append("| Random-guess baseline (6 emotions) | 16.7% |")
    lines.append(
        f"| Mean latency / article | {report['latency_seconds']['mean'] * 1000:.1f} ms |"
    )
    lines.append(
        f"| Median latency / article | "
        f"{report['latency_seconds']['median'] * 1000:.1f} ms |"
    )
    lines.append("")

    lines.append("## Sentiment-bucket confusion matrix")
    lines.append("")
    lines.append("Rows are the human label, columns are what the pipeline said.")
    lines.append("")
    lines.append("| actual \\ predicted | " + " | ".join(BUCKETS) + " |")
    lines.append("|---" * (len(BUCKETS) + 1) + "|")
    for true in BUCKETS:
        cells = " | ".join(str(report["bucket_confusion_matrix"][true][p]) for p in BUCKETS)
        lines.append(f"| **{true}** | {cells} |")
    lines.append("")

    lines.append("### Per-bucket precision / recall")
    lines.append("")
    lines.append("| Bucket | Precision | Recall | F1 | Support |")
    lines.append("|---|---|---|---|---|")
    for bucket in BUCKETS:
        s = report["bucket_scores"][bucket]
        lines.append(
            f"| {bucket} | {_pct(s['precision'])} | {_pct(s['recall'])} "
            f"| {s['f1']:.2f} | {int(s['support'])} |"
        )
    lines.append("")

    lines.append("## Emotion confusion matrix")
    lines.append("")
    lines.append("| actual \\ predicted | " + " | ".join(EMOTIONS) + " |")
    lines.append("|---" * (len(EMOTIONS) + 1) + "|")
    for true in EMOTIONS:
        cells = " | ".join(
            str(report["emotion_confusion_matrix"][true][p]) for p in EMOTIONS
        )
        lines.append(f"| **{true}** | {cells} |")
    lines.append("")

    lines.append("## Worst disagreements")
    lines.append("")
    if not report["worst_disagreements"]:
        lines.append("No bucket disagreements — every article matched its label.")
    for i, row in enumerate(report["worst_disagreements"], start=1):
        lines.append(
            f"### {i}. {row['label_bucket']} → predicted {row['pred_bucket']} "
            f"(score {row['pred_score']:+.3f})"
        )
        lines.append("")
        lines.append(f"**{row['title']}**")
        lines.append("")
        lines.append(f"> {row['content'][:400]}")
        lines.append("")
        if row.get("label_note"):
            lines.append(f"- *Why it was labelled `{row['label_bucket']}`:* {row['label_note']}")
        lines.append(
            f"- *Pipeline said:* `{row['pred_bucket']}` / `{row['pred_emotion']}` "
            f"via `{row['backend']}`"
        )
        lines.append("")

    lines.append("## How to read this")
    lines.append("")
    lines.append(
        "- The eval set is stratified by keyword prior and symbol, not sampled by "
        "recency, so it deliberately includes ambiguous headlines. A number here "
        "will be lower than one measured on cherry-picked obvious cases."
    )
    lines.append(
        "- Bucket thresholds are `> +0.2` bullish, `< -0.2` bearish, neutral "
        "otherwise — the same rule the labels were written against."
    )
    lines.append(
        "- The majority-class baseline is the accuracy of always predicting the "
        "most common label. Beating 33% is not impressive; beating the "
        "majority-class row is the real floor."
    )
    sources = report["label_sources"]
    if sources.get("llm_draft"):
        lines.append(
            f"- **{sources['llm_draft']} of {report['n_articles']} labels are "
            "LLM-drafted, not human.** They were written by reading each headline "
            "and are a reasonable starting point, but until a human reviews them "
            "this is model-vs-model agreement, not ground truth. Flip "
            "`label_source` to `human` in `labeled_set.jsonl` as you confirm each "
            "row, then re-run."
        )
    lines.append(
        "- Article bodies here are Yahoo Finance summaries (~150 characters), not "
        "full text. Accuracy on full articles may differ."
    )
    lines.append("")

    lines.append("## Reproducing")
    lines.append("")
    lines.append("```bash")
    lines.append("cd services/sentiment-service")
    lines.append("python -m eval.build_labeled_set --size 50   # sample the worksheet")
    lines.append("# ... fill in labels ...")
    lines.append("python -m eval.evaluate                      # score the pipeline")
    lines.append("```")
    lines.append("")

    return "\n".join(lines)


def print_summary(report: dict[str, Any]) -> None:
    """Print the headline result to stdout."""
    run = report["run"]
    print()
    print(f"Articles evaluated : {report['n_articles']}")
    print(
        f"Backend            : {run['effective_backend']} "
        f"(gemini={run['n_gemini']}, mock_fallback={run['n_mock_fallback']})"
    )
    print(
        f"Bucket accuracy    : {_pct(report['bucket_accuracy'])} "
        f"(majority-class baseline {_pct(report['majority_class_baseline'])})"
    )
    print(f"Emotion accuracy   : {_pct(report['emotion_accuracy'])}")
    print(
        f"Mean latency       : {report['latency_seconds']['mean'] * 1000:.1f} ms/article"
    )
    print()


async def async_main(args: argparse.Namespace) -> None:
    """Load, score, report."""
    from app.config import settings

    rows = load_labeled_set(args.labeled_set)

    probe = probe_gemini(settings.gemini_api_key, settings.gemini_model)
    if probe.get("reachable"):
        logger.info("Gemini preflight OK (%d models available)", probe["n_models"])
    else:
        logger.warning("Gemini preflight FAILED: %s", probe.get("reason"))

    predictions, run_meta = await run_pipeline(rows, seed=args.seed)

    # Carry label provenance through so the report can flag draft labels.
    by_link = {row["link"]: row for row in rows}
    for pred in predictions:
        pred["label_source"] = by_link[pred["link"]].get("label_source", "unknown")

    report = build_report(predictions, run_meta, probe, args.labeled_set)

    with open(args.report_json, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    with open(args.report_md, "w", encoding="utf-8") as fh:
        fh.write(render_markdown(report))

    logger.info("Wrote %s and %s", args.report_json, args.report_md)
    print_summary(report)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Evaluate the sentiment pipeline against hand-labelled articles."
    )
    parser.add_argument("--labeled-set", default=DEFAULT_LABELED_SET)
    parser.add_argument("--report-md", default=DEFAULT_REPORT_MD)
    parser.add_argument("--report-json", default=DEFAULT_REPORT_JSON)
    parser.add_argument(
        "--seed",
        type=int,
        default=20260218,
        help="Seed for the keyword fallback's RNG, so mock-backed runs reproduce",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
    )
    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()

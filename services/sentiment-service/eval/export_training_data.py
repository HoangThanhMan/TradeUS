"""
Export the ``sentiments`` collection as a training set for the student model.

Pulls every stored analysis out of MongoDB, drops anything that appears in the
workstream-2 eval set, de-duplicates, splits chronologically, and writes
``(text, sentiment_score, emotion)`` triples as JSONL.

Two things this script is careful about:

1. **Eval-set isolation.** Every article whose link appears in
   ``labeled_set.jsonl`` is excluded, so the hand-labelled set stays clean for
   the student-vs-human comparison in workstream 3.

2. **Teacher provenance.** ``SentimentService`` falls back to a keyword mock
   whenever the Gemini call fails, and it stores those mock results in the same
   collection with no marker. Training on them would produce a student that has
   distilled a regex, not an LLM. This script reconstructs the mock's own reason
   templates and labels every row ``gemini`` or ``mock`` accordingly, then
   refuses to write a mock-dominated export unless explicitly forced.

Usage:
    cd services/sentiment-service
    python -m eval.export_training_data
    python -m eval.export_training_data --allow-mock-labels   # pipeline testing
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from collections import Counter
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

EVAL_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_DIR = os.path.dirname(EVAL_DIR)
DEFAULT_LABELED_SET = os.path.join(EVAL_DIR, "labeled_set.jsonl")
DEFAULT_OUTPUT_DIR = os.path.join(SERVICE_DIR, "training", "data")

EMOTIONS = ["Optimism", "Greed", "Excitement", "Fear", "Anger", "Pessimism"]


def display_path(path: str, base: str) -> str:
    """
    Render ``path`` relative to ``base`` for reports, tolerating other drives.

    ``os.path.relpath`` raises on Windows when the two paths sit on different
    mounts, which would otherwise throw away a finished training run at the
    final metadata-writing step just because ``--output-dir`` pointed at
    another drive.
    """
    try:
        return os.path.relpath(path, base).replace("\\", "/")
    except ValueError:
        return path.replace("\\", "/")


def load_eval_links(path: str) -> set[str]:
    """Read the links held out for the workstream-2 evaluation."""
    if not os.path.exists(path):
        logger.warning(
            "No eval set at %s — nothing will be held out. Run "
            "`python -m eval.build_labeled_set` first if that is not intended.",
            path,
        )
        return set()

    links: set[str] = set()
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                links.add(json.loads(line)["link"])

    logger.info("Holding out %d eval articles", len(links))
    return links


def build_mock_reason_index(symbols: Iterable[str], tries: int = 60) -> set[str]:
    """
    Reconstruct every reason string the keyword mock can emit.

    ``_generate_mock_reason`` picks randomly between a handful of per-emotion
    templates and interpolates the symbol, so the only reliable way to recognise
    its output is to ask it for all of them. Calling it repeatedly per
    (emotion, symbol) pair enumerates the set exhaustively in practice.
    """
    from app.models.schemas import EmotionType
    from app.services.sentiment_service import SentimentService

    service = SentimentService.__new__(SentimentService)

    variants: set[str] = set()
    for symbol in symbols:
        for emotion in EmotionType:
            for _ in range(tries):
                variants.add(service._generate_mock_reason(0.0, emotion, symbol))

    logger.info("Indexed %d distinct mock reason strings", len(variants))
    return variants


def load_sentiments(
    mongo_url: str, databases: Iterable[str], collection: str = "sentiments"
) -> tuple[list[dict[str, Any]], int]:
    """
    Read every stored sentiment analysis, de-duplicated by article link and title.

    Returns the rows plus the number of documents dropped as duplicates -- the
    two databases overlap, and the collectors re-ingest the same headline under
    different links often enough to be worth reporting.
    """
    from pymongo import MongoClient

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)

    seen_links: set[str] = set()
    seen_titles: set[str] = set()
    rows: list[dict[str, Any]] = []
    duplicates = 0

    for db_name in databases:
        for doc in client[db_name][collection].find({}):
            link = doc.get("link")
            title = (doc.get("title") or "").strip()
            content = (doc.get("content") or "").strip()

            if not link or not title:
                continue
            if link in seen_links or title.lower() in seen_titles:
                duplicates += 1
                continue
            if doc.get("sentiment") is None or not doc.get("emotion"):
                continue

            seen_links.add(link)
            seen_titles.add(title.lower())

            created = doc.get("created_at") or doc.get("published")
            rows.append(
                {
                    "id": str(doc["_id"]),
                    "source_db": db_name,
                    "title": title,
                    "content": content,
                    "link": link,
                    "symbol": doc.get("symbol", "BTCUSDT"),
                    "sentiment_score": float(doc["sentiment"]),
                    "emotion": doc["emotion"],
                    "reason": doc.get("reason") or "",
                    "created_at": (
                        created.isoformat()
                        if isinstance(created, datetime)
                        else str(created)
                    ),
                }
            )

    rows.sort(key=lambda r: r["created_at"])
    logger.info(
        "Loaded %d unique analyses from %s (%d duplicates dropped)",
        len(rows),
        ", ".join(databases),
        duplicates,
    )
    return rows, duplicates


def tag_provenance(
    rows: list[dict[str, Any]], mock_reasons: set[str]
) -> dict[str, int]:
    """Mark each row as produced by ``gemini`` or by the keyword ``mock``."""
    counts: Counter[str] = Counter()
    for row in rows:
        teacher = "mock" if row["reason"].strip() in mock_reasons else "gemini"
        row["teacher"] = teacher
        counts[teacher] += 1
    return dict(counts)


def to_training_row(row: dict[str, Any]) -> dict[str, Any]:
    """Reduce a stored analysis to the fields the student model trains on."""
    text = row["title"]
    if row["content"] and row["content"] != row["title"]:
        text = f"{row['title']}\n\n{row['content']}"

    return {
        "text": text,
        "sentiment_score": row["sentiment_score"],
        "emotion": row["emotion"],
        "symbol": row["symbol"],
        "link": row["link"],
        "created_at": row["created_at"],
        "teacher": row["teacher"],
    }


def chronological_split(
    rows: list[dict[str, Any]], val_fraction: float
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Split oldest-first so validation is strictly newer than training.

    A random split would put near-duplicate headlines from the same news cycle
    on both sides and make the student look better than it is.
    """
    rows = sorted(rows, key=lambda r: r["created_at"])
    split_at = int(len(rows) * (1 - val_fraction))
    return rows[:split_at], rows[split_at:]


def write_jsonl(rows: list[dict[str, Any]], path: str) -> None:
    """Write rows as one JSON object per line."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    logger.info("Wrote %d rows -> %s", len(rows), path)


def summarise(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute the distribution stats that go in the export report."""
    if not rows:
        return {"n": 0}

    scores = sorted(r["sentiment_score"] for r in rows)
    return {
        "n": len(rows),
        "emotions": dict(Counter(r["emotion"] for r in rows)),
        "symbols": dict(Counter(r["symbol"] for r in rows).most_common()),
        "teachers": dict(Counter(r["teacher"] for r in rows)),
        "sentiment_score": {
            "min": scores[0],
            "median": scores[len(scores) // 2],
            "max": scores[-1],
            "mean": sum(scores) / len(scores),
        },
        "date_range": [rows[0]["created_at"], rows[-1]["created_at"]],
    }


def render_report(report: dict[str, Any]) -> str:
    """Render the export summary as markdown."""
    lines: list[str] = []
    lines.append("# Distillation Training Set — Export Report")
    lines.append("")
    lines.append(
        f"> Generated by `python -m eval.export_training_data` on "
        f"{report['generated_at']}."
    )
    lines.append("")

    prov = report["provenance"]
    mock_n = prov.get("mock", 0)
    gemini_n = prov.get("gemini", 0)
    total = mock_n + gemini_n

    lines.append("## Label provenance")
    lines.append("")
    lines.append("| Teacher | Rows | Share |")
    lines.append("|---|---|---|")
    for teacher in ("gemini", "mock"):
        count = prov.get(teacher, 0)
        share = f"{count / total * 100:.1f}%" if total else "—"
        lines.append(f"| {teacher} | {count} | {share} |")
    lines.append("")

    if mock_n and not gemini_n:
        lines.append(
            "**Every row in this export was produced by the keyword fallback, not "
            "by Gemini.** `SentimentService._gemini_sentiment_analysis` catches all "
            "exceptions and returns `_mock_sentiment_analysis`, writing the result "
            "into `sentiments` with no marker — so a dead API key fills the "
            "collection with keyword scores that look identical to real ones."
        )
        lines.append("")
        lines.append(
            "A student trained on this data learns the keyword heuristic, not the "
            "teacher. The export is still useful for validating the training "
            "pipeline end to end, but the resulting adapter is **not** a "
            "distilled LLM and must not be described as one."
        )
        lines.append("")
        lines.append("To get a real training set:")
        lines.append("")
        lines.append("1. Put a working key in `GEMINI_API_KEY`.")
        lines.append(
            "2. Re-analyse the backlog (`POST /sentiments/analyze` per article, or "
            "let the scheduler refill the collection)."
        )
        lines.append("3. Re-run this export and confirm the `gemini` share is ~100%.")
        lines.append("")
    elif mock_n:
        lines.append(
            f"**{mock_n} of {total} rows came from the keyword fallback**, not "
            "Gemini. Consider re-analysing those articles with a working key "
            "before training, or filter them with `--teacher gemini`."
        )
        lines.append("")

    lines.append("## Splits")
    lines.append("")
    lines.append("| Split | Rows | Date range |")
    lines.append("|---|---|---|")
    for name in ("train", "val"):
        stats = report["splits"][name]
        if stats["n"]:
            lines.append(
                f"| {name} | {stats['n']} | {stats['date_range'][0][:10]} → "
                f"{stats['date_range'][1][:10]} |"
            )
        else:
            lines.append(f"| {name} | 0 | — |")
    lines.append("")
    lines.append(
        "Split is chronological (oldest rows train, newest validate) so "
        "near-duplicate headlines from one news cycle cannot straddle the split."
    )
    lines.append("")

    lines.append("## Distribution (train split)")
    lines.append("")
    train = report["splits"]["train"]
    if train["n"]:
        lines.append("| Emotion | Rows |")
        lines.append("|---|---|")
        for emotion in EMOTIONS:
            lines.append(f"| {emotion} | {train['emotions'].get(emotion, 0)} |")
        lines.append("")
        score = train["sentiment_score"]
        lines.append(
            f"Sentiment score: min `{score['min']:.3f}`, median "
            f"`{score['median']:.3f}`, max `{score['max']:.3f}`, mean "
            f"`{score['mean']:.3f}`"
        )
        lines.append("")
        lines.append("| Symbol | Rows |")
        lines.append("|---|---|")
        for symbol, count in train["symbols"].items():
            lines.append(f"| {symbol} | {count} |")
        lines.append("")

    lines.append("## Exclusions")
    lines.append("")
    ex = report["exclusions"]
    lines.append(f"- {ex['eval_set_holdout']} rows held out (in `labeled_set.jsonl`)")
    lines.append(f"- {ex['duplicates']} rows dropped as duplicate link or title")
    lines.append("")

    lines.append("## Files")
    lines.append("")
    for name, path in report["files"].items():
        lines.append(f"- `{path}` — {name}")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Export the sentiments collection as distillation training data."
    )
    parser.add_argument(
        "--databases",
        nargs="+",
        default=["tradex_sentiment", "tradex"],
        help="MongoDB databases holding a sentiments collection",
    )
    parser.add_argument("--mongo-url", default=None)
    parser.add_argument("--labeled-set", default=DEFAULT_LABELED_SET)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--val-fraction", type=float, default=0.2)
    parser.add_argument(
        "--teacher",
        choices=["all", "gemini", "mock"],
        default="all",
        help="Keep only rows produced by this teacher",
    )
    parser.add_argument(
        "--allow-mock-labels",
        action="store_true",
        help="Export even when the labels came from the keyword fallback",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
    )

    mongo_url = args.mongo_url
    if mongo_url is None:
        from app.config import settings

        mongo_url = settings.mongodb_url

    eval_links = load_eval_links(args.labeled_set)
    raw_rows, n_duplicates = load_sentiments(mongo_url, args.databases)
    if not raw_rows:
        raise SystemExit("No sentiment analyses found — is MongoDB populated?")

    symbols = {row["symbol"] for row in raw_rows}
    provenance = tag_provenance(raw_rows, build_mock_reason_index(symbols))
    logger.info("Label provenance: %s", provenance)

    held_out = [row for row in raw_rows if row["link"] in eval_links]
    kept = [row for row in raw_rows if row["link"] not in eval_links]
    logger.info("Held out %d rows that are in the eval set", len(held_out))

    if args.teacher != "all":
        before = len(kept)
        kept = [row for row in kept if row["teacher"] == args.teacher]
        logger.info(
            "Teacher filter '%s': %d -> %d rows", args.teacher, before, len(kept)
        )

    if not kept:
        raise SystemExit("Nothing left to export after filtering.")

    mock_share = sum(1 for r in kept if r["teacher"] == "mock") / len(kept)
    if mock_share > 0.5 and not args.allow_mock_labels:
        raise SystemExit(
            f"\n{mock_share * 100:.0f}% of the {len(kept)} rows to export were "
            "produced by the keyword fallback, not Gemini.\n"
            "A student trained on these distils a regex, not an LLM.\n\n"
            "Fix the GEMINI_API_KEY and re-analyse the backlog, or pass "
            "--allow-mock-labels to export anyway for pipeline testing.\n"
        )

    train_rows, val_rows = chronological_split(kept, args.val_fraction)
    train_out = [to_training_row(r) for r in train_rows]
    val_out = [to_training_row(r) for r in val_rows]

    train_path = os.path.join(args.output_dir, "train.jsonl")
    val_path = os.path.join(args.output_dir, "val.jsonl")
    write_jsonl(train_out, train_path)
    write_jsonl(val_out, val_path)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "databases": args.databases,
        "provenance": provenance,
        "teacher_filter": args.teacher,
        "exclusions": {
            "eval_set_holdout": len(held_out),
            "duplicates": n_duplicates,
        },
        "splits": {"train": summarise(train_rows), "val": summarise(val_rows)},
        "files": {
            "training rows": display_path(train_path, SERVICE_DIR),
            "validation rows": display_path(val_path, SERVICE_DIR),
        },
    }

    report_path = os.path.join(args.output_dir, "export_report.md")
    with open(report_path, "w", encoding="utf-8") as fh:
        fh.write(render_report(report))

    json_path = os.path.join(args.output_dir, "export_report.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    print()
    print(f"Exported {len(train_out)} train / {len(val_out)} val rows")
    print(f"  provenance : {provenance}")
    print(f"  held out   : {len(held_out)} eval-set articles")
    print(f"  report     : {report_path}")
    print()


if __name__ == "__main__":
    main()

"""
Build the hand-labelling worksheet for the sentiment ground-truth evaluation.

Samples a deliberately mixed slice of real articles out of the ``collected_news``
MongoDB collection and writes them to ``labeled_set.jsonl`` with empty label
fields for a human to fill in.

Sampling is stratified rather than "most recent N", because the most recent N
articles are usually all the same flavour and would make the eval set look
easier than the pipeline's real workload. Articles are pre-bucketed by a crude
keyword prior and then drawn round-robin across those priors and across symbols,
so the worksheet covers obviously bullish, obviously bearish and genuinely
ambiguous headlines.

The keyword prior is *only* used to spread the sample out. It never becomes a
label -- every ``label_sentiment_bucket`` in the output starts empty.

Re-running is safe: labels already present in an existing ``labeled_set.jsonl``
are carried over, and only unlabelled slots are refilled.

Usage:
    cd services/sentiment-service
    python -m eval.build_labeled_set --size 50
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

EVAL_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUTPUT = os.path.join(EVAL_DIR, "labeled_set.jsonl")

# Crude priors used only to stratify the sample. Deliberately not the same
# lexicon as SentimentService._calculate_mock_sentiment, so the eval set is not
# hand-picked to suit the fallback path.
BULLISH_HINTS = [
    "surge", "soar", "rally", "record", "all-time high", "breakout", "jump",
    "gain", "climb", "adoption", "approval", "inflow", "upgrade", "bullish",
    "outperform", "buy", "accumulate", "partnership", "launch",
]
BEARISH_HINTS = [
    "crash", "plunge", "slump", "sink", "tumble", "drop", "fall", "selloff",
    "sell-off", "liquidation", "outflow", "hack", "exploit", "lawsuit",
    "ban", "warning", "bearish", "downgrade", "risk", "low", "loss", "fear",
]


def keyword_prior(text: str) -> str:
    """Return a rough bullish/bearish/neutral prior used purely for stratifying."""
    lowered = text.lower()
    bull = sum(1 for word in BULLISH_HINTS if word in lowered)
    bear = sum(1 for word in BEARISH_HINTS if word in lowered)

    if bull > bear:
        return "bullish"
    if bear > bull:
        return "bearish"
    return "neutral"


def load_articles(
    mongo_url: str, databases: Iterable[str], collection: str = "collected_news"
) -> list[dict[str, Any]]:
    """Read every article from the given databases, de-duplicated by link."""
    from pymongo import MongoClient

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)

    seen: set[str] = set()
    articles: list[dict[str, Any]] = []

    for db_name in databases:
        for doc in client[db_name][collection].find({}):
            link = doc.get("link")
            if not link or link in seen:
                continue
            seen.add(link)

            content = (doc.get("content") or "").strip()
            title = (doc.get("title") or "").strip()
            if not title or len(content) < 10:
                continue

            published = doc.get("published_at")
            articles.append(
                {
                    "id": str(doc["_id"]),
                    "source_db": db_name,
                    "source": doc.get("source", "unknown"),
                    "title": title,
                    "content": content,
                    "link": link,
                    "published_at": (
                        published.isoformat()
                        if isinstance(published, datetime)
                        else str(published)
                    ),
                    "symbol_hint": (doc.get("metadata") or {}).get("symbol"),
                }
            )

    logger.info(
        "Loaded %d unique articles from %s", len(articles), ", ".join(databases)
    )
    return articles


def stratified_sample(
    articles: list[dict[str, Any]], size: int, seed: int = 20260218
) -> list[dict[str, Any]]:
    """
    Draw ``size`` articles spread across keyword priors and symbols.

    Walks the (prior, symbol) groups round-robin so no single bucket dominates,
    which is what makes the resulting accuracy number meaningful rather than a
    measure of how many easy bullish headlines happened to be collected today.
    """
    rng = random.Random(seed)

    groups: dict[tuple[str, str | None], list[dict[str, Any]]] = defaultdict(list)
    for article in articles:
        prior = keyword_prior(f"{article['title']} {article['content']}")
        article["_keyword_prior"] = prior
        groups[(prior, article["symbol_hint"])].append(article)

    for bucket in groups.values():
        rng.shuffle(bucket)

    ordered_keys = sorted(groups.keys(), key=lambda k: (k[0], str(k[1])))
    rng.shuffle(ordered_keys)

    selected: list[dict[str, Any]] = []
    exhausted = False
    while len(selected) < size and not exhausted:
        exhausted = True
        for key in ordered_keys:
            if not groups[key]:
                continue
            exhausted = False
            selected.append(groups[key].pop())
            if len(selected) >= size:
                break

    selected.sort(key=lambda a: a["published_at"])
    return selected


def load_existing_labels(path: str) -> dict[str, dict[str, Any]]:
    """Read labels already assigned in a previous run, keyed by article link."""
    if not os.path.exists(path):
        return {}

    labels: dict[str, dict[str, Any]] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if row.get("label_sentiment_bucket"):
                labels[row["link"]] = {
                    "label_sentiment_bucket": row.get("label_sentiment_bucket"),
                    "label_emotion": row.get("label_emotion"),
                    "label_source": row.get("label_source"),
                    "label_note": row.get("label_note"),
                }

    logger.info("Carried over %d existing labels from %s", len(labels), path)
    return labels


def write_worksheet(
    articles: list[dict[str, Any]],
    output_path: str,
    existing: dict[str, dict[str, Any]],
) -> None:
    """Write the sampled articles as one JSON object per line."""
    with open(output_path, "w", encoding="utf-8") as fh:
        for article in articles:
            row = {
                "id": article["id"],
                "title": article["title"],
                "content": article["content"],
                "link": article["link"],
                "published_at": article["published_at"],
                "symbol_hint": article["symbol_hint"],
                "source": article["source"],
                "keyword_prior": article["_keyword_prior"],
                "label_sentiment_bucket": None,
                "label_emotion": None,
                "label_source": None,
                "label_note": None,
            }
            row.update(existing.get(article["link"], {}))
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    labelled = sum(1 for a in articles if a["link"] in existing)
    logger.info(
        "Wrote %d articles to %s (%d already labelled, %d to go)",
        len(articles),
        output_path,
        labelled,
        len(articles) - labelled,
    )


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Sample articles from collected_news into a labelling worksheet."
    )
    parser.add_argument("--size", type=int, default=50, help="Number of articles")
    parser.add_argument(
        "--databases",
        nargs="+",
        default=["tradex_sentiment", "tradex"],
        help="MongoDB databases holding a collected_news collection",
    )
    parser.add_argument("--mongo-url", default=None, help="MongoDB connection string")
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--seed", type=int, default=20260218)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
    )

    mongo_url = args.mongo_url
    if mongo_url is None:
        from app.config import settings

        mongo_url = settings.mongodb_url

    articles = load_articles(mongo_url, args.databases)
    if not articles:
        raise SystemExit("No articles found — is MongoDB running and populated?")

    sampled = stratified_sample(articles, args.size, seed=args.seed)
    existing = load_existing_labels(args.output)
    write_worksheet(sampled, args.output, existing)

    print()
    print(f"Worksheet ready: {args.output}")
    print(f"  {len(sampled)} articles sampled from {len(articles)} available")
    print()
    print("Fill in for each line:")
    print('  "label_sentiment_bucket": "bullish" | "neutral" | "bearish"')
    print('  "label_emotion": one of Optimism, Greed, Excitement, Fear, Anger, '
          "Pessimism")
    print('  "label_source": "human"')
    print()
    print("Then run: python -m eval.evaluate")
    print()


if __name__ == "__main__":
    main()

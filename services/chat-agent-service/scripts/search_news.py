"""
Manual top-k query against the Qdrant ``news_chunks`` collection.

This is the Sprint 2 definition-of-done check: run a query, confirm the results
are on-topic. It is also the exact retrieval call the agent's ``search_news``
tool will make in T3.2, so whatever this returns is what the chatbot will be
grounded on.

Usage:
    cd services/chat-agent-service
    python -m scripts.search_news "ETF inflows"
    python -m scripts.search_news "regulatory crackdown" --symbol XRPUSDT -k 3
    python -m scripts.search_news --self-test
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402
from app.embeddings import build_embedder  # noqa: E402
from app.qdrant_store import build_client, search  # noqa: E402

logger = logging.getLogger(__name__)

# Queries with an obvious expected topic, used by --self-test to sanity-check
# that retrieval is returning something related rather than noise.
SELF_TEST_QUERIES = [
    "spot ETF inflows and institutional adoption",
    "price crash and liquidations",
    "stablecoin launch by a traditional finance company",
    "meme coin trading activity",
    "regulatory action or lawsuit",
]


def render(results: list[dict], show_content: bool = True) -> None:
    """Print search hits in a readable form."""
    if not results:
        print("  (no results)")
        return

    for rank, hit in enumerate(results, start=1):
        published = (hit.get("published_at") or "")[:10]
        print(
            f"  {rank}. [{hit['score']:.3f}] ({hit.get('symbol')}, {published}) "
            f"{hit.get('title')}"
        )
        if show_content and hit.get("content"):
            print(f"       {hit['content'][:150]}")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Query the news_chunks collection."
    )
    parser.add_argument("query", nargs="?", help="Free-text search query")
    parser.add_argument("--symbol", default=None, help="Filter by trading pair")
    parser.add_argument("-k", "--limit", type=int, default=5)
    parser.add_argument("--backend", choices=["gemini", "local"], default=None)
    parser.add_argument("--collection", default=settings.qdrant_collection)
    parser.add_argument("--qdrant-url", default=settings.qdrant_url)
    parser.add_argument("--qdrant-path", default=settings.qdrant_path)
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run a fixed set of queries to eyeball retrieval quality",
    )
    parser.add_argument("--quiet", action="store_true", help="Titles only")
    args = parser.parse_args()

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")

    if not args.query and not args.self_test:
        parser.error("provide a query, or pass --self-test")

    embedder = build_embedder(args.backend)
    client = build_client(
        url=args.qdrant_url,
        path=args.qdrant_path,
        api_key=settings.qdrant_api_key,
        timeout=settings.qdrant_timeout,
    )

    if not client.collection_exists(args.collection):
        raise SystemExit(
            f"Collection '{args.collection}' does not exist. "
            "Run `python -m scripts.ingest_news` first."
        )

    total = client.count(args.collection).count
    print(f"\n{args.collection}: {total} points | embedder {embedder.name}\n")

    queries = SELF_TEST_QUERIES if args.self_test else [args.query]
    for query in queries:
        label = f'"{query}"'
        if args.symbol:
            label += f"  [symbol={args.symbol.upper()}]"
        print(label)
        render(
            search(
                client,
                args.collection,
                embedder.embed_query(query),
                limit=args.limit,
                symbol=args.symbol,
            ),
            show_content=not args.quiet,
        )
        print()


if __name__ == "__main__":
    main()

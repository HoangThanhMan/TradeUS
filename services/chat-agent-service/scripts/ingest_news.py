"""
Ingest ``collected_news`` from MongoDB into the Qdrant ``news_chunks`` collection.

Reads the articles the existing collectors already write, embeds one vector per
article, and upserts them with a ``{symbol, title, link, published_at}`` payload
(plus the article text, so a retrieved hit can be quoted without going back to
MongoDB).

No new data source and no new collection pipeline -- this consumes what the
sentiment service's scheduler is already storing.

Re-running is cheap and idempotent:
  - point IDs are derived from the article link, so articles update in place
    rather than duplicating
  - a content fingerprint is stored with each point, so unchanged articles are
    skipped instead of re-embedded

Usage:
    cd services/chat-agent-service
    python -m scripts.ingest_news                    # Gemini embeddings
    python -m scripts.ingest_news --backend local    # no API key needed
    python -m scripts.ingest_news --recreate         # rebuild from scratch
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from collections.abc import Iterable
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402
from app.embeddings import build_embedder  # noqa: E402
from app.qdrant_store import (  # noqa: E402
    NewsChunk,
    build_client,
    content_fingerprint,
    ensure_collection,
    existing_fingerprints,
    point_id_for,
    upsert_chunks,
)

logger = logging.getLogger(__name__)

# Yahoo-style symbols (BTC-USD) are normalised to the platform's trading pairs
# (BTCUSDT) so the agent can filter with the same symbol it uses everywhere else.
SYMBOL_KEYWORDS = {
    "BTCUSDT": ["bitcoin", "btc"],
    "ETHUSDT": ["ethereum", "ether", "eth"],
    "BNBUSDT": ["binance coin", "bnb"],
    "XRPUSDT": ["ripple", "xrp"],
    "SOLUSDT": ["solana", "sol"],
}


def normalise_symbol(raw: str | None, text: str) -> str:
    """
    Map a source symbol onto the platform's trading-pair form.

    Falls back to keyword detection over the article, then to BTCUSDT, matching
    how ``sentiment-service`` resolves symbols.
    """
    if raw:
        candidate = raw.upper().strip()
        if candidate.endswith("USDT"):
            return candidate
        if "-USD" in candidate:
            return candidate.replace("-USD", "USDT").replace("-", "")
        if candidate and not candidate.endswith("USD"):
            return f"{candidate}USDT"

    lowered = text.lower()
    for symbol, keywords in SYMBOL_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return symbol
    return "BTCUSDT"


def load_articles(
    mongo_url: str, databases: Iterable[str], collection: str
) -> list[NewsChunk]:
    """Read every article from the given databases, de-duplicated by link."""
    from pymongo import MongoClient

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)

    seen: set[str] = set()
    chunks: list[NewsChunk] = []

    for database in databases:
        for doc in client[database][collection].find({}):
            link = doc.get("link")
            title = (doc.get("title") or "").strip()
            if not link or not title or link in seen:
                continue
            seen.add(link)

            content = (doc.get("content") or "").strip()
            published = doc.get("published_at")
            metadata = doc.get("metadata") or {}

            chunks.append(
                NewsChunk(
                    link=link,
                    title=title,
                    content=content,
                    symbol=normalise_symbol(
                        metadata.get("symbol"), f"{title} {content}"
                    ),
                    published_at=(
                        published.isoformat()
                        if isinstance(published, datetime)
                        else str(published or "")
                    ),
                    source=str(doc.get("source", "unknown")),
                )
            )

    logger.info(
        "Loaded %d unique articles from %s", len(chunks), ", ".join(databases)
    )
    return chunks


def select_new_or_changed(
    chunks: list[NewsChunk], fingerprints: dict[str, str], max_chunk_chars: int
) -> tuple[list[NewsChunk], int]:
    """Split off the articles that actually need embedding."""
    pending: list[NewsChunk] = []
    skipped = 0

    for chunk in chunks:
        stored = fingerprints.get(point_id_for(chunk.link))
        current = content_fingerprint(chunk.embedding_text(max_chunk_chars))
        if stored == current:
            skipped += 1
            continue
        pending.append(chunk)

    return pending, skipped


def embed_and_upsert(
    client,
    embedder,
    collection: str,
    chunks: list[NewsChunk],
    batch_size: int,
    max_chunk_chars: int,
) -> int:
    """Embed in batches and write each batch, so a late failure keeps progress."""
    written = 0

    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        texts = [chunk.embedding_text(max_chunk_chars) for chunk in batch]

        vectors = embedder.embed_documents(texts)
        written += upsert_chunks(
            client, collection, batch, vectors, max_chunk_chars
        )

        logger.info("Embedded and upserted %d/%d", written, len(chunks))

    return written


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Embed collected_news into the Qdrant news_chunks collection."
    )
    parser.add_argument("--mongo-url", default=settings.mongodb_url)
    parser.add_argument("--databases", nargs="+", default=None)
    parser.add_argument("--collection", default=settings.qdrant_collection)
    parser.add_argument(
        "--backend",
        choices=["gemini", "local"],
        default=None,
        help="Embedding backend (default: EMBEDDING_BACKEND)",
    )
    parser.add_argument("--qdrant-url", default=settings.qdrant_url)
    parser.add_argument(
        "--qdrant-path",
        default=settings.qdrant_path,
        help="Use an embedded on-disk Qdrant instead of a server",
    )
    parser.add_argument("--batch-size", type=int, default=settings.embedding_batch_size)
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Delete and rebuild the collection before ingesting",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed every article, ignoring stored fingerprints",
    )
    parser.add_argument("--limit", type=int, default=0, help="Cap articles (0 = all)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
    )

    # Built before reading MongoDB: if the embedder cannot be constructed there
    # is no point loading anything. No silent backend fallback here -- mixing
    # vector spaces inside one collection is worse than failing.
    embedder = build_embedder(args.backend)
    logger.info("Embedder: %s (%d-dim)", embedder.name, embedder.dimension)

    databases = args.databases or settings.mongodb_databases_list
    chunks = load_articles(
        args.mongo_url, databases, settings.collected_news_collection
    )
    if not chunks:
        raise SystemExit("No articles found — is MongoDB running and populated?")

    if args.limit:
        chunks = chunks[: args.limit]

    client = build_client(
        url=args.qdrant_url,
        path=args.qdrant_path,
        api_key=settings.qdrant_api_key,
        timeout=settings.qdrant_timeout,
    )
    collection_info = ensure_collection(
        client, args.collection, embedder.dimension, recreate=args.recreate
    )

    if args.force or collection_info["created"]:
        pending, skipped = chunks, 0
    else:
        pending, skipped = select_new_or_changed(
            chunks,
            existing_fingerprints(client, args.collection),
            settings.max_chunk_chars,
        )

    logger.info("%d to embed, %d unchanged and skipped", len(pending), skipped)

    written = 0
    if pending:
        written = embed_and_upsert(
            client,
            embedder,
            args.collection,
            pending,
            args.batch_size,
            settings.max_chunk_chars,
        )

    total = client.count(args.collection).count
    symbols: dict[str, int] = {}
    for chunk in chunks:
        symbols[chunk.symbol] = symbols.get(chunk.symbol, 0) + 1

    print()
    print(f"Collection : {args.collection}")
    print(f"Embedder   : {embedder.name} ({embedder.dimension}-dim)")
    print(f"Articles   : {len(chunks)} loaded, {written} embedded, {skipped} skipped")
    print(f"Points     : {total} in collection")
    print(f"Symbols    : {dict(sorted(symbols.items(), key=lambda kv: -kv[1]))}")
    print()
    print("Try a query:  python -m scripts.search_news \"ETF inflows\" --symbol BTCUSDT")
    print()


if __name__ == "__main__":
    main()

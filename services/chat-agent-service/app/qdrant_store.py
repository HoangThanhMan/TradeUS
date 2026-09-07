"""
Qdrant access for the ``news_chunks`` collection.

Collection schema
-----------------
One point per article:

- **vector** — the article embedding, cosine distance
- **payload** — ``symbol``, ``title``, ``link``, ``published_at``, plus
  ``content`` and ``source`` so a retrieved hit can be quoted without a second
  round trip to MongoDB

``symbol`` and ``published_at`` get payload indexes because the agent's
``search_news`` tool filters on symbol and the answers are time sensitive.

Point IDs are derived deterministically from the article link, so re-running
ingestion updates existing points instead of duplicating them.
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

# Namespace for deterministic point IDs. Fixed forever: changing it would orphan
# every previously ingested point instead of updating it.
POINT_ID_NAMESPACE = uuid.UUID("6f1c7b0e-9a2d-4a6f-9c4e-2f5b8d3a1c07")


def point_id_for(link: str) -> str:
    """Derive a stable point ID from an article link."""
    return str(uuid.uuid5(POINT_ID_NAMESPACE, link))


def content_fingerprint(text: str) -> str:
    """Short hash of the embedded text, used to skip unchanged articles."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


@dataclass
class NewsChunk:
    """One article, ready to be embedded and stored."""

    link: str
    title: str
    content: str
    symbol: str
    published_at: str
    source: str

    def embedding_text(self, max_chars: int = 2000) -> str:
        """
        The text that actually gets embedded.

        Title first: on this corpus the body is a ~150-character summary, so the
        headline carries most of the signal and must not be truncated away.
        """
        text = f"{self.title}\n\n{self.content}" if self.content else self.title
        return text[:max_chars]

    def payload(self, embedding_text: str) -> dict[str, Any]:
        """The payload stored alongside the vector."""
        return {
            "symbol": self.symbol,
            "title": self.title,
            "link": self.link,
            "published_at": self.published_at,
            "content": self.content,
            "source": self.source,
            "fingerprint": content_fingerprint(embedding_text),
        }


def build_client(
    url: str = "",
    path: str = "",
    api_key: str = "",
    timeout: int = 30,
):
    """
    Connect to Qdrant, either a server or an embedded on-disk store.

    ``path`` wins when set. Embedded mode keeps ingestion and retrieval runnable
    without Docker; the client API is identical, so nothing downstream changes.
    """
    from qdrant_client import QdrantClient

    if path:
        logger.info("Using embedded Qdrant at %s", path)
        return QdrantClient(path=path)

    logger.info("Connecting to Qdrant at %s", url)
    return QdrantClient(url=url, api_key=api_key or None, timeout=timeout)


def ensure_collection(
    client,
    collection: str,
    dimension: int,
    recreate: bool = False,
) -> dict[str, Any]:
    """
    Create ``news_chunks`` if absent, and verify its vector width if present.

    A dimension mismatch is fatal rather than silently tolerated: mixing vectors
    from two embedding backends in one collection produces retrieval results
    that look plausible and are meaningless.
    """
    from qdrant_client import models

    exists = client.collection_exists(collection)

    if exists and recreate:
        logger.warning("Deleting existing collection %s", collection)
        client.delete_collection(collection)
        exists = False

    if exists:
        info = client.get_collection(collection)
        existing_dim = info.config.params.vectors.size
        if existing_dim != dimension:
            raise SystemExit(
                f"\nCollection '{collection}' has {existing_dim}-dim vectors but the "
                f"configured embedder produces {dimension}-dim.\n"
                "Vectors from different embedding backends cannot share a "
                "collection.\nRe-run with --recreate to rebuild it, or switch "
                "EMBEDDING_BACKEND back.\n"
            )
        logger.info(
            "Collection %s already exists (%d points, %d-dim)",
            collection,
            client.count(collection).count,
            existing_dim,
        )
        return {"created": False, "dimension": existing_dim}

    logger.info("Creating collection %s (%d-dim, cosine)", collection, dimension)
    client.create_collection(
        collection_name=collection,
        vectors_config=models.VectorParams(
            size=dimension, distance=models.Distance.COSINE
        ),
    )

    # Indexed because search_news filters by symbol and orders by recency.
    client.create_payload_index(
        collection_name=collection,
        field_name="symbol",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )
    # DATETIME, not KEYWORD: search() filters this field with a DatetimeRange,
    # which needs a datetime index on a real server. Embedded Qdrant ignores
    # indexes entirely and filters by brute force, so a wrong type here would
    # pass every local test and only break in production.
    client.create_payload_index(
        collection_name=collection,
        field_name="published_at",
        field_schema=models.PayloadSchemaType.DATETIME,
    )

    return {"created": True, "dimension": dimension}


def upsert_chunks(
    client,
    collection: str,
    chunks: list[NewsChunk],
    vectors: list[list[float]],
    max_chunk_chars: int = 2000,
) -> int:
    """Write (or overwrite) one point per article. Returns the number written."""
    from qdrant_client import models

    points = [
        models.PointStruct(
            id=point_id_for(chunk.link),
            vector=vector,
            payload=chunk.payload(chunk.embedding_text(max_chunk_chars)),
        )
        for chunk, vector in zip(chunks, vectors, strict=True)
    ]

    client.upsert(collection_name=collection, points=points, wait=True)
    return len(points)


def existing_fingerprints(client, collection: str) -> dict[str, str]:
    """
    Map point ID -> stored fingerprint, so unchanged articles can be skipped.

    Re-embedding an unchanged corpus is the main avoidable cost in this pipeline
    once it runs on a schedule.
    """
    fingerprints: dict[str, str] = {}
    offset = None

    while True:
        points, offset = client.scroll(
            collection_name=collection,
            limit=256,
            offset=offset,
            with_payload=["fingerprint"],
            with_vectors=False,
        )
        for point in points:
            payload = point.payload or {}
            if payload.get("fingerprint"):
                fingerprints[str(point.id)] = payload["fingerprint"]
        if offset is None:
            break

    return fingerprints


def search(
    client,
    collection: str,
    query_vector: list[float],
    limit: int = 5,
    symbol: str | None = None,
    published_after: datetime | None = None,
) -> list[dict[str, Any]]:
    """
    Top-k search over ``news_chunks``, optionally filtered by symbol and recency.

    Returns plain dicts so callers (and the agent tool in T3.2) do not need to
    import Qdrant types.
    """
    from qdrant_client import models

    conditions = []
    if symbol:
        conditions.append(
            models.FieldCondition(
                key="symbol", match=models.MatchValue(value=symbol.upper())
            )
        )
    if published_after:
        conditions.append(
            models.FieldCondition(
                key="published_at",
                range=models.DatetimeRange(gte=published_after),
            )
        )

    query_filter = models.Filter(must=conditions) if conditions else None

    results = client.query_points(
        collection_name=collection,
        query=query_vector,
        query_filter=query_filter,
        limit=limit,
        with_payload=True,
    ).points

    return [
        {
            "score": point.score,
            "title": (point.payload or {}).get("title"),
            "link": (point.payload or {}).get("link"),
            "symbol": (point.payload or {}).get("symbol"),
            "published_at": (point.payload or {}).get("published_at"),
            "content": (point.payload or {}).get("content"),
            "source": (point.payload or {}).get("source"),
        }
        for point in results
    ]

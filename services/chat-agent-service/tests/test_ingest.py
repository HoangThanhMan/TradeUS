"""
Tests for the news ingestion pipeline and the Qdrant store layer.

The pure logic — symbol normalisation, point IDs, fingerprints, chunk text — is
tested without any dependency. The end-to-end ingest/search test uses Qdrant's
embedded mode and a stub embedder, so it exercises the real collection schema,
upsert and query code without needing Docker or an API key.
"""

import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.qdrant_store import (  # noqa: E402
    NewsChunk,
    build_client,
    content_fingerprint,
    ensure_collection,
    existing_fingerprints,
    point_id_for,
    search,
    upsert_chunks,
)
from scripts.ingest_news import (  # noqa: E402
    normalise_symbol,
    select_new_or_changed,
)


class StubEmbedder:
    """
    Deterministic 4-dim embedder — no model download, no API.

    Vectors are built from crude keyword counts so that semantically related
    texts land near each other and the search assertions mean something.
    """

    name = "stub"
    dimension = 4

    KEYWORDS = [
        ["etf", "inflow", "institutional"],
        ["crash", "liquidation", "plunge"],
        ["stablecoin", "launch", "fidelity"],
        ["meme", "pump", "dogecoin"],
    ]

    def _vector(self, text: str) -> list[float]:
        lowered = text.lower()
        raw = [
            float(sum(lowered.count(word) for word in group)) for group in self.KEYWORDS
        ]
        if not any(raw):
            raw = [1.0, 1.0, 1.0, 1.0]
        norm = sum(value * value for value in raw) ** 0.5
        return [value / norm for value in raw]

    def embed_documents(self, texts):
        """Embed a batch of documents."""
        return [self._vector(text) for text in texts]

    def embed_query(self, text):
        """Embed a query."""
        return self._vector(text)


def make_chunk(link, title, content="", symbol="BTCUSDT"):
    """Build a NewsChunk with sensible defaults."""
    return NewsChunk(
        link=link,
        title=title,
        content=content,
        symbol=symbol,
        published_at=datetime(2026, 2, 1).isoformat(),
        source="yahoo",
    )


class TestSymbolNormalisation:
    """Source symbols must land on the platform's trading-pair form."""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("BTC-USD", "BTCUSDT"),
            ("ETH-USD", "ETHUSDT"),
            ("btcusdt", "BTCUSDT"),
            ("SOL", "SOLUSDT"),
        ],
    )
    def test_known_forms(self, raw, expected):
        """Yahoo, lowercase and bare-ticker forms all normalise."""
        assert normalise_symbol(raw, "") == expected

    def test_falls_back_to_keyword_detection(self):
        """With no source symbol, the article text decides."""
        assert normalise_symbol(None, "Ethereum upgrade ships") == "ETHUSDT"
        assert normalise_symbol(None, "Ripple and XRP settlement") == "XRPUSDT"

    def test_defaults_to_btc(self):
        """An unrecognisable article still gets a usable symbol."""
        assert normalise_symbol(None, "generic market commentary") == "BTCUSDT"


class TestPointIdentity:
    """Re-ingesting must update points, never duplicate them."""

    def test_point_id_is_stable_for_a_link(self):
        """The same link always maps to the same ID."""
        assert point_id_for("https://x.com/a") == point_id_for("https://x.com/a")

    def test_different_links_get_different_ids(self):
        """Distinct articles must not collide."""
        assert point_id_for("https://x.com/a") != point_id_for("https://x.com/b")

    def test_fingerprint_tracks_content_changes(self):
        """An edited article produces a different fingerprint."""
        assert content_fingerprint("hello") == content_fingerprint("hello")
        assert content_fingerprint("hello") != content_fingerprint("hello!")


class TestChunkText:
    """The embedded text must lead with the headline."""

    def test_title_comes_first(self):
        """Title precedes body, so truncation never removes the headline."""
        chunk = make_chunk("l", "HEADLINE", "body text")
        assert chunk.embedding_text().startswith("HEADLINE")

    def test_respects_the_character_cap(self):
        """Long articles are truncated to the configured cap."""
        chunk = make_chunk("l", "T", "x" * 5000)
        assert len(chunk.embedding_text(max_chars=100)) == 100

    def test_title_only_article_is_handled(self):
        """An empty body must not produce stray separators."""
        assert make_chunk("l", "Just a title").embedding_text() == "Just a title"


class TestIncrementalSelection:
    """Unchanged articles should not be re-embedded."""

    def test_unchanged_articles_are_skipped(self):
        """A matching fingerprint means no work to do."""
        chunk = make_chunk("https://x.com/a", "Title", "body")
        stored = {
            point_id_for(chunk.link): content_fingerprint(chunk.embedding_text(2000))
        }

        pending, skipped = select_new_or_changed([chunk], stored, 2000)

        assert pending == [] and skipped == 1

    def test_changed_articles_are_selected(self):
        """A stale fingerprint means the article is re-embedded."""
        chunk = make_chunk("https://x.com/a", "Title", "new body")

        pending, skipped = select_new_or_changed(
            [chunk], {point_id_for(chunk.link): "stale"}, 2000
        )

        assert pending == [chunk] and skipped == 0

    def test_unseen_articles_are_selected(self):
        """Articles absent from the index are always embedded."""
        chunk = make_chunk("https://x.com/new", "Title")

        pending, skipped = select_new_or_changed([chunk], {}, 2000)

        assert pending == [chunk] and skipped == 0


class TestCollectionLifecycle:
    """Schema creation and the dimension guard."""

    def test_creates_then_reuses(self, tmp_path):
        """First call creates the collection; the second reuses it."""
        client = build_client(path=str(tmp_path / "q"))
        try:
            assert ensure_collection(client, "news_chunks", 4)["created"] is True
            assert ensure_collection(client, "news_chunks", 4)["created"] is False
        finally:
            client.close()

    def test_dimension_mismatch_is_fatal(self, tmp_path):
        """
        Mixing vector widths in one collection must stop the run.

        Two embedding backends produce incompatible vectors; tolerating that
        yields retrieval results that look plausible and mean nothing.
        """
        client = build_client(path=str(tmp_path / "q"))
        try:
            ensure_collection(client, "news_chunks", 4)
            with pytest.raises(SystemExit, match="384-dim|768-dim|cannot share"):
                ensure_collection(client, "news_chunks", 768)
        finally:
            client.close()

    def test_recreate_resets_the_collection(self, tmp_path):
        """--recreate allows switching to a different vector width."""
        client = build_client(path=str(tmp_path / "q"))
        try:
            ensure_collection(client, "news_chunks", 4)
            result = ensure_collection(client, "news_chunks", 8, recreate=True)
            assert result["created"] is True and result["dimension"] == 8
        finally:
            client.close()


class TestIngestAndSearch:
    """End-to-end through the real store: upsert, query, filter, idempotency."""

    @pytest.fixture
    def store(self, tmp_path):
        """An embedded Qdrant seeded with a handful of articles."""
        embedder = StubEmbedder()
        client = build_client(path=str(tmp_path / "q"))
        ensure_collection(client, "news_chunks", embedder.dimension)

        chunks = [
            make_chunk("https://x.com/1", "Spot ETF inflows hit record",
                       "Institutional inflow surges", "BTCUSDT"),
            make_chunk("https://x.com/2", "Market crash triggers liquidation cascade",
                       "Plunge across majors", "BTCUSDT"),
            make_chunk("https://x.com/3", "Fidelity to launch a stablecoin",
                       "Stablecoin launch on Ethereum", "ETHUSDT"),
            make_chunk("https://x.com/4", "Meme coin pump grips traders",
                       "Dogecoin volume spikes", "SOLUSDT"),
        ]
        texts = [chunk.embedding_text() for chunk in chunks]
        upsert_chunks(client, "news_chunks", chunks, embedder.embed_documents(texts))

        yield client, embedder
        client.close()

    def test_query_returns_the_on_topic_article(self, store):
        """The top hit for a topic must be the article about that topic."""
        client, embedder = store

        results = search(
            client, "news_chunks", embedder.embed_query("stablecoin launch"), limit=1
        )

        assert results[0]["title"] == "Fidelity to launch a stablecoin"

    def test_payload_carries_the_documented_schema(self, store):
        """The agent tool depends on these payload fields existing."""
        client, embedder = store

        hit = search(
            client, "news_chunks", embedder.embed_query("ETF inflows"), limit=1
        )[0]

        for field in ("symbol", "title", "link", "published_at", "content", "source"):
            assert hit[field] is not None, f"missing payload field: {field}"

    def test_symbol_filter_restricts_results(self, store):
        """Filtering by symbol must exclude every other pair."""
        client, embedder = store

        results = search(
            client,
            "news_chunks",
            embedder.embed_query("crypto news"),
            limit=10,
            symbol="ETHUSDT",
        )

        assert results, "expected at least one ETHUSDT article"
        assert all(hit["symbol"] == "ETHUSDT" for hit in results)

    def test_reingest_updates_instead_of_duplicating(self, store):
        """Re-upserting the same links must not grow the collection."""
        client, embedder = store
        before = client.count("news_chunks").count

        chunk = make_chunk("https://x.com/1", "Spot ETF inflows hit record",
                           "Revised body", "BTCUSDT")
        upsert_chunks(
            client,
            "news_chunks",
            [chunk],
            embedder.embed_documents([chunk.embedding_text()]),
        )

        assert client.count("news_chunks").count == before

    def test_published_after_filter(self, store):
        """
        Recency filtering must work, since answers about markets are time bound.

        Note: embedded Qdrant ignores payload indexes and filters by brute
        force, so this proves the query shape is valid but not that the index
        type on a real server is right.
        """
        client, embedder = store

        recent = make_chunk("https://x.com/5", "Fresh ETF inflow story", "inflow")
        recent.published_at = datetime(2026, 6, 1).isoformat()
        upsert_chunks(
            client,
            "news_chunks",
            [recent],
            embedder.embed_documents([recent.embedding_text()]),
        )

        results = search(
            client,
            "news_chunks",
            embedder.embed_query("etf inflow institutional"),
            limit=10,
            published_after=datetime(2026, 3, 1),
        )

        assert [hit["link"] for hit in results] == ["https://x.com/5"]

    def test_fingerprints_round_trip(self, store):
        """Stored fingerprints must be readable back for the skip check."""
        client, _ = store

        fingerprints = existing_fingerprints(client, "news_chunks")

        assert len(fingerprints) == 4
        assert point_id_for("https://x.com/1") in fingerprints

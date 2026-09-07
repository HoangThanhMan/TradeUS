"""
The three tools the market agent can call.

Each tool is a plain async function plus a JSON-schema declaration. The schemas
are handed to Gemini for function calling; the functions are what actually runs
when Gemini asks for one. No framework in between -- the whole surface is three
functions and a dispatch dict.

| Tool | Backed by |
|---|---|
| ``get_prediction`` | ``prediction-service`` GET /predictions/predict |
| ``get_sentiment_summary`` | ``sentiment-service`` GET /sentiments/symbol/{s}/average |
| ``search_news`` | Qdrant ``news_chunks`` top-k |

Every tool returns a JSON-serialisable dict and never raises: a failed tool must
come back as ``{"error": ...}`` so the model can say "I couldn't get that"
instead of the whole request 500ing. A degraded answer beats a dead endpoint.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Gemini function-calling declarations. Kept as plain dicts rather than SDK
# objects so they can be unit-tested and logged without importing the SDK.
TOOL_DECLARATIONS: list[dict[str, Any]] = [
    {
        "name": "get_prediction",
        "description": (
            "Get the LSTM model's next-candle price prediction and BUY/SELL/HOLD "
            "signal for a crypto trading pair. Use when the user asks about price "
            "direction, forecasts, or whether to buy or sell."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Trading pair, e.g. BTCUSDT or ETHUSDT",
                },
                "interval": {
                    "type": "string",
                    "description": "Candle interval, e.g. 1h, 4h, 1d. Defaults to 1h.",
                },
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_sentiment_summary",
        "description": (
            "Get the aggregate news sentiment score for a crypto trading pair over "
            "a recent period. Use when the user asks how the market feels, about "
            "sentiment, or about the mood around an asset."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Trading pair, e.g. BTCUSDT or ETHUSDT",
                },
                "days": {
                    "type": "integer",
                    "description": "Days to look back, 1-90. Defaults to 7.",
                },
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "search_news",
        "description": (
            "Search recent crypto news articles by meaning and return the most "
            "relevant ones with their headlines and links. Use this whenever the "
            "answer should reference actual news, or the user asks what is "
            "happening or why something moved."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What to search for, in natural language",
                },
                "symbol": {
                    "type": "string",
                    "description": "Optional trading pair to restrict results to",
                },
                "limit": {
                    "type": "integer",
                    "description": "How many articles to return, 1-10. Defaults to 5.",
                },
            },
            "required": ["query"],
        },
    },
]


def normalise_symbol(symbol: str | None) -> str:
    """Coerce whatever the model produced into a trading-pair symbol."""
    if not symbol:
        return "BTCUSDT"

    cleaned = symbol.upper().strip().replace("/", "").replace("-", "")
    if cleaned.endswith("USDT"):
        return cleaned
    if cleaned.endswith("USD"):
        return f"{cleaned[:-3]}USDT"
    return f"{cleaned}USDT"


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


async def get_prediction(symbol: str, interval: str = "1h") -> dict[str, Any]:
    """Fetch the LSTM prediction for a symbol from prediction-service."""
    symbol = normalise_symbol(symbol)
    url = f"{settings.prediction_service_url.rstrip('/')}/predictions/predict"

    try:
        async with httpx.AsyncClient(timeout=settings.tool_timeout) as client:
            response = await client.get(
                url, params={"symbol": symbol, "interval": interval}
            )
    except httpx.HTTPError as exc:
        logger.warning("get_prediction transport error: %s", exc)
        return {"error": f"prediction-service unreachable: {exc}", "symbol": symbol}

    if response.status_code != 200:
        detail = _error_detail(response)
        logger.warning("get_prediction %s -> %s", symbol, detail)
        return {"error": detail, "symbol": symbol, "status": response.status_code}

    data = response.json()
    # Trim to what the model needs; the full payload includes colours and emoji
    # strings that only bloat the prompt.
    return {
        "symbol": data.get("symbol", symbol),
        "interval": data.get("interval", interval),
        "current_price": data.get("current_price"),
        "predicted_price": data.get("predicted_price"),
        "price_change_percent": data.get("price_change_percent"),
        "signal": data.get("signal"),
        "sentiment_used": data.get("sentiment"),
        "timestamp": data.get("timestamp"),
    }


async def get_sentiment_summary(symbol: str, days: int = 7) -> dict[str, Any]:
    """Fetch aggregate sentiment for a symbol from sentiment-service."""
    symbol = normalise_symbol(symbol)
    days = max(1, min(int(days or 7), 90))
    base = settings.sentiment_service_url.rstrip("/")
    url = f"{base}/sentiments/symbol/{symbol}/average"

    try:
        async with httpx.AsyncClient(timeout=settings.tool_timeout) as client:
            response = await client.get(url, params={"days": days})
    except httpx.HTTPError as exc:
        logger.warning("get_sentiment_summary transport error: %s", exc)
        return {"error": f"sentiment-service unreachable: {exc}", "symbol": symbol}

    if response.status_code == 404:
        # Not an error worth alarming the model about -- it just means no
        # articles were collected for this pair in the window.
        return {
            "symbol": symbol,
            "period_days": days,
            "sample_count": 0,
            "note": "No sentiment data collected for this symbol in the period.",
        }

    if response.status_code != 200:
        detail = _error_detail(response)
        logger.warning("get_sentiment_summary %s -> %s", symbol, detail)
        return {"error": detail, "symbol": symbol, "status": response.status_code}

    data = response.json()
    average = data.get("average_sentiment")

    return {
        "symbol": symbol,
        "period_days": data.get("period_days", days),
        "sample_count": data.get("sample_count"),
        "average_sentiment": average,
        # The raw float means little to a language model; the bucket is what it
        # should actually reason with, using the same thresholds as the evals.
        "sentiment_bucket": _bucket(average),
    }


async def search_news(
    query: str, symbol: str | None = None, limit: int = 5
) -> dict[str, Any]:
    """Semantic search over the Qdrant ``news_chunks`` collection."""
    limit = max(1, min(int(limit or 5), 10))
    normalised = normalise_symbol(symbol) if symbol else None

    try:
        # Loading the encoder and embedding the query are blocking CPU work.
        # Run them in a worker thread: on the event loop the first call stalls
        # every other tool in the same round behind a model load.
        hits = await asyncio.to_thread(_search_sync, query, normalised, limit)
    except _CollectionMissing as exc:
        return {"error": str(exc), "results": []}
    except Exception as exc:  # noqa: BLE001 - tools must degrade, not raise
        logger.warning("search_news failed: %s", exc, exc_info=True)
        return {"error": f"news search unavailable: {exc}", "results": []}

    return {
        "query": query,
        "symbol": normalised,
        "count": len(hits),
        "results": [
            {
                "title": hit["title"],
                "link": hit["link"],
                "symbol": hit["symbol"],
                "published_at": hit["published_at"],
                "summary": (hit.get("content") or "")[:300],
                "relevance": round(hit["score"], 3),
            }
            for hit in hits
        ],
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _CollectionMissing(RuntimeError):
    """Raised when the news index has not been built yet."""


def _search_sync(
    query: str, symbol: str | None, limit: int
) -> list[dict[str, Any]]:
    """Blocking half of ``search_news``, run in a worker thread."""
    from app.embeddings import build_embedder
    from app.qdrant_store import build_client, search

    embedder = _get_embedder(build_embedder)
    client = _get_qdrant(build_client)

    if not client.collection_exists(settings.qdrant_collection):
        raise _CollectionMissing(
            f"Collection '{settings.qdrant_collection}' does not exist. "
            "Run scripts/ingest_news.py first."
        )

    return search(
        client,
        settings.qdrant_collection,
        embedder.embed_query(query),
        limit=limit,
        symbol=symbol,
    )


def _bucket(score: float | None) -> str | None:
    """Bucket a sentiment score, matching the thresholds used in the evals."""
    if score is None:
        return None
    if score > 0.2:
        return "bullish"
    if score < -0.2:
        return "bearish"
    return "neutral"


def _error_detail(response: httpx.Response) -> str:
    """
    Pull a readable message out of a FastAPI error response.

    ``detail`` is often a nested dict rather than a string -- prediction-service
    returns the whole buffer state that way. Stringifying it wholesale puts a
    Python repr in front of the user and wastes prompt tokens, so dig out the
    human-readable field.
    """
    try:
        payload = response.json()
    except Exception:  # noqa: BLE001
        return response.text[:300] or f"HTTP {response.status_code}"

    detail = payload.get("detail", payload)
    if isinstance(detail, dict):
        detail = detail.get("message") or detail.get("error") or detail
    return str(detail)[:300]


# The embedder and Qdrant client are expensive to build and safe to share, so
# they are created once per process rather than per tool call.
_embedder = None
_qdrant_client = None


def _get_embedder(factory: Callable[..., Any]):
    """Lazily build the shared embedder."""
    global _embedder
    if _embedder is None:
        _embedder = factory(allow_fallback=settings.embedding_allow_fallback)
    return _embedder


def _get_qdrant(factory: Callable[..., Any]):
    """Lazily build the shared Qdrant client."""
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = factory(
            url=settings.qdrant_url,
            path=settings.qdrant_path,
            api_key=settings.qdrant_api_key,
            timeout=settings.qdrant_timeout,
        )
    return _qdrant_client


def warmup() -> None:
    """
    Build the embedder and Qdrant client ahead of the first request.

    Blocking work -- call it from a thread. Called at startup so a user never
    waits on a cold model load mid-conversation.
    """
    from app.embeddings import build_embedder
    from app.qdrant_store import build_client

    _get_embedder(build_embedder)
    _get_qdrant(build_client)


def reset_clients() -> None:
    """Drop the cached embedder and Qdrant client. Used by tests."""
    global _embedder, _qdrant_client
    if _qdrant_client is not None:
        try:
            _qdrant_client.close()
        except Exception:  # noqa: BLE001
            pass
    _embedder = None
    _qdrant_client = None


# Dispatch table used by the agent loop.
TOOL_REGISTRY: dict[str, Callable[..., Awaitable[dict[str, Any]]]] = {
    "get_prediction": get_prediction,
    "get_sentiment_summary": get_sentiment_summary,
    "search_news": search_news,
}


async def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """
    Execute one tool by name.

    Unknown names and bad arguments come back as ``{"error": ...}`` rather than
    raising, because both are things a language model does routinely and neither
    should take the request down.
    """
    handler = TOOL_REGISTRY.get(name)
    if handler is None:
        return {"error": f"unknown tool '{name}'"}

    try:
        return await handler(**arguments)
    except TypeError as exc:
        logger.warning("Bad arguments for %s: %s", name, exc)
        return {"error": f"invalid arguments for {name}: {exc}"}
    except Exception as exc:  # noqa: BLE001 - never let a tool kill the turn
        logger.error("Tool %s raised: %s", name, exc, exc_info=True)
        return {"error": f"{name} failed: {exc}"}

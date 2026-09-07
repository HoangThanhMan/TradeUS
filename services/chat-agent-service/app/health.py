"""
Health check endpoints for Chat Agent Service.

The agent depends on four things it does not own — two HTTP services, a vector
store and an LLM — and it degrades rather than fails when any of them is down.
That makes "is it up?" the wrong question, so these endpoints report *which*
dependencies are actually answering, not just an aggregate boolean.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["Health"])


async def _check_http_service(url: str, path: str) -> str:
    """Probe a downstream service's own health endpoint."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{url.rstrip('/')}{path}")
        return "healthy" if response.status_code == 200 else "unhealthy"
    except Exception:  # noqa: BLE001 - health checks never raise
        return "unreachable"


def _check_qdrant() -> dict[str, Any]:
    """
    Report whether the news collection exists and how many points it holds.

    Reuses the client the tools already hold rather than opening its own. In
    embedded mode Qdrant takes an exclusive lock on the storage folder, so a
    second client would fail — and a health check that reports a dependency as
    broken *because the health check itself broke it* is worse than useless.
    """
    try:
        from app.qdrant_store import build_client
        from app.tools import _get_qdrant

        client = _get_qdrant(build_client)
        if not client.collection_exists(settings.qdrant_collection):
            return {
                "status": "empty",
                "detail": f"collection '{settings.qdrant_collection}' not found",
            }
        return {
            "status": "healthy",
            "collection": settings.qdrant_collection,
            "points": client.count(settings.qdrant_collection).count,
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": "unreachable", "detail": f"{type(exc).__name__}: {exc}"}


def describe_agent_backend() -> dict[str, Any]:
    """
    Report which backend will actually answer, not just which is configured.

    The agent silently falls back from Gemini to the rule-based planner, so
    without this the difference is invisible from outside.
    """
    info: dict[str, Any] = {
        "configured": settings.agent_backend,
        "model": settings.gemini_model,
        "max_tool_rounds": settings.max_tool_rounds,
    }
    if settings.agent_backend == "gemini" and not settings.gemini_api_key:
        info["effective"] = "rules"
        info["reason"] = "no GEMINI_API_KEY configured"
    else:
        info["effective"] = settings.agent_backend
    return info


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """Service health plus the state of every dependency the agent uses."""
    prediction = await _check_http_service(settings.prediction_service_url, "/health")
    sentiment = await _check_http_service(settings.sentiment_service_url, "/health")
    qdrant = _check_qdrant()

    # Degraded, not unhealthy: the agent answers with whatever tools respond.
    all_healthy = (
        prediction == "healthy"
        and sentiment == "healthy"
        and qdrant["status"] == "healthy"
    )

    return {
        "status": "ok" if all_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "service": "healthy",
            "prediction_service": prediction,
            "sentiment_service": sentiment,
            "qdrant": qdrant,
        },
        "agent_backend": describe_agent_backend(),
    }


@router.get("/ready")
async def readiness_check() -> dict[str, Any]:
    """
    Readiness for traffic.

    Deliberately lenient: the agent's whole design is to degrade, so it is ready
    as long as it can serve a request at all. Tool availability shows up in
    /health, not here.
    """
    qdrant = _check_qdrant()
    return {
        "status": "ready",
        "qdrant": qdrant["status"],
        "agent_backend": describe_agent_backend()["effective"],
    }


@router.get("/live")
async def liveness_check() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "alive"}

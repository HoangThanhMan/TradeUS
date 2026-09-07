"""
Health check endpoints for Sentiment Service.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.config import settings
from app.database import Database

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """
    Health check endpoint.
    Returns service health status and metadata.
    """
    db_healthy = await Database.health_check()
    
    # Check RabbitMQ health if enabled
    rabbitmq_status = "disabled"
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq import RabbitMQConnection
            rabbitmq_health = await RabbitMQConnection.health_check()
            rabbitmq_status = rabbitmq_health.get("status", "unknown")
        except Exception:
            rabbitmq_status = "unhealthy"
    
    all_healthy = db_healthy and (
        rabbitmq_status in ("healthy", "disabled")
    )

    return {
        "status": "ok" if all_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "service": "healthy",
            "mongodb": "healthy" if db_healthy else "unhealthy",
            "rabbitmq": rabbitmq_status,
        },
        "sentiment_backend": describe_sentiment_backend(),
    }


def describe_sentiment_backend() -> dict[str, Any]:
    """
    Report which backend will actually answer sentiment requests.

    Worth surfacing: the service falls back silently between backends, so
    without this there is no way to tell from outside whether answers are
    coming from Gemini, the local model, or the keyword mock.
    """
    info: dict[str, Any] = {
        "configured": settings.sentiment_backend,
        "use_mock_llm": settings.use_mock_llm,
    }

    if settings.use_mock_llm or not settings.gemini_api_key:
        info["effective"] = "mock"
        return info

    if settings.sentiment_backend != "local":
        info["effective"] = "gemini"
        return info

    info["variant"] = settings.local_model_variant
    try:
        from app.ml.local_model import get_local_model

        model = get_local_model()
        info["local"] = model.describe()
        info["effective"] = (
            f"local:{settings.local_model_variant}"
            if model.is_loaded
            else "gemini (local model not loaded)"
        )
    except Exception as exc:  # noqa: BLE001 - health must never raise
        info["effective"] = "gemini (local backend unavailable)"
        info["local_error"] = f"{type(exc).__name__}: {exc}"

    return info


@router.get("/ready")
async def readiness_check() -> dict[str, Any]:
    """
    Readiness check endpoint for Kubernetes.
    Indicates if the service is ready to receive traffic.
    """
    db_healthy = await Database.health_check()
    
    rabbitmq_ready = True
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq import RabbitMQConnection
            rabbitmq_health = await RabbitMQConnection.health_check()
            rabbitmq_ready = rabbitmq_health.get("connected", False)
        except Exception:
            rabbitmq_ready = False
    
    is_ready = db_healthy and rabbitmq_ready
    
    return {
        "status": "ready" if is_ready else "not_ready",
        "mongodb": "ready" if db_healthy else "not_ready",
        "rabbitmq": "ready" if rabbitmq_ready else "not_ready",
    }


@router.get("/live")
async def liveness_check() -> dict[str, str]:
    """
    Liveness check endpoint for Kubernetes.
    Indicates if the service is alive.
    """
    return {"status": "alive"}

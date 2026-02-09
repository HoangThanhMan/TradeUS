"""
Health check endpoints for Symbol Alert Service.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check() -> dict[str, Any]:
    rabbitmq_status = "disabled"
    redis_status = "unknown"

    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq.connection import RabbitMQConnection
            h = await RabbitMQConnection.health_check()
            rabbitmq_status = h.get("status", "unknown")
        except Exception:
            rabbitmq_status = "unhealthy"

    try:
        from app.redis import redis_client
        if redis_client:
            await redis_client.ping()
            redis_status = "healthy"
        else:
            redis_status = "disconnected"
    except Exception:
        redis_status = "unhealthy"

    all_ok = rabbitmq_status in ("healthy", "disabled") and redis_status == "healthy"

    return {
        "status": "ok" if all_ok else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "service": "healthy",
            "rabbitmq": rabbitmq_status,
            "redis": redis_status,
        },
    }

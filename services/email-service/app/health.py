"""
Health check endpoints for Email Service.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint."""
    rabbitmq_status = "disabled"
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq.connection import RabbitMQConnection

            health = await RabbitMQConnection.health_check()
            rabbitmq_status = health.get("status", "unknown")
        except Exception:
            rabbitmq_status = "unhealthy"

    all_healthy = rabbitmq_status in ("healthy", "disabled")

    return {
        "status": "ok" if all_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "service": "healthy",
            "rabbitmq": rabbitmq_status,
            "email_strategy": settings.email_strategy,
        },
    }

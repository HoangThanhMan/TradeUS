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
    }


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

"""
Health check endpoints for Prediction Service.
"""

from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
@router.get("/")
async def health_check():
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "service": settings.service_name,
        "version": settings.version,
    }


@router.get("/ready")
async def readiness_check():
    """
    Readiness check endpoint.
    Checks if all dependencies are available.
    """
    from app.ml.model_manager import model_manager
    from app.rabbitmq import RabbitMQConnection
    
    checks = {
        "model_loaded": model_manager.is_loaded,
        "rabbitmq_connected": RabbitMQConnection.is_connected(),
    }
    
    all_ready = all(checks.values())
    
    return {
        "status": "ready" if all_ready else "not_ready",
        "checks": checks,
    }


@router.get("/live")
async def liveness_check():
    """Liveness check endpoint."""
    return {"status": "alive"}

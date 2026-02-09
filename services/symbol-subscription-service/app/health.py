"""
Health check endpoints for Symbol Subscription Service.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.config import settings
from app.database import Database

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check() -> dict[str, Any]:
    db_healthy = await Database.health_check()
    return {
        "status": "ok" if db_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "service": "healthy",
            "mongodb": "healthy" if db_healthy else "unhealthy",
        },
    }

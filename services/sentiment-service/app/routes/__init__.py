"""
API routes package for Sentiment Service.
"""

from app.routes.collector_routes import router as collector_router
from app.routes.sentiment_routes import router as sentiment_router

__all__ = ["collector_router", "sentiment_router"]

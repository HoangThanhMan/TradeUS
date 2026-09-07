"""
TradeX Chat Agent Service

RAG + tool-calling agent for the market chatbot. Owns retrieval over the news
index and orchestrates the three tools that read the platform's live data.
"""

import logging
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.health import router as health_router
from app.routes.chat_routes import router as chat_router


def setup_logging() -> None:
    """Configure logging based on settings."""
    logging.basicConfig(
        level=getattr(logging, settings.log_level),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Log the resolved configuration on startup, tear down clients on exit."""
    logger = logging.getLogger(__name__)
    logger.info(f"Starting {settings.service_name} v{settings.version}")
    logger.info(f"Agent backend: {settings.agent_backend}")
    logger.info(f"Embedding backend: {settings.embedding_backend}")
    logger.info(
        f"Qdrant: {settings.qdrant_path or settings.qdrant_url} "
        f"({settings.qdrant_collection})"
    )
    logger.info(f"prediction-service: {settings.prediction_service_url}")
    logger.info(f"sentiment-service: {settings.sentiment_service_url}")

    if settings.agent_backend == "gemini" and not settings.gemini_api_key:
        logger.warning(
            "AGENT_BACKEND=gemini but no GEMINI_API_KEY is set — every request "
            "will use the rule-based fallback."
        )

    # Build the embedder and Qdrant client up front. Otherwise the first user
    # request pays a ~20s model load inside search_news, which reads as a hung
    # chatbot. Never fatal: the tool reports its own failure if this did not
    # work, and the agent answers with the other two.
    if settings.warmup_on_startup:
        import asyncio

        try:
            from app.tools import warmup

            await asyncio.to_thread(warmup)
            logger.info("Retrieval stack warm")
        except Exception as e:
            logger.warning(f"Retrieval warmup failed, will retry on demand: {e}")

    yield

    logger.info(f"Shutting down {settings.service_name}")
    from app.tools import reset_clients

    reset_clients()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    setup_logging()

    app = FastAPI(
        title="TradeX Chat Agent Service",
        description=(
            "Retrieval-augmented market assistant with tool calling over "
            "prediction-service, sentiment-service and a Qdrant news index."
        ),
        version=settings.version,
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url="/redoc" if settings.environment != "production" else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(chat_router)

    @app.get("/", tags=["Root"])
    async def root() -> dict[str, Any]:
        """Service identity."""
        return {
            "service": settings.service_name,
            "version": settings.version,
            "environment": settings.environment,
            "docs": "/docs",
        }

    @app.get("/info", tags=["Root"])
    async def info() -> dict[str, Any]:
        """Capabilities and configuration, for debugging a deployed instance."""
        from app.tools import TOOL_DECLARATIONS

        return {
            "features": ["tool-calling", "news-retrieval", "sse-streaming"],
            "tools": [
                {"name": tool["name"], "description": tool["description"]}
                for tool in TOOL_DECLARATIONS
            ],
            "endpoints": {
                "chat": "POST /chat (SSE)",
                "chat_debug": "POST /chat/debug (JSON + tool trace)",
                "health": "GET /health",
            },
            "config": {
                "agent_backend": settings.agent_backend,
                "embedding_backend": settings.embedding_backend,
                "max_tool_rounds": settings.max_tool_rounds,
                "qdrant_collection": settings.qdrant_collection,
            },
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )

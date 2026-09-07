"""
Trade-X Sentiment Analysis Service

A FastAPI-based service for analyzing market sentiment from various sources
including news, social media, and financial reports.
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Database
from app.health import router as health_router
from app.routes import collector_router, sentiment_router
from app.scheduler import get_scheduler


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
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    logger = logging.getLogger(__name__)
    logger.info(f"Starting {settings.service_name} v{settings.version}")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Log level: {settings.log_level}")

    # Initialize MongoDB connection
    try:
        await Database.connect()
        logger.info("MongoDB connection established")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        # Continue without database in development for testing
        if settings.environment == "production":
            raise

    # Initialize RabbitMQ connection
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq import RabbitMQConnection, get_consumer, get_publisher
            
            await RabbitMQConnection.connect()
            logger.info("RabbitMQ connection established")
            
            # Initialize publisher
            await get_publisher()
            logger.info("RabbitMQ publisher initialized")
            
            # Start consumers if enabled
            if settings.enable_rabbitmq_consumer:
                consumer = await get_consumer()
                await consumer.start()
                logger.info("RabbitMQ consumers started")
                
        except Exception as e:
            logger.error(f"Failed to initialize RabbitMQ: {e}")
            if settings.environment == "production":
                raise

    # Warm up the local sentiment model so the first request does not pay the
    # model load. Never fatal: the service falls back to Gemini if this fails.
    if settings.sentiment_backend == "local" and settings.local_model_warmup:
        try:
            from app.ml.local_model import get_local_model

            model = get_local_model()
            if model.load():
                logger.info(
                    f"Local sentiment model ready "
                    f"(variant={settings.local_model_variant})"
                )
            else:
                logger.error(
                    f"Local sentiment model failed to load ({model.load_error}); "
                    f"falling back to the Gemini backend"
                )
        except Exception as e:
            logger.error(f"Local sentiment model warmup failed: {e}")

    # Initialize and start the collector scheduler
    if settings.enable_scheduler:
        try:
            scheduler = await get_scheduler()
            await scheduler.start()
            logger.info(
                f"Collector scheduler started. "
                f"Interval: {settings.collection_interval_seconds}s "
                f"({settings.collection_interval_seconds // 60} minutes)"
            )
        except Exception as e:
            logger.error(f"Failed to start collector scheduler: {e}")
            if settings.environment == "production":
                raise

    yield

    # Shutdown
    logger.info(f"Shutting down {settings.service_name}")
    
    # Stop the collector scheduler
    if settings.enable_scheduler:
        try:
            scheduler = await get_scheduler()
            await scheduler.stop()
            logger.info("Collector scheduler stopped")
        except Exception as e:
            logger.error(f"Error stopping collector scheduler: {e}")
    
    # Close RabbitMQ
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq import RabbitMQConnection, get_consumer
            
            if settings.enable_rabbitmq_consumer:
                consumer = await get_consumer()
                await consumer.stop()
            
            await RabbitMQConnection.close()
            logger.info("RabbitMQ connection closed")
        except Exception as e:
            logger.error(f"Error closing RabbitMQ: {e}")
    
    await Database.disconnect()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    setup_logging()

    app = FastAPI(
        title="Trade-X Sentiment Service",
        description="AI-powered market sentiment analysis service",
        version=settings.version,
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url="/redoc" if settings.environment != "production" else None,
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(health_router)
    app.include_router(sentiment_router)
    app.include_router(collector_router)

    return app


# Create app instance
app = create_app()


@app.get("/", tags=["Root"])
async def root() -> dict[str, Any]:
    """
    Root endpoint returning service information.
    """
    return {
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
        "docs": "/docs" if settings.environment != "production" else None,
    }


@app.get("/info", tags=["Root"])
async def info() -> dict[str, Any]:
    """
    Detailed service information.
    """
    # Check database health
    db_healthy = await Database.health_check()
    
    # Check collector configuration
    reddit_configured = bool(settings.reddit_client_id and settings.reddit_client_secret)
    
    return {
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
        "features": {
            "sentiment_analysis": "active",
            "llm_provider": "gemini" if not settings.use_mock_llm else "mock",
            "database": "mongodb",
            "reddit_collector": "configured" if reddit_configured else "mock",
            "yahoo_collector": "active",
        },
        "status": {
            "database": "healthy" if db_healthy else "disconnected",
        },
        "endpoints": {
            "health": "/health",
            "ready": "/ready",
            "live": "/live",
            "docs": "/docs",
            "sentiments": "/sentiments",
            "collect": "/collect",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug or settings.environment == "development",
        log_level=settings.log_level.lower(),
    )

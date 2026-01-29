"""
Trade-X Prediction Service

A FastAPI-based service for real-time cryptocurrency price predictions
using LSTM models with price and sentiment data.
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.health import router as health_router
from app.routes import prediction_router
from app.ml import model_manager


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

    # Load ML model
    try:
        model_loaded = model_manager.load_model(settings.model_path)
        if model_loaded:
            logger.info("ML model loaded successfully")
        else:
            logger.warning("ML model not loaded - predictions will be unavailable")
    except Exception as e:
        logger.error(f"Failed to load ML model: {e}")

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

    yield

    # Shutdown
    logger.info(f"Shutting down {settings.service_name}")
    
    # Stop RabbitMQ consumers
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq import RabbitMQConnection, get_consumer
            
            consumer = await get_consumer()
            await consumer.stop()
            await RabbitMQConnection.close()
            logger.info("RabbitMQ connections closed")
        except Exception as e:
            logger.error(f"Error closing RabbitMQ: {e}")

    # Close sentiment client
    try:
        from app.services import get_sentiment_client
        client = get_sentiment_client()
        await client.close()
    except Exception:
        pass


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    setup_logging()
    
    app = FastAPI(
        title="Trade-X Prediction Service",
        description="""
        Real-time cryptocurrency price prediction service using LSTM models.
        
        ## Features
        
        * **Real-time Predictions**: Get price predictions based on LSTM model
        * **Sentiment Integration**: Incorporates market sentiment analysis
        * **Multiple Intervals**: Support for different time frames (1h, 4h, 1d)
        * **Trading Signals**: Provides buy/sell/hold signals with confidence
        
        ## Data Flow
        
        1. Receives price data from collector-price service via RabbitMQ
        2. Receives sentiment data from sentiment-service via RabbitMQ
        3. Combines both to generate predictions
        4. Publishes predictions back to RabbitMQ for real-time updates
        """,
        version=settings.version,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )
    
    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include routers
    app.include_router(health_router)
    app.include_router(prediction_router)  # No prefix, routes already have /predictions prefix
    
    @app.get("/")
    async def root():
        """Root endpoint with service info."""
        return {
            "service": settings.service_name,
            "version": settings.version,
            "status": "running",
            "model_loaded": model_manager.is_loaded,
            "docs": "/docs",
        }
    
    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )

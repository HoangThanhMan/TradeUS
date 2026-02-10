"""
Trade-X Symbol Alert Service

Monitors sentiment alerts from RabbitMQ and dispatches notifications
to subscribed users with Redis-based cooldown to prevent spam.
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.health import router as health_router
from app.routes import alert_router


def setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger = logging.getLogger(__name__)
    logger.info(f"Starting {settings.service_name} v{settings.version}")

    # Connect Redis
    try:
        from app.redis import connect_redis
        await connect_redis()
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")

    # Start RabbitMQ consumer
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq.connection import RabbitMQConnection
            from app.rabbitmq.consumer import get_consumer

            await RabbitMQConnection.connect()
            consumer = get_consumer()
            await consumer.start()
        except Exception as e:
            logger.error(f"Failed to start RabbitMQ consumer: {e}")

    yield

    # Shutdown
    logger.info("Shutting down Symbol Alert Service")
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq.connection import RabbitMQConnection
            from app.rabbitmq.consumer import get_consumer

            await get_consumer().stop()
            await RabbitMQConnection.close()
        except Exception:
            pass

    try:
        from app.redis import close_redis
        await close_redis()
    except Exception:
        pass


setup_logging()

app = FastAPI(
    title="Trade-X Symbol Alert Service",
    description="Real-time market alerts with Redis cooldown",
    version=settings.version,
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
app.include_router(alert_router)

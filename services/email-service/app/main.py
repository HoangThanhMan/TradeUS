"""
Trade-X Email Service

Asynchronous email delivery service powered by RabbitMQ.
Uses Strategy Pattern for flexible email provider switching.
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.health import router as health_router
from app.routes import email_router


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
    logger.info(f"Email strategy: {settings.email_strategy}")

    # Initialize RabbitMQ consumer
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq.connection import RabbitMQConnection
            from app.rabbitmq.consumer import get_consumer

            await RabbitMQConnection.connect()
            consumer = get_consumer()
            await consumer.start()
            logger.info("RabbitMQ consumer started")
        except Exception as e:
            logger.error(f"Failed to start RabbitMQ consumer: {e}")

    yield

    # Shutdown
    logger.info("Shutting down Email Service")
    if settings.enable_rabbitmq:
        try:
            from app.rabbitmq.connection import RabbitMQConnection
            from app.rabbitmq.consumer import get_consumer

            consumer = get_consumer()
            await consumer.stop()
            await RabbitMQConnection.close()
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")


setup_logging()

app = FastAPI(
    title="Trade-X Email Service",
    description="Asynchronous email delivery via RabbitMQ with Strategy Pattern",
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
app.include_router(email_router)

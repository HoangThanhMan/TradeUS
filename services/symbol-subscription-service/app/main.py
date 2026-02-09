"""
Trade-X Symbol Subscription Service

Manages user subscriptions to trading symbols (watchlists).
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Database
from app.health import router as health_router
from app.routes import subscription_router


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

    # Connect MongoDB
    try:
        await Database.connect()
        logger.info("MongoDB connection established")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        if settings.environment == "production":
            raise

    yield

    # Shutdown
    logger.info("Shutting down Symbol Subscription Service")
    await Database.disconnect()


setup_logging()

app = FastAPI(
    title="Trade-X Symbol Subscription Service",
    description="Manage user watchlists / symbol subscriptions",
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
app.include_router(subscription_router)

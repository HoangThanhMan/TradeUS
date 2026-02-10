"""
Redis client module – used for alert cooldown tracking.
"""

import logging

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

redis_client: aioredis.Redis | None = None


async def connect_redis() -> aioredis.Redis:
    """Create and return the Redis connection."""
    global redis_client
    if redis_client is None:
        logger.info(f"Connecting to Redis at {settings.redis_url}")
        redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
        await redis_client.ping()
        logger.info("Connected to Redis")
    return redis_client


async def close_redis() -> None:
    global redis_client
    if redis_client:
        await redis_client.aclose()
        redis_client = None
        logger.info("Redis connection closed")

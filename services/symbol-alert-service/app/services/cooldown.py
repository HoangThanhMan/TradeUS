"""
Cooldown manager using Redis.

Prevents sending duplicate alerts to the same user for the same symbol
within a configurable time window.
"""

import logging

from app.config import settings

logger = logging.getLogger(__name__)

COOLDOWN_PREFIX = "alert:cooldown"


async def is_on_cooldown(user_id: str, symbol: str) -> bool:
    """Check if an alert for this user+symbol is still in cooldown."""
    from app.redis import redis_client

    if redis_client is None:
        return False

    key = f"{COOLDOWN_PREFIX}:{user_id}:{symbol}"
    return await redis_client.exists(key) > 0


async def set_cooldown(user_id: str, symbol: str) -> None:
    """Set a cooldown marker in Redis with TTL."""
    from app.redis import redis_client

    if redis_client is None:
        return

    key = f"{COOLDOWN_PREFIX}:{user_id}:{symbol}"
    await redis_client.setex(key, settings.alert_cooldown_seconds, "1")
    logger.debug(f"Cooldown set for {user_id}:{symbol} ({settings.alert_cooldown_seconds}s)")

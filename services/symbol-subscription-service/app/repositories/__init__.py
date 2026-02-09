"""
Repository layer for Subscription collection.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from app.database import Database

logger = logging.getLogger(__name__)

COLLECTION = "subscriptions"


class SubscriptionRepository:
    """CRUD operations for the subscriptions collection."""

    @staticmethod
    def _col():
        return Database.get_collection(COLLECTION)

    @classmethod
    async def subscribe(cls, user_id: str, symbol: str) -> dict:
        """
        Subscribe a user to a symbol.
        Returns the subscription document. Raises on duplicate.
        """
        doc = {
            "user_id": user_id,
            "symbol": symbol.upper(),
            "created_at": datetime.now(timezone.utc),
        }
        result = await cls._col().insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return doc

    @classmethod
    async def unsubscribe(cls, user_id: str, symbol: str) -> bool:
        """Remove a subscription. Returns True if deleted."""
        result = await cls._col().delete_one({"user_id": user_id, "symbol": symbol.upper()})
        return result.deleted_count > 0

    @classmethod
    async def get_user_subscriptions(cls, user_id: str) -> list[dict]:
        """Get all symbols a user is subscribed to."""
        cursor = cls._col().find({"user_id": user_id}).sort("created_at", -1)
        docs = await cursor.to_list(length=100)
        for d in docs:
            d["_id"] = str(d["_id"])
        return docs

    @classmethod
    async def get_subscribers_by_symbol(cls, symbol: str) -> list[str]:
        """Get all user_ids subscribed to a given symbol."""
        cursor = cls._col().find({"symbol": symbol.upper()}, {"user_id": 1})
        docs = await cursor.to_list(length=10000)
        return [d["user_id"] for d in docs]

    @classmethod
    async def is_subscribed(cls, user_id: str, symbol: str) -> bool:
        doc = await cls._col().find_one({"user_id": user_id, "symbol": symbol.upper()})
        return doc is not None

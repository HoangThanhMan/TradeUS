"""
MongoDB connection manager for Symbol Subscription Service.
"""

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

logger = logging.getLogger(__name__)


class Database:
    _client: Optional[AsyncIOMotorClient] = None
    _database: Optional[AsyncIOMotorDatabase] = None

    @classmethod
    async def connect(cls) -> None:
        logger.info(f"Connecting to MongoDB at {settings.mongodb_url}")
        cls._client = AsyncIOMotorClient(
            settings.mongodb_url,
            maxPoolSize=10,
            minPoolSize=1,
            serverSelectionTimeoutMS=5000,
        )
        cls._database = cls._client[settings.mongodb_database]
        await cls._client.admin.command("ping")
        logger.info(f"Connected to MongoDB database: {settings.mongodb_database}")
        await cls._create_indexes()

    @classmethod
    async def disconnect(cls) -> None:
        if cls._client:
            cls._client.close()
            cls._client = None
            cls._database = None
            logger.info("MongoDB connection closed")

    @classmethod
    def get_database(cls) -> AsyncIOMotorDatabase:
        if cls._database is None:
            raise RuntimeError("Database not connected.")
        return cls._database

    @classmethod
    def get_collection(cls, name: str):
        return cls.get_database()[name]

    @classmethod
    async def _create_indexes(cls) -> None:
        try:
            col = cls.get_collection("subscriptions")
            # Unique compound index: each user subscribes to a symbol only once
            await col.create_index(
                [("user_id", 1), ("symbol", 1)], unique=True, name="idx_user_symbol_unique"
            )
            await col.create_index("user_id", name="idx_user_id")
            await col.create_index("symbol", name="idx_symbol")
            logger.info("Database indexes created")
        except Exception as e:
            logger.warning(f"Failed to create indexes: {e}")

    @classmethod
    async def health_check(cls) -> bool:
        try:
            if cls._client is None:
                return False
            await cls._client.admin.command("ping")
            return True
        except Exception:
            return False


async def get_database() -> AsyncIOMotorDatabase:
    return Database.get_database()

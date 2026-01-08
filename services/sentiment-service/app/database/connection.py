"""
MongoDB connection module using Motor async driver.
Provides database connection management and dependency injection.
"""

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

logger = logging.getLogger(__name__)


class Database:
    """
    MongoDB database connection manager.
    Handles connection lifecycle and provides access to the database.
    """
    
    _client: Optional[AsyncIOMotorClient] = None
    _database: Optional[AsyncIOMotorDatabase] = None

    @classmethod
    async def connect(cls) -> None:
        """
        Establish connection to MongoDB.
        Should be called during application startup.
        """
        try:
            logger.info(f"Connecting to MongoDB at {settings.mongodb_url}")
            cls._client = AsyncIOMotorClient(
                settings.mongodb_url,
                maxPoolSize=10,
                minPoolSize=1,
                serverSelectionTimeoutMS=5000,
            )
            cls._database = cls._client[settings.mongodb_database]
            
            # Verify connection by pinging the server
            await cls._client.admin.command("ping")
            logger.info(f"Successfully connected to MongoDB database: {settings.mongodb_database}")
            
            # Create indexes for the sentiments collection
            await cls._create_indexes()
            
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise

    @classmethod
    async def disconnect(cls) -> None:
        """
        Close MongoDB connection.
        Should be called during application shutdown.
        """
        if cls._client:
            logger.info("Closing MongoDB connection")
            cls._client.close()
            cls._client = None
            cls._database = None

    @classmethod
    def get_database(cls) -> AsyncIOMotorDatabase:
        """
        Get the database instance.
        
        Returns:
            AsyncIOMotorDatabase: The MongoDB database instance.
            
        Raises:
            RuntimeError: If database is not connected.
        """
        if cls._database is None:
            raise RuntimeError("Database not connected. Call Database.connect() first.")
        return cls._database

    @classmethod
    def get_collection(cls, collection_name: str):
        """
        Get a specific collection from the database.
        
        Args:
            collection_name: Name of the collection to retrieve.
            
        Returns:
            AsyncIOMotorCollection: The MongoDB collection.
        """
        return cls.get_database()[collection_name]

    @classmethod
    async def _create_indexes(cls) -> None:
        """Create necessary indexes for collections."""
        try:
            sentiments_collection = cls.get_collection("sentiments")
            
            # Create indexes for common query patterns
            await sentiments_collection.create_index("symbol")
            await sentiments_collection.create_index("published")
            await sentiments_collection.create_index("created_at")
            await sentiments_collection.create_index([("symbol", 1), ("published", -1)])
            
            logger.info("Database indexes created successfully")
        except Exception as e:
            logger.warning(f"Failed to create indexes: {e}")

    @classmethod
    async def health_check(cls) -> bool:
        """
        Check if database connection is healthy.
        
        Returns:
            bool: True if connected and responsive, False otherwise.
        """
        try:
            if cls._client is None:
                return False
            await cls._client.admin.command("ping")
            return True
        except Exception:
            return False


async def get_database() -> AsyncIOMotorDatabase:
    """
    Dependency injection function for FastAPI.
    
    Returns:
        AsyncIOMotorDatabase: The MongoDB database instance.
    """
    return Database.get_database()

"""
Repository layer for sentiment data persistence.
Handles all database operations for the 'sentiments' collection.
"""

import logging
from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.database import Database
from app.models.schemas import SentimentDocument, SentimentResponse

logger = logging.getLogger(__name__)


class SentimentRepository:
    """
    Repository for managing sentiment documents in MongoDB.
    Provides CRUD operations for the 'sentiments' collection.
    """
    
    COLLECTION_NAME = "sentiments"

    def __init__(self) -> None:
        """Initialize the repository."""
        self._collection: Optional[AsyncIOMotorCollection] = None

    @property
    def collection(self) -> AsyncIOMotorCollection:
        """
        Get the sentiments collection.
        
        Returns:
            AsyncIOMotorCollection: The MongoDB collection for sentiments.
        """
        if self._collection is None:
            self._collection = Database.get_collection(self.COLLECTION_NAME)
        return self._collection

    async def create(self, document: SentimentDocument) -> SentimentResponse:
        """
        Insert a new sentiment document into the database.
        
        Args:
            document: The sentiment document to insert.
            
        Returns:
            SentimentResponse: The created document with its ID.
            
        Raises:
            Exception: If the insertion fails.
        """
        try:
            doc_dict = document.model_dump()
            result = await self.collection.insert_one(doc_dict)
            
            logger.info(f"Created sentiment document with ID: {result.inserted_id}")
            
            return SentimentResponse(
                id=str(result.inserted_id),
                title=document.title,
                published=document.published,
                link=document.link,
                symbol=document.symbol,
                sentiment=document.sentiment,
                emotion=document.emotion,
                reason=document.reason,
                created_at=document.created_at
            )
        except Exception as e:
            logger.error(f"Failed to create sentiment document: {e}")
            raise

    async def find_by_id(self, document_id: str) -> Optional[SentimentResponse]:
        """
        Find a sentiment document by its ID.
        
        Args:
            document_id: The MongoDB ObjectId as a string.
            
        Returns:
            SentimentResponse if found, None otherwise.
        """
        try:
            doc = await self.collection.find_one({"_id": ObjectId(document_id)})
            if doc:
                return self._document_to_response(doc)
            return None
        except Exception as e:
            logger.error(f"Failed to find document by ID {document_id}: {e}")
            raise

    async def find_by_symbol(
        self,
        symbol: str,
        limit: int = 10,
        skip: int = 0
    ) -> list[SentimentResponse]:
        """
        Find sentiment documents by crypto symbol.
        
        Args:
            symbol: The crypto trading pair (e.g., BTCUSDT).
            limit: Maximum number of documents to return.
            skip: Number of documents to skip (for pagination).
            
        Returns:
            List of matching sentiment documents.
        """
        try:
            cursor = self.collection.find(
                {"symbol": symbol.upper()}
            ).sort("published", -1).skip(skip).limit(limit)
            
            documents = await cursor.to_list(length=limit)
            return [self._document_to_response(doc) for doc in documents]
        except Exception as e:
            logger.error(f"Failed to find documents by symbol {symbol}: {e}")
            raise

    async def find_recent(
        self,
        limit: int = 20,
        skip: int = 0
    ) -> list[SentimentResponse]:
        """
        Find the most recent sentiment documents.
        
        Args:
            limit: Maximum number of documents to return.
            skip: Number of documents to skip (for pagination).
            
        Returns:
            List of recent sentiment documents.
        """
        try:
            cursor = self.collection.find().sort(
                "created_at", -1
            ).skip(skip).limit(limit)
            
            documents = await cursor.to_list(length=limit)
            return [self._document_to_response(doc) for doc in documents]
        except Exception as e:
            logger.error(f"Failed to find recent documents: {e}")
            raise

    async def find_by_date_range(
        self,
        start_date: datetime,
        end_date: datetime,
        symbol: Optional[str] = None,
        limit: int = 100
    ) -> list[SentimentResponse]:
        """
        Find sentiment documents within a date range.
        
        Args:
            start_date: Start of the date range.
            end_date: End of the date range.
            symbol: Optional symbol filter.
            limit: Maximum number of documents to return.
            
        Returns:
            List of matching sentiment documents.
        """
        try:
            query: dict[str, Any] = {
                "published": {
                    "$gte": start_date,
                    "$lte": end_date
                }
            }
            if symbol:
                query["symbol"] = symbol.upper()
            
            cursor = self.collection.find(query).sort(
                "published", -1
            ).limit(limit)
            
            documents = await cursor.to_list(length=limit)
            return [self._document_to_response(doc) for doc in documents]
        except Exception as e:
            logger.error(f"Failed to find documents by date range: {e}")
            raise

    async def get_average_sentiment(
        self,
        symbol: str,
        days: int = 7
    ) -> Optional[dict[str, Any]]:
        """
        Calculate average sentiment for a symbol over a period.
        
        Args:
            symbol: The crypto trading pair.
            days: Number of days to look back.
            
        Returns:
            Dictionary with average sentiment and count, or None.
        """
        try:
            from datetime import timedelta
            
            start_date = datetime.utcnow() - timedelta(days=days)
            
            pipeline = [
                {
                    "$match": {
                        "symbol": symbol.upper(),
                        "created_at": {"$gte": start_date}
                    }
                },
                {
                    "$group": {
                        "_id": "$symbol",
                        "average_sentiment": {"$avg": "$sentiment"},
                        "count": {"$sum": 1},
                        "emotions": {"$push": "$emotion"}
                    }
                }
            ]
            
            result = await self.collection.aggregate(pipeline).to_list(length=1)
            
            if result:
                return {
                    "symbol": symbol.upper(),
                    "average_sentiment": round(result[0]["average_sentiment"], 4),
                    "sample_count": result[0]["count"],
                    "period_days": days
                }
            return None
        except Exception as e:
            logger.error(f"Failed to calculate average sentiment: {e}")
            raise

    async def delete_by_id(self, document_id: str) -> bool:
        """
        Delete a sentiment document by its ID.
        
        Args:
            document_id: The MongoDB ObjectId as a string.
            
        Returns:
            True if deleted, False if not found.
        """
        try:
            result = await self.collection.delete_one({"_id": ObjectId(document_id)})
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"Failed to delete document {document_id}: {e}")
            raise

    async def count_by_symbol(self, symbol: str) -> int:
        """
        Count documents for a specific symbol.
        
        Args:
            symbol: The crypto trading pair.
            
        Returns:
            Number of documents.
        """
        try:
            return await self.collection.count_documents({"symbol": symbol.upper()})
        except Exception as e:
            logger.error(f"Failed to count documents for {symbol}: {e}")
            raise

    def _document_to_response(self, doc: dict[str, Any]) -> SentimentResponse:
        """
        Convert a MongoDB document to a SentimentResponse.
        
        Args:
            doc: The MongoDB document dictionary.
            
        Returns:
            SentimentResponse: The converted response object.
        """
        return SentimentResponse(
            id=str(doc["_id"]),
            title=doc["title"],
            published=doc["published"],
            link=doc["link"],
            symbol=doc["symbol"],
            sentiment=doc["sentiment"],
            emotion=doc["emotion"],
            reason=doc["reason"],
            created_at=doc.get("created_at")
        )

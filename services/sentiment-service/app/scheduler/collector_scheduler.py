"""
Scheduler for automated news collection.
Runs periodic collection from all sources every configured interval.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

from app.config import settings
from app.collectors.reddit_collector import RedditCollector
from app.collectors.yahoo_collector import YahooCollector
from app.models.schemas import (
    CollectionResult,
    DataSourceType,
    RedditCollectionRequest,
    YahooCollectionRequest,
)

logger = logging.getLogger(__name__)


class CollectorScheduler:
    """
    Background scheduler for automated news collection.
    Periodically collects news from all configured sources and stores them
    in MongoDB with duplicate detection.
    """
    
    # Default collection interval: 5 minutes
    DEFAULT_INTERVAL_SECONDS = 5 * 60
    
    def __init__(self, interval_seconds: Optional[int] = None) -> None:
        """
        Initialize the scheduler.
        
        Args:
            interval_seconds: Collection interval in seconds. Defaults to 5 minutes.
        """
        self.interval_seconds = interval_seconds or self.DEFAULT_INTERVAL_SECONDS
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._reddit_collector: Optional[RedditCollector] = None
        self._yahoo_collector: Optional[YahooCollector] = None
        
    def _get_reddit_collector(self) -> Optional[RedditCollector]:
        """Get Reddit collector if configured."""
        if self._reddit_collector is None:
            if settings.reddit_client_id and settings.reddit_client_secret:
                self._reddit_collector = RedditCollector()
            else:
                logger.info("Reddit credentials not configured, skipping Reddit collection")
        return self._reddit_collector
    
    def _get_yahoo_collector(self) -> YahooCollector:
        """Get Yahoo collector."""
        if self._yahoo_collector is None:
            self._yahoo_collector = YahooCollector()
        return self._yahoo_collector
    
    async def start(self) -> None:
        """Start the background scheduler."""
        if self._running:
            logger.warning("Scheduler is already running")
            return
            
        self._running = True
        self._task = asyncio.create_task(self._run_scheduler())
        logger.info(
            f"Collector scheduler started. "
            f"Collection interval: {self.interval_seconds} seconds ({self.interval_seconds // 60} minutes)"
        )
    
    async def stop(self) -> None:
        """Stop the background scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Collector scheduler stopped")
    
    async def _run_scheduler(self) -> None:
        """Main scheduler loop."""
        # Wait a bit before first collection to let the app fully start
        await asyncio.sleep(10)
        
        while self._running:
            try:
                logger.info("=" * 50)
                logger.info("Starting scheduled news collection...")
                
                results = await self.collect_all()
                
                # Log summary
                total_collected = sum(r.collected_count for r in results)
                total_new = sum(r.new_count for r in results)
                total_analyzed = sum(r.analyzed_count for r in results)
                
                logger.info(
                    f"Scheduled collection complete: "
                    f"{total_collected} collected, {total_new} new, {total_analyzed} analyzed"
                )
                logger.info("=" * 50)
                
            except Exception as e:
                logger.error(f"Error during scheduled collection: {e}")
            
            # Wait for next interval
            await asyncio.sleep(self.interval_seconds)
    
    async def collect_all(
        self,
        analyze_immediately: Optional[bool] = None,
        limit: Optional[int] = None
    ) -> list[CollectionResult]:
        """
        Collect news from all available sources.
        
        This method collects news from Reddit and Yahoo Finance, stores them in MongoDB,
        and ensures no duplicates are saved by checking source_id.
        
        Args:
            analyze_immediately: Whether to analyze collected news immediately. Defaults to config.
            limit: Maximum items to collect per source. Defaults to config.
            
        Returns:
            List of CollectionResult for each source.
        """
        results: list[CollectionResult] = []
        collection_time = datetime.utcnow()
        
        # Use config defaults if not specified
        if analyze_immediately is None:
            analyze_immediately = settings.collection_analyze_immediately
        if limit is None:
            limit = settings.collection_limit
        
        logger.info(f"[{collection_time.isoformat()}] Starting collection from all sources...")
        
        # Collect from Reddit
        reddit_result = await self._collect_reddit(analyze_immediately, limit)
        if reddit_result:
            results.append(reddit_result)
            await self._publish_collection_result(reddit_result)
        
        # Collect from Yahoo
        yahoo_result = await self._collect_yahoo(analyze_immediately, limit)
        if yahoo_result:
            results.append(yahoo_result)
            await self._publish_collection_result(yahoo_result)
        
        return results
    
    async def _collect_reddit(
        self,
        analyze_immediately: bool,
        limit: int
    ) -> Optional[CollectionResult]:
        """Collect news from Reddit."""
        collector = self._get_reddit_collector()
        if not collector:
            return None
            
        try:
            result = await collector.collect_and_store(
                subreddits=None,  # Use default from config
                limit=limit,
                time_filter="day",
            )
            
            # Analyze if requested and new items were collected
            if analyze_immediately and result.new_count > 0:
                analyzed_count = await self._analyze_collected_news(
                    DataSourceType.REDDIT,
                    result.new_count
                )
                result.analyzed_count = analyzed_count
            
            logger.info(
                f"Reddit collection: {result.collected_count} collected, "
                f"{result.new_count} new, {result.analyzed_count} analyzed"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Reddit collection failed: {e}")
            return CollectionResult(
                source=DataSourceType.REDDIT,
                collected_count=0,
                new_count=0,
                analyzed_count=0,
                errors=[str(e)],
                duration_seconds=0.0
            )
    
    async def _collect_yahoo(
        self,
        analyze_immediately: bool,
        limit: int
    ) -> Optional[CollectionResult]:
        """Collect news from Yahoo Finance."""
        collector = self._get_yahoo_collector()
        
        try:
            result = await collector.collect_and_store(
                symbols=None,  # Use default from config
                limit=limit,
            )
            
            # Analyze if requested and new items were collected
            if analyze_immediately and result.new_count > 0:
                analyzed_count = await self._analyze_collected_news(
                    DataSourceType.YAHOO,
                    result.new_count
                )
                result.analyzed_count = analyzed_count
            
            logger.info(
                f"Yahoo collection: {result.collected_count} collected, "
                f"{result.new_count} new, {result.analyzed_count} analyzed"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Yahoo collection failed: {e}")
            return CollectionResult(
                source=DataSourceType.YAHOO,
                collected_count=0,
                new_count=0,
                analyzed_count=0,
                errors=[str(e)],
                duration_seconds=0.0
            )
    
    async def _analyze_collected_news(
        self,
        source: DataSourceType,
        limit: int
    ) -> int:
        """
        Analyze recently collected news items.
        
        Args:
            source: Source type to filter by.
            limit: Maximum items to analyze.
            
        Returns:
            Number of items successfully analyzed.
        """
        from app.database import Database
        from app.services.sentiment_service import SentimentService
        from app.models.schemas import NewsInput
        
        try:
            collection = Database.get_collection("collected_news")
            sentiment_service = SentimentService()
            analyzed_count = 0
            
            # Find unanalyzed news from this source
            cursor = collection.find({
                "source": source.value,
                "analyzed": False
            }).sort("collected_at", -1).limit(limit)
            
            async for doc in cursor:
                try:
                    # Extract symbol hint from metadata if available
                    metadata = doc.get("metadata", {})
                    raw_symbol = metadata.get("symbol", None)
                    
                    # Convert Yahoo symbol format (BTC-USD) to TradeX format (BTCUSDT)
                    symbol_hint = None
                    if raw_symbol:
                        symbol_hint = self._convert_yahoo_symbol(raw_symbol)
                    
                    news_input = NewsInput(
                        title=doc["title"],
                        content=doc["content"],
                        link=doc["link"],
                        published_date=doc["published_at"],
                        symbol_hint=symbol_hint,
                    )
                    
                    # Analyze sentiment
                    result = await sentiment_service.analyze_and_save(news_input)
                    
                    # Mark as analyzed
                    await collection.update_one(
                        {"_id": doc["_id"]},
                        {
                            "$set": {
                                "analyzed": True,
                                "sentiment_id": result.id
                            }
                        }
                    )
                    
                    analyzed_count += 1
                    
                    # Publish to RabbitMQ
                    await self._publish_sentiment_result(result)
                    
                except Exception as e:
                    logger.error(f"Error analyzing news {doc.get('_id')}: {e}")
                    continue
            
            return analyzed_count
            
        except Exception as e:
            logger.error(f"Error in analyze_collected_news: {e}")
            return 0
    
    async def _publish_sentiment_result(self, result) -> None:
        """Publish sentiment analysis result to RabbitMQ."""
        if not settings.enable_rabbitmq:
            return
            
        try:
            from app.rabbitmq import get_publisher
            
            publisher = await get_publisher()
            await publisher.publish_sentiment_result(
                sentiment_id=result.id,
                symbol=result.symbol,
                sentiment=result.sentiment,
                emotion=result.emotion,
                reason=result.reason,
                title=result.title,
                link=result.link,
                published=result.published,
            )
        except Exception as e:
            logger.error(f"Error publishing sentiment result: {e}")
    
    @staticmethod
    def _convert_yahoo_symbol(yahoo_symbol: str) -> str:
        """Convert Yahoo Finance symbol (e.g., BTC-USD) to TradeX format (e.g., BTCUSDT)."""
        symbol_map = {
            "BTC-USD": "BTCUSDT",
            "ETH-USD": "ETHUSDT",
            "BNB-USD": "BNBUSDT",
            "SOL-USD": "SOLUSDT",
            "XRP-USD": "XRPUSDT",
            "ADA-USD": "ADAUSDT",
            "DOGE-USD": "DOGEUSDT",
            "DOT-USD": "DOTUSDT",
            "MATIC-USD": "MATICUSDT",
            "AVAX-USD": "AVAXUSDT",
        }
        upper = yahoo_symbol.upper()
        if upper in symbol_map:
            return symbol_map[upper]
        return upper.replace("-", "").replace("USD", "USDT")

    async def _publish_collection_result(self, result: CollectionResult) -> None:
        """Publish collection result to RabbitMQ for monitoring."""
        if not settings.enable_rabbitmq:
            return
            
        try:
            from app.rabbitmq import get_publisher
            
            publisher = await get_publisher()
            await publisher.publish_batch_complete(
                total_analyzed=result.analyzed_count,
                symbols=[],  # Will be populated when we have actual symbol data
                average_sentiment=0.0,  # Will be calculated when we have sentiment data
                duration_seconds=result.duration_seconds,
                source=result.source.value,
            )
        except Exception as e:
            logger.error(f"Error publishing collection result: {e}")


# Singleton instance
_scheduler: Optional[CollectorScheduler] = None


async def get_scheduler() -> CollectorScheduler:
    """Get or create the scheduler singleton."""
    global _scheduler
    if _scheduler is None:
        # Get interval from environment or use default (5 minutes)
        interval = getattr(settings, 'collection_interval_seconds', 5 * 60)
        _scheduler = CollectorScheduler(interval_seconds=interval)
    return _scheduler

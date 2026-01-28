import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.collectors.reddit_collector import RedditCollector
from app.collectors.yahoo_collector import YahooCollector
from app.config import settings
from app.models.schemas import (
    CollectionResult,
    DataSourceType,
    RedditCollectionRequest,
    YahooCollectionRequest,
)
from app.services.sentiment_service import SentimentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/collect", tags=["Data Collection"])


def get_reddit_collector():
    """Get appropriate Reddit collector based on configuration."""
    if settings.reddit_client_id and settings.reddit_client_secret:
        return RedditCollector()
    logger.info("Reddit credentials not configured")


def get_yahoo_collector():
    """Get appropriate Yahoo collector."""
    try:
        import yfinance
        return YahooCollector()
    except ImportError:
        logger.info("yfinance not installed, using mock collector")


@router.post(
    "/reddit",
    response_model=CollectionResult,
    status_code=status.HTTP_200_OK,
    summary="Collect Reddit posts",
    description="Collect cryptocurrency-related posts from Reddit subreddits.",
    responses={
        200: {"description": "Collection completed"},
        500: {"description": "Collection failed"},
    }
)
async def collect_reddit_posts(
    request: RedditCollectionRequest = RedditCollectionRequest()
) -> CollectionResult:
    """Collect posts from cryptocurrency subreddits on Reddit."""
    try:
        collector = get_reddit_collector()
        
        # Collect and store posts
        result = await collector.collect_and_store(
            subreddits=request.subreddits,
            limit=request.limit,
            time_filter=request.time_filter,
        )
        
        # Analyze if requested
        if request.analyze_immediately and result.new_count > 0:
            analyzed_count = await _analyze_collected_news(
                DataSourceType.REDDIT,
                result.new_count
            )
            result.analyzed_count = analyzed_count
        
        logger.info(
            f"Reddit collection completed: {result.collected_count} collected, "
            f"{result.new_count} new, {result.analyzed_count} analyzed"
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Reddit collection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Reddit collection failed: {str(e)}"
        )


@router.post(
    "/yahoo",
    response_model=CollectionResult,
    status_code=status.HTTP_200_OK,
    summary="Collect Yahoo Finance news",
    description="Collect cryptocurrency news from Yahoo Finance.",
    responses={
        200: {"description": "Collection completed"},
        500: {"description": "Collection failed"},
    }
)
async def collect_yahoo_news(
    request: YahooCollectionRequest = YahooCollectionRequest()
) -> CollectionResult:
    """Collect cryptocurrency news from Yahoo Finance."""
    try:
        collector = get_yahoo_collector()
        
        # Collect and store news
        result = await collector.collect_and_store(
            symbols=request.symbols,
            limit=request.limit,
        )
        
        # Analyze if requested
        if request.analyze_immediately and result.new_count > 0:
            analyzed_count = await _analyze_collected_news(
                DataSourceType.YAHOO,
                result.new_count
            )
            result.analyzed_count = analyzed_count
        
        logger.info(
            f"Yahoo collection completed: {result.collected_count} collected, "
            f"{result.new_count} new, {result.analyzed_count} analyzed"
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Yahoo collection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Yahoo collection failed: {str(e)}"
        )


@router.post(
    "/all",
    response_model=dict[str, Any],
    status_code=status.HTTP_200_OK,
    summary="Collect from all sources",
    description="Collect news from all configured sources (Reddit and Yahoo).",
)
async def collect_all_sources(
    analyze_immediately: bool = True,
    limit: int = 10,
) -> dict[str, Any]:
    """Collect news from all available sources."""
    results = {}
    
    # Collect from Reddit
    try:
        reddit_request = RedditCollectionRequest(
            analyze_immediately=analyze_immediately,
            limit=limit,
        )
        reddit_result = await collect_reddit_posts(reddit_request)
        results["reddit"] = reddit_result.model_dump()
    except Exception as e:
        results["reddit"] = {"error": str(e)}
    
    # Collect from Yahoo
    try:
        yahoo_request = YahooCollectionRequest(
            analyze_immediately=analyze_immediately,
            limit=limit,
        )
        yahoo_result = await collect_yahoo_news(yahoo_request)
        results["yahoo"] = yahoo_result.model_dump()
    except Exception as e:
        results["yahoo"] = {"error": str(e)}
    
    # Summary
    total_collected = sum(
        r.get("collected_count", 0)
        for r in results.values()
        if isinstance(r, dict) and "collected_count" in r
    )
    total_new = sum(
        r.get("new_count", 0)
        for r in results.values()
        if isinstance(r, dict) and "new_count" in r
    )
    total_analyzed = sum(
        r.get("analyzed_count", 0)
        for r in results.values()
        if isinstance(r, dict) and "analyzed_count" in r
    )
    
    results["summary"] = {
        "total_collected": total_collected,
        "total_new": total_new,
        "total_analyzed": total_analyzed,
    }
    
    return results


@router.get(
    "/pending",
    response_model=dict[str, Any],
    summary="Get pending news for analysis",
    description="Get collected news that hasn't been analyzed yet.",
)
async def get_pending_news(
    source: DataSourceType | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Get news items that are pending sentiment analysis."""
    from app.database import Database
    
    try:
        collection = Database.get_collection("collected_news")
        
        query: dict[str, Any] = {"analyzed": False}
        if source:
            query["source"] = source.value
        
        cursor = collection.find(query).sort("collected_at", -1).limit(limit)
        docs = await cursor.to_list(length=limit)
        
        # Format response
        items = []
        for doc in docs:
            items.append({
                "id": str(doc["_id"]),
                "source": doc["source"],
                "title": doc["title"],
                "link": doc["link"],
                "published_at": doc["published_at"].isoformat(),
                "collected_at": doc["collected_at"].isoformat(),
            })
        
        return {
            "pending_count": len(items),
            "items": items,
        }
        
    except Exception as e:
        logger.error(f"Failed to get pending news: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get pending news: {str(e)}"
        )


@router.post(
    "/analyze-pending",
    response_model=dict[str, Any],
    summary="Analyze pending news",
    description="Run sentiment analysis on pending collected news.",
)
async def analyze_pending_news(
    source: DataSourceType | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """Analyze pending news items that haven't been processed yet."""
    try:
        analyzed_count = await _analyze_collected_news(source, limit)
        
        return {
            "analyzed_count": analyzed_count,
            "message": f"Successfully analyzed {analyzed_count} news items",
        }
        
    except Exception as e:
        logger.error(f"Failed to analyze pending news: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze pending news: {str(e)}"
        )


@router.get(
    "/status",
    response_model=dict[str, Any],
    summary="Get collector status",
    description="Get status of data collectors and configuration.",
)
async def get_collector_status() -> dict[str, Any]:
    """Get the status of all data collectors."""
    from app.database import Database
    
    # Check Reddit configuration
    reddit_configured = bool(
        settings.reddit_client_id and settings.reddit_client_secret
    )
    
    # Check Yahoo availability
    try:
        import yfinance
        yahoo_available = True
    except ImportError:
        yahoo_available = False
    
    # Get collection stats
    stats = {}
    try:
        collection = Database.get_collection("collected_news")
        
        # Count by source
        for source in DataSourceType:
            total = await collection.count_documents({"source": source.value})
            analyzed = await collection.count_documents({
                "source": source.value,
                "analyzed": True
            })
            pending = await collection.count_documents({
                "source": source.value,
                "analyzed": False
            })
            
            stats[source.value] = {
                "total": total,
                "analyzed": analyzed,
                "pending": pending,
            }
    except Exception as e:
        logger.warning(f"Could not get collection stats: {e}")
    
    return {
        "collectors": {
            "reddit": {
                "configured": reddit_configured,
                "subreddits": settings.reddit_subreddits_list,
                "post_limit": settings.reddit_post_limit,
            },
            "yahoo": {
                "available": yahoo_available,
                "symbols": settings.yahoo_symbols_list,
                "news_limit": settings.yahoo_news_limit,
            },
        },
        "statistics": stats,
    }


async def _analyze_collected_news(
    source: DataSourceType | None,
    limit: int,
) -> int:
    """Internal helper to analyze collected news items."""
    from bson import ObjectId
    from app.database import Database
    from app.models.schemas import NewsInput
    
    collection = Database.get_collection("collected_news")
    service = SentimentService()
    
    query: dict[str, Any] = {"analyzed": False}
    if source:
        query["source"] = source.value
    
    cursor = collection.find(query).sort("collected_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    
    analyzed_count = 0
    
    for doc in docs:
        try:
            # Convert to NewsInput
            news_input = NewsInput(
                title=doc["title"],
                content=doc["content"],
                link=doc["link"],
                published_date=doc["published_at"],
            )
            
            # Analyze sentiment
            result = await service.analyze_and_save(news_input)
            
            # Mark as analyzed
            await collection.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "analyzed": True,
                        "sentiment_id": result.id,
                    }
                }
            )
            
            analyzed_count += 1
            
        except Exception as e:
            logger.error(f"Failed to analyze {doc['_id']}: {e}")
            continue
    
    return analyzed_count

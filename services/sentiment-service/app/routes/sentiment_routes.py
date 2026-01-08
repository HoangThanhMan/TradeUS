"""
API routes for sentiment analysis endpoints.
Defines REST API endpoints for the sentiment service.
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.config import settings
from app.models.schemas import NewsInput, SentimentResponse
from app.services.sentiment_service import SentimentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sentiments", tags=["Sentiments"])

# Service instance (could be replaced with dependency injection)
_service: Optional[SentimentService] = None


def get_service() -> SentimentService:
    """Get or create the sentiment service instance."""
    global _service
    if _service is None:
        _service = SentimentService()
    return _service


async def _publish_sentiment_result(result: SentimentResponse) -> None:
    """Publish sentiment result to RabbitMQ if enabled."""
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
        logger.warning(f"Failed to publish sentiment to RabbitMQ: {e}")


@router.post(
    "/analyze",
    response_model=SentimentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Analyze news sentiment",
    description="Analyze the sentiment of a news article and save the result.",
    responses={
        201: {"description": "Sentiment analysis completed and saved"},
        400: {"description": "Invalid input data"},
        500: {"description": "Analysis or storage failed"},
    }
)
async def analyze_news_sentiment(news_input: NewsInput) -> SentimentResponse:
    """
    Analyze the sentiment of a news article.
    
    This endpoint accepts news data, analyzes it using LLM (Google Gemini),
    extracts sentiment information, and saves the result to MongoDB.
    
    **Input:**
    - **title**: Title of the news article
    - **content**: Full content/body of the article
    - **link**: URL to the original article
    - **published_date**: Publication date (ISO 8601 format)
    
    **Output:**
    - Sentiment analysis result including symbol, sentiment score,
      emotion classification, and reasoning
    """
    try:
        service = get_service()
        result = await service.analyze_and_save(news_input)
        
        # Publish to RabbitMQ for other services
        await _publish_sentiment_result(result)
        
        logger.info(f"Successfully analyzed sentiment for: {news_input.title[:50]}...")
        return result
        
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Failed to analyze sentiment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze sentiment: {str(e)}"
        )


@router.get(
    "/{sentiment_id}",
    response_model=SentimentResponse,
    summary="Get sentiment by ID",
    description="Retrieve a specific sentiment analysis by its ID.",
    responses={
        200: {"description": "Sentiment found"},
        404: {"description": "Sentiment not found"},
    }
)
async def get_sentiment_by_id(sentiment_id: str) -> SentimentResponse:
    """
    Get a sentiment analysis result by its MongoDB ID.
    
    **Path Parameters:**
    - **sentiment_id**: The MongoDB ObjectId of the sentiment document
    """
    try:
        service = get_service()
        result = await service.get_sentiment_by_id(sentiment_id)
        
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sentiment with ID {sentiment_id} not found"
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get sentiment {sentiment_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve sentiment: {str(e)}"
        )


@router.get(
    "/symbol/{symbol}",
    response_model=list[SentimentResponse],
    summary="Get sentiments by symbol",
    description="Retrieve sentiment analyses for a specific crypto symbol.",
    responses={
        200: {"description": "List of sentiments for the symbol"},
    }
)
async def get_sentiments_by_symbol(
    symbol: str,
    limit: int = Query(default=10, ge=1, le=100, description="Max results"),
    skip: int = Query(default=0, ge=0, description="Results to skip")
) -> list[SentimentResponse]:
    """
    Get sentiment analyses for a specific cryptocurrency symbol.
    
    **Path Parameters:**
    - **symbol**: Crypto trading pair (e.g., BTCUSDT, ETHUSDT)
    
    **Query Parameters:**
    - **limit**: Maximum number of results (1-100, default: 10)
    - **skip**: Number of results to skip for pagination (default: 0)
    """
    try:
        service = get_service()
        results = await service.get_sentiments_by_symbol(symbol, limit, skip)
        return results
        
    except Exception as e:
        logger.error(f"Failed to get sentiments for {symbol}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve sentiments: {str(e)}"
        )


@router.get(
    "/",
    response_model=list[SentimentResponse],
    summary="Get recent sentiments",
    description="Retrieve the most recent sentiment analyses.",
    responses={
        200: {"description": "List of recent sentiments"},
    }
)
async def get_recent_sentiments(
    limit: int = Query(default=20, ge=1, le=100, description="Max results"),
    skip: int = Query(default=0, ge=0, description="Results to skip")
) -> list[SentimentResponse]:
    """
    Get the most recent sentiment analyses.
    
    **Query Parameters:**
    - **limit**: Maximum number of results (1-100, default: 20)
    - **skip**: Number of results to skip for pagination (default: 0)
    """
    try:
        service = get_service()
        results = await service.get_recent_sentiments(limit, skip)
        return results
        
    except Exception as e:
        logger.error(f"Failed to get recent sentiments: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve sentiments: {str(e)}"
        )


@router.get(
    "/symbol/{symbol}/average",
    response_model=dict[str, Any],
    summary="Get average sentiment for symbol",
    description="Calculate the average sentiment score for a symbol over a period.",
    responses={
        200: {"description": "Average sentiment statistics"},
        404: {"description": "No data found for the symbol"},
    }
)
async def get_average_sentiment(
    symbol: str,
    days: int = Query(default=7, ge=1, le=90, description="Days to look back")
) -> dict[str, Any]:
    """
    Get average sentiment for a cryptocurrency symbol.
    
    **Path Parameters:**
    - **symbol**: Crypto trading pair (e.g., BTCUSDT)
    
    **Query Parameters:**
    - **days**: Number of days to look back (1-90, default: 7)
    
    **Returns:**
    - average_sentiment: The average sentiment score
    - sample_count: Number of analyses in the period
    - period_days: The time period analyzed
    """
    try:
        service = get_service()
        result = await service.get_average_sentiment(symbol, days)
        
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No sentiment data found for {symbol} in the last {days} days"
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get average sentiment for {symbol}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate average sentiment: {str(e)}"
        )


@router.post(
    "/batch",
    response_model=list[SentimentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Analyze multiple news articles",
    description="Analyze sentiment for multiple news articles in batch.",
    responses={
        201: {"description": "Batch analysis completed"},
        400: {"description": "Invalid input data"},
    }
)
async def analyze_batch(news_items: list[NewsInput]) -> list[SentimentResponse]:
    """
    Analyze sentiment for multiple news articles.
    
    **Input:**
    - List of news articles (max 10 per request)
    
    **Returns:**
    - List of sentiment analysis results
    """
    if len(news_items) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 articles per batch request"
        )
    
    if not news_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one news item is required"
        )
    
    try:
        service = get_service()
        results = []
        
        for news_input in news_items:
            try:
                result = await service.analyze_and_save(news_input)
                results.append(result)
                
                # Publish each result to RabbitMQ
                await _publish_sentiment_result(result)
                
            except Exception as e:
                logger.error(f"Failed to analyze article: {news_input.title[:30]}... - {e}")
                # Continue with other articles
        
        # Publish batch complete notification
        if results and settings.enable_rabbitmq:
            try:
                from app.rabbitmq import get_publisher
                publisher = await get_publisher()
                symbols = list(set(r.symbol for r in results))
                avg_sentiment = sum(r.sentiment for r in results) / len(results)
                await publisher.publish_batch_complete(
                    total_analyzed=len(results),
                    symbols=symbols,
                    average_sentiment=avg_sentiment,
                    source="api_batch",
                )
            except Exception as e:
                logger.warning(f"Failed to publish batch complete: {e}")
        
        return results
        
    except Exception as e:
        logger.error(f"Batch analysis failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch analysis failed: {str(e)}"
        )

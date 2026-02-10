"""
RabbitMQ message schemas for type safety.
Defines the structure of messages exchanged between services.
"""

from datetime import datetime, timezone
from typing import Optional, Any
from enum import Enum

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """Event types for RabbitMQ messages."""
    
    # News events
    NEWS_RECEIVED = "news.received"
    NEWS_COLLECTED = "news.collected"
    
    # Sentiment events
    SENTIMENT_ANALYZED = "sentiment.analyzed"
    SENTIMENT_ALERT = "sentiment.alert"
    SENTIMENT_BATCH_COMPLETE = "sentiment.batch_complete"
    
    # Price events
    PRICE_UPDATE = "price.update"


class BaseMessage(BaseModel):
    """Base schema for all RabbitMQ messages."""
    
    event: str = Field(..., description="Event type identifier")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Message timestamp"
    )
    source: str = Field(default="sentiment-service", description="Source service")
    correlation_id: Optional[str] = Field(None, description="Correlation ID for tracing")


class NewsMessageData(BaseModel):
    """Data payload for news messages."""
    
    title: str = Field(..., description="News title")
    content: Optional[str] = Field(None, description="News content/body")
    summary: Optional[str] = Field(None, description="News summary")
    link: str = Field(..., description="News URL")
    source: Optional[str] = Field(None, description="News source name")
    symbol: Optional[str] = Field(None, description="Related crypto symbol")
    published_at: Optional[datetime] = Field(None, description="Publication date")
    metadata: Optional[dict[str, Any]] = Field(None, description="Additional metadata")


class NewsMessage(BaseMessage):
    """Schema for incoming news messages from collectors."""
    
    event: str = EventType.NEWS_RECEIVED.value
    data: NewsMessageData


class SentimentResultData(BaseModel):
    """Data payload for sentiment analysis results."""
    
    id: Optional[str] = Field(None, description="MongoDB document ID")
    symbol: str = Field(..., description="Crypto trading pair")
    sentiment: float = Field(..., ge=-1, le=1, description="Sentiment score")
    emotion: str = Field(..., description="Detected emotion")
    reason: str = Field(..., description="Analysis reasoning")
    title: str = Field(..., description="Original article title")
    link: str = Field(..., description="Original article link")
    published: Optional[datetime] = Field(None, description="Publication date")
    created_at: Optional[datetime] = Field(None, description="Analysis timestamp")


class SentimentResultMessage(BaseMessage):
    """Schema for outgoing sentiment result messages."""
    
    event: str = EventType.SENTIMENT_ANALYZED.value
    data: SentimentResultData


class SentimentAlertData(BaseModel):
    """Data payload for sentiment alert messages."""
    
    symbol: str = Field(..., description="Crypto symbol")
    sentiment_score: float = Field(..., description="Sentiment score that triggered alert")
    sentiment: float = Field(0, description="Sentiment score (alias for compatibility)")
    emotion: str = Field(..., description="Detected emotion")
    alert_type: str = Field(..., description="Alert type: extreme_positive, extreme_negative, trend_change")
    message: str = Field(..., description="Alert message")
    title: str = Field("", description="Original article title")
    reason: str = Field("", description="Analysis reasoning")
    threshold: float = Field(..., description="Threshold that was exceeded")


class SentimentAlertMessage(BaseMessage):
    """Schema for sentiment alert messages."""
    
    event: str = EventType.SENTIMENT_ALERT.value
    data: SentimentAlertData


class BatchCompleteData(BaseModel):
    """Data payload for batch analysis complete notification."""
    
    total_analyzed: int = Field(..., description="Number of articles analyzed")
    symbols: list[str] = Field(..., description="Symbols analyzed")
    average_sentiment: float = Field(..., description="Average sentiment score")
    duration_seconds: Optional[float] = Field(None, description="Processing duration")
    source: Optional[str] = Field(None, description="Collection source")


class BatchCompleteMessage(BaseMessage):
    """Schema for batch analysis complete notification."""
    
    event: str = EventType.SENTIMENT_BATCH_COMPLETE.value
    data: BatchCompleteData


class PriceUpdateData(BaseModel):
    """Data payload for price update messages."""
    
    symbol: str = Field(..., description="Trading pair symbol")
    price: float = Field(..., description="Current price")
    change_percent: float = Field(..., description="24h change percentage")
    volume: Optional[float] = Field(None, description="24h volume")
    high_24h: Optional[float] = Field(None, description="24h high")
    low_24h: Optional[float] = Field(None, description="24h low")


class PriceUpdateMessage(BaseMessage):
    """Schema for incoming price update messages."""
    
    event: str = EventType.PRICE_UPDATE.value
    data: PriceUpdateData

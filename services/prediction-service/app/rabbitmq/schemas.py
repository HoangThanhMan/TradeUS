"""
RabbitMQ message schemas for Prediction Service.
"""

from datetime import datetime, timezone
from typing import Optional, Any, List
from enum import Enum

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """Event types for RabbitMQ messages."""
    
    # Price events (from collector-price via RabbitMQ)
    PRICE_UPDATE = "price.update"
    PRICE_HISTORICAL = "price.historical"
    
    # Sentiment events (from sentiment-service)
    SENTIMENT_ANALYZED = "sentiment.analyzed"
    
    # Prediction events (outgoing via RabbitMQ)
    PREDICTION_CREATED = "prediction.created"
    PREDICTION_ALERT = "prediction.alert"


class BaseMessage(BaseModel):
    """Base schema for all RabbitMQ messages."""
    
    event: str = Field(..., description="Event type identifier")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Message timestamp"
    )
    source: str = Field(default="prediction-service", description="Source service")
    correlation_id: Optional[str] = Field(None, description="Correlation ID for tracing")


class PriceData(BaseModel):
    """Price data from collector-price service."""
    
    symbol: str = Field(..., description="Trading symbol")
    open: float = Field(..., description="Open price")
    high: float = Field(..., description="High price")
    low: float = Field(..., description="Low price")
    close: float = Field(..., description="Close price")
    volume: float = Field(..., description="Trading volume")
    timestamp: int = Field(..., description="Unix timestamp in milliseconds")


class PriceMessage(BaseModel):
    """Schema for incoming price messages."""
    
    symbol: str
    price: float
    priceChange: Optional[float] = None
    priceChangePercent: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    volume: Optional[float] = None
    quoteVolume: Optional[float] = None
    timestamp: int
    source: str


class CandlestickData(BaseModel):
    """Individual candlestick data."""
    
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class HistoricalDataMessage(BaseModel):
    """Schema for historical candlestick data."""
    
    symbol: str
    interval: str
    source: str
    dataType: str
    count: int
    data: List[CandlestickData]
    fetchedAt: int


class SentimentData(BaseModel):
    """Sentiment data from sentiment-service."""
    
    symbol: str = Field(..., description="Crypto symbol")
    sentiment: float = Field(..., ge=-1, le=1, description="Sentiment score")
    emotion: Optional[str] = Field(None, description="Detected emotion")
    reason: Optional[str] = Field(None, description="Analysis reasoning")


class SentimentMessage(BaseMessage):
    """Schema for incoming sentiment messages."""
    
    event: str = EventType.SENTIMENT_ANALYZED.value
    data: SentimentData


class PredictionData(BaseModel):
    """Prediction result data."""
    
    symbol: str = Field(..., description="Trading symbol")
    interval: str = Field(..., description="Time interval")
    current_price: float = Field(..., description="Current price")
    predicted_price: float = Field(..., description="Predicted price")
    price_change: float = Field(..., description="Predicted price change")
    price_change_percent: float = Field(..., description="Predicted price change %")
    signal: str = Field(..., description="Trading signal")
    signal_color: str = Field(..., description="Signal color for UI")
    message: str = Field(..., description="Human readable message")
    sentiment: float = Field(..., description="Current sentiment score")


class PredictionMessage(BaseMessage):
    """Schema for outgoing prediction messages."""
    
    event: str = EventType.PREDICTION_CREATED.value
    data: PredictionData

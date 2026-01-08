"""
RabbitMQ publisher for sentiment analysis results.
Publishes sentiment results and alerts to other services via message queue.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from aio_pika import Message, DeliveryMode, ExchangeType
from aio_pika.abc import AbstractExchange

from app.config import settings
from app.rabbitmq.connection import RabbitMQConnection
from app.rabbitmq.schemas import (
    SentimentResultMessage,
    SentimentResultData,
    SentimentAlertMessage,
    SentimentAlertData,
    BatchCompleteMessage,
    BatchCompleteData,
    EventType,
)

logger = logging.getLogger(__name__)


# Exchange names
SENTIMENT_EXCHANGE = "sentiment.exchange"

# Routing keys
ROUTING_KEY_RESULT = "sentiment.result"      # sentiment.result.{symbol}
ROUTING_KEY_ALERT = "sentiment.alert"        # sentiment.alert.{symbol}.{type}
ROUTING_KEY_BATCH = "sentiment.batch"        # sentiment.batch.complete


class SentimentPublisher:
    """
    Publisher for sentiment analysis results.
    Publishes to RabbitMQ for other services (trading, alerts, analytics) to consume.
    """
    
    def __init__(self) -> None:
        """Initialize the publisher."""
        self._exchange: Optional[AbstractExchange] = None
        self._initialized = False
    
    async def initialize(self) -> None:
        """Initialize the publisher and declare exchange."""
        if self._initialized:
            return
            
        try:
            self._exchange = await RabbitMQConnection.declare_exchange(
                SENTIMENT_EXCHANGE,
                ExchangeType.TOPIC,
                durable=True,
            )
            self._initialized = True
            logger.info(f"Sentiment publisher initialized with exchange: {SENTIMENT_EXCHANGE}")
        except Exception as e:
            logger.error(f"Failed to initialize publisher: {e}")
            raise
    
    async def publish_sentiment_result(
        self,
        sentiment_id: str,
        symbol: str,
        sentiment: float,
        emotion: str,
        reason: str,
        title: str,
        link: str,
        published: Optional[datetime] = None,
    ) -> bool:
        """
        Publish a sentiment analysis result.
        
        Args:
            sentiment_id: MongoDB document ID.
            symbol: Crypto trading pair.
            sentiment: Sentiment score (-1 to 1).
            emotion: Detected emotion.
            reason: Analysis reasoning.
            title: Original article title.
            link: Original article link.
            published: Article publication date.
            
        Returns:
            True if published successfully.
        """
        if not self._initialized:
            await self.initialize()
        
        try:
            # Build routing key: sentiment.result.BTCUSDT
            routing_key = f"{ROUTING_KEY_RESULT}.{symbol.upper()}"
            
            # Create message
            message_data = SentimentResultMessage(
                event=EventType.SENTIMENT_ANALYZED.value,
                timestamp=datetime.now(timezone.utc),
                data=SentimentResultData(
                    id=sentiment_id,
                    symbol=symbol.upper(),
                    sentiment=sentiment,
                    emotion=emotion,
                    reason=reason,
                    title=title,
                    link=link,
                    published=published,
                    created_at=datetime.now(timezone.utc),
                )
            )
            
            message = Message(
                body=message_data.model_dump_json().encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
                content_type="application/json",
                headers={
                    "source": "sentiment-service",
                    "symbol": symbol.upper(),
                    "sentiment_score": str(sentiment),
                    "event": EventType.SENTIMENT_ANALYZED.value,
                }
            )
            
            await self._exchange.publish(message, routing_key=routing_key)
            logger.info(f"Published sentiment result: {symbol} (score: {sentiment:.2f})")
            
            # Check for extreme sentiment and publish alert
            if abs(sentiment) >= settings.sentiment_alert_threshold:
                alert_type = "extreme_positive" if sentiment > 0 else "extreme_negative"
                await self.publish_sentiment_alert(
                    symbol=symbol,
                    sentiment_score=sentiment,
                    emotion=emotion,
                    alert_type=alert_type,
                    message=f"Extreme sentiment detected: {reason[:100]}",
                )
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish sentiment result: {e}")
            return False
    
    async def publish_sentiment_alert(
        self,
        symbol: str,
        sentiment_score: float,
        emotion: str,
        alert_type: str,
        message: str,
    ) -> bool:
        """
        Publish a sentiment alert (extreme sentiment detected).
        
        Args:
            symbol: Cryptocurrency symbol.
            sentiment_score: Sentiment score (-1 to 1).
            emotion: Detected emotion.
            alert_type: Type of alert (extreme_negative, extreme_positive, trend_change).
            message: Alert message.
            
        Returns:
            True if published successfully.
        """
        if not self._initialized:
            await self.initialize()
        
        try:
            # Routing key: sentiment.alert.BTCUSDT.extreme_negative
            routing_key = f"{ROUTING_KEY_ALERT}.{symbol.upper()}.{alert_type}"
            
            alert_data = SentimentAlertMessage(
                event=EventType.SENTIMENT_ALERT.value,
                timestamp=datetime.now(timezone.utc),
                data=SentimentAlertData(
                    symbol=symbol.upper(),
                    sentiment_score=sentiment_score,
                    emotion=emotion,
                    alert_type=alert_type,
                    message=message,
                    threshold=settings.sentiment_alert_threshold,
                )
            )
            
            msg = Message(
                body=alert_data.model_dump_json().encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
                content_type="application/json",
                priority=5,  # Higher priority for alerts
                headers={
                    "source": "sentiment-service",
                    "alert_type": alert_type,
                    "symbol": symbol.upper(),
                    "event": EventType.SENTIMENT_ALERT.value,
                }
            )
            
            await self._exchange.publish(msg, routing_key=routing_key)
            logger.warning(f"Published sentiment alert: {symbol} - {alert_type}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish sentiment alert: {e}")
            return False
    
    async def publish_batch_complete(
        self,
        total_analyzed: int,
        symbols: list[str],
        average_sentiment: float,
        duration_seconds: Optional[float] = None,
        source: Optional[str] = None,
    ) -> bool:
        """
        Publish notification when batch analysis is complete.
        
        Args:
            total_analyzed: Number of articles analyzed.
            symbols: List of symbols analyzed.
            average_sentiment: Overall average sentiment.
            duration_seconds: Processing time.
            source: Collection source (reddit, yahoo, etc).
            
        Returns:
            True if published successfully.
        """
        if not self._initialized:
            await self.initialize()
        
        try:
            routing_key = f"{ROUTING_KEY_BATCH}.complete"
            
            batch_data = BatchCompleteMessage(
                event=EventType.SENTIMENT_BATCH_COMPLETE.value,
                timestamp=datetime.now(timezone.utc),
                data=BatchCompleteData(
                    total_analyzed=total_analyzed,
                    symbols=[s.upper() for s in symbols],
                    average_sentiment=round(average_sentiment, 4),
                    duration_seconds=duration_seconds,
                    source=source,
                )
            )
            
            msg = Message(
                body=batch_data.model_dump_json().encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
                content_type="application/json",
            )
            
            await self._exchange.publish(msg, routing_key=routing_key)
            logger.info(f"Published batch complete: {total_analyzed} articles analyzed")
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish batch complete: {e}")
            return False


# Singleton instance
_publisher: Optional[SentimentPublisher] = None


async def get_publisher() -> SentimentPublisher:
    """Get or create the singleton publisher instance."""
    global _publisher
    if _publisher is None:
        _publisher = SentimentPublisher()
        await _publisher.initialize()
    return _publisher

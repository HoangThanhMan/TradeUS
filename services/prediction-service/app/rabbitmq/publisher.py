"""
RabbitMQ publisher for sending prediction results.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, Any

from aio_pika import Message, ExchangeType
from aio_pika.abc import AbstractExchange

from app.config import settings
from app.rabbitmq.connection import RabbitMQConnection
from app.rabbitmq.schemas import EventType

logger = logging.getLogger(__name__)


# Exchange names
PREDICTION_EXCHANGE = "prediction.exchange"


class PredictionPublisher:
    """
    Publisher for sending prediction results to RabbitMQ.
    """
    
    def __init__(self) -> None:
        self._exchange: Optional[AbstractExchange] = None
    
    async def initialize(self) -> None:
        """Initialize the publisher and declare exchanges."""
        try:
            channel = await RabbitMQConnection.get_channel()
            
            # Declare prediction exchange
            self._exchange = await channel.declare_exchange(
                PREDICTION_EXCHANGE,
                ExchangeType.TOPIC,
                durable=True,
            )
            
            logger.info("Prediction publisher initialized")
            
        except Exception as e:
            logger.error(f"Failed to initialize publisher: {e}")
            raise
    
    async def publish_prediction(self, prediction: dict[str, Any]) -> bool:
        """
        Publish a prediction result.
        
        Args:
            prediction: Prediction result dict
            
        Returns:
            True if published successfully
        """
        if self._exchange is None:
            logger.warning("Publisher not initialized")
            return False
        
        try:
            symbol = prediction.get("symbol", "").lower()
            interval = prediction.get("interval", "1h")
            
            message_body = {
                "event": EventType.PREDICTION_CREATED.value,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": settings.service_name,
                "data": prediction,
            }
            
            message = Message(
                body=json.dumps(message_body).encode(),
                content_type="application/json",
            )
            
            routing_key = f"prediction.{symbol}.{interval}"
            
            await self._exchange.publish(message, routing_key=routing_key)
            
            logger.debug(f"Prediction published: {routing_key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish prediction: {e}")
            return False
    
    async def publish_alert(
        self,
        symbol: str,
        signal: str,
        message: str,
        prediction: dict[str, Any],
    ) -> bool:
        """
        Publish a prediction alert for significant price movements.
        
        Args:
            symbol: Trading symbol
            signal: Trading signal (STRONG_BUY, STRONG_SELL, etc.)
            message: Alert message
            prediction: Full prediction data
            
        Returns:
            True if published successfully
        """
        if self._exchange is None:
            return False
        
        try:
            message_body = {
                "event": EventType.PREDICTION_ALERT.value,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": settings.service_name,
                "data": {
                    "symbol": symbol,
                    "signal": signal,
                    "message": message,
                    "prediction": prediction,
                },
            }
            
            msg = Message(
                body=json.dumps(message_body).encode(),
                content_type="application/json",
            )
            
            routing_key = f"prediction.alert.{symbol.lower()}"
            
            await self._exchange.publish(msg, routing_key=routing_key)
            
            logger.info(f"Alert published for {symbol}: {signal}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish alert: {e}")
            return False


# Publisher singleton
_publisher: Optional[PredictionPublisher] = None


async def get_publisher() -> PredictionPublisher:
    """Get or create the publisher singleton."""
    global _publisher
    if _publisher is None:
        _publisher = PredictionPublisher()
        await _publisher.initialize()
    return _publisher

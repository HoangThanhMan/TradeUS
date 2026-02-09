"""
RabbitMQ consumer for Symbol Alert Service.

Listens on sentiment.exchange for sentiment alert events.
When a high-impact sentiment is detected, looks up subscribers and
publishes email requests to the Email Service via email.exchange.
"""

import asyncio
import json
import logging
from typing import Optional

from aio_pika import IncomingMessage, ExchangeType

from app.config import settings
from app.rabbitmq.connection import RabbitMQConnection

logger = logging.getLogger(__name__)

# Source exchange / queue
SENTIMENT_EXCHANGE = "sentiment.exchange"
ALERT_QUEUE = "symbol-alert.sentiment.queue"
ALERT_ROUTING_KEY = "sentiment.alert.#"


class AlertConsumer:
    """Consumes sentiment alerts and dispatches notifications."""

    def __init__(self) -> None:
        self._running = False
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        task = asyncio.create_task(self._consume_alerts(), name="alert_consumer")
        self._tasks.append(task)
        logger.info("Alert consumer started")

    async def stop(self) -> None:
        self._running = False
        for t in self._tasks:
            if not t.done():
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
        self._tasks.clear()
        logger.info("Alert consumer stopped")

    async def _consume_alerts(self) -> None:
        try:
            exchange = await RabbitMQConnection.declare_exchange(
                SENTIMENT_EXCHANGE, ExchangeType.TOPIC, durable=True
            )
            queue = await RabbitMQConnection.declare_queue(ALERT_QUEUE, durable=True)
            await queue.bind(exchange, ALERT_ROUTING_KEY)

            logger.info(f"Listening on '{ALERT_QUEUE}' for sentiment alerts")

            async with queue.iterator() as it:
                async for message in it:
                    if not self._running:
                        break
                    async with message.process():
                        await self._handle_alert(message)
        except asyncio.CancelledError:
            logger.info("Alert consumer cancelled")
        except Exception as e:
            logger.error(f"Alert consumer error: {e}")

    async def _handle_alert(self, message: IncomingMessage) -> None:
        """Process a single sentiment alert message."""
        try:
            body = json.loads(message.body.decode())
            data = body.get("data", {})
            symbol = data.get("symbol", "UNKNOWN")
            # Support both field names for compatibility
            sentiment = data.get("sentiment", data.get("sentiment_score", 0))
            title = data.get("title", "")
            reason = data.get("reason", data.get("message", ""))

            logger.info(f"Alert received: {symbol} sentiment={sentiment}")

            # Import here to avoid circular
            from app.services.alert_dispatcher import dispatch_alert

            await dispatch_alert(
                symbol=symbol,
                sentiment=sentiment,
                title=title,
                reason=reason,
            )

        except Exception as e:
            logger.error(f"Error handling alert message: {e}")


_consumer: Optional[AlertConsumer] = None


def get_consumer() -> AlertConsumer:
    global _consumer
    if _consumer is None:
        _consumer = AlertConsumer()
    return _consumer

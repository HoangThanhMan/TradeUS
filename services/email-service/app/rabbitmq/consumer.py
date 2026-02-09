"""
RabbitMQ consumer for Email Service.
Listens for email send requests from other services.
Publishes email delivery status to alert.exchange for ws-gateway.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from aio_pika import IncomingMessage, ExchangeType, Message, DeliveryMode

from app.config import settings
from app.rabbitmq.connection import RabbitMQConnection
from app.rabbitmq.schemas import EmailRequestMessage, EmailRequestData

logger = logging.getLogger(__name__)

# Exchange / queue constants
EMAIL_EXCHANGE = "email.exchange"
EMAIL_QUEUE = "email.send.queue"
EMAIL_ROUTING_KEY = "email.send.#"


class EmailConsumer:
    """Consumer that processes email send requests from the queue."""

    def __init__(self) -> None:
        self._running = False
        self._tasks: list[asyncio.Task] = []
        self._email_sender = None  # will be set after import

    async def start(self) -> None:
        if self._running:
            logger.warning("Email consumer already running")
            return

        # Lazy import to avoid circular dependency
        from app.services.email_sender import get_email_sender

        self._email_sender = get_email_sender()

        self._running = True
        task = asyncio.create_task(self._consume_emails(), name="email_consumer")
        self._tasks.append(task)
        logger.info("Email consumer started")

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        self._tasks.clear()
        logger.info("Email consumer stopped")

    async def _consume_emails(self) -> None:
        """Consume email send requests."""
        try:
            exchange = await RabbitMQConnection.declare_exchange(
                EMAIL_EXCHANGE, ExchangeType.TOPIC, durable=True
            )
            queue = await RabbitMQConnection.declare_queue(EMAIL_QUEUE, durable=True)
            await queue.bind(exchange, EMAIL_ROUTING_KEY)

            logger.info(f"Listening on queue '{EMAIL_QUEUE}' for email requests")

            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    if not self._running:
                        break
                    async with message.process():
                        await self._handle_email_message(message)
        except asyncio.CancelledError:
            logger.info("Email consumer cancelled")
        except Exception as e:
            logger.error(f"Email consumer error: {e}")

    async def _handle_email_message(self, message: IncomingMessage) -> None:
        """Handle a single email request message."""
        try:
            body = json.loads(message.body.decode())
            logger.info(f"Received email request: {body.get('event', 'unknown')}")

            parsed = EmailRequestMessage(**body)
            data = parsed.data

            success = await self._email_sender.send(
                to=data.to,
                subject=data.subject,
                body=data.body,
            )

            if success:
                logger.info(f"Email sent to {data.to}")
                await self._publish_email_status(data, "sent")
            else:
                logger.error(f"Failed to send email to {data.to}")
                await self._publish_email_status(data, "failed")

        except Exception as e:
            logger.error(f"Error processing email message: {e}")

    async def _publish_email_status(
        self, data: EmailRequestData, status: str
    ) -> None:
        """Publish email delivery status to alert.exchange for ws-gateway."""
        try:
            exchange = await RabbitMQConnection.declare_exchange(
                settings.alert_exchange, ExchangeType.TOPIC, durable=True
            )
            payload = {
                "event": "alert.email.status",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": "email-service",
                "data": {
                    "type": "email_status",
                    "to": data.to,
                    "subject": data.subject,
                    "status": status,  # "sent" or "failed"
                },
            }
            msg = Message(
                body=json.dumps(payload).encode(),
                delivery_mode=DeliveryMode.PERSISTENT,
                content_type="application/json",
            )
            await exchange.publish(msg, routing_key=settings.alert_routing_key)
            logger.info(f"Email status '{status}' published to alert.exchange for {data.to}")
        except Exception as e:
            logger.error(f"Failed to publish email status: {e}")


# Singleton
_consumer: Optional[EmailConsumer] = None


def get_consumer() -> EmailConsumer:
    global _consumer
    if _consumer is None:
        _consumer = EmailConsumer()
    return _consumer

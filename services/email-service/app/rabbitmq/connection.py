"""
RabbitMQ connection manager (singleton) using aio-pika.
"""

import asyncio
import logging
from typing import Optional

import aio_pika
from aio_pika import ExchangeType
from aio_pika.abc import AbstractRobustConnection, AbstractChannel, AbstractExchange

from app.config import settings

logger = logging.getLogger(__name__)


class RabbitMQConnection:
    """Singleton RabbitMQ connection manager."""

    _connection: Optional[AbstractRobustConnection] = None
    _channel: Optional[AbstractChannel] = None
    _lock = asyncio.Lock()

    @classmethod
    async def connect(cls) -> AbstractRobustConnection:
        async with cls._lock:
            if cls._connection is None or cls._connection.is_closed:
                logger.info(f"Connecting to RabbitMQ at {settings.rabbitmq_url}")
                cls._connection = await aio_pika.connect_robust(
                    settings.rabbitmq_url, timeout=30
                )
                logger.info("Successfully connected to RabbitMQ")
            return cls._connection

    @classmethod
    async def get_channel(cls) -> AbstractChannel:
        connection = await cls.connect()
        async with cls._lock:
            if cls._channel is None or cls._channel.is_closed:
                cls._channel = await connection.channel()
                await cls._channel.set_qos(prefetch_count=10)
                logger.info("Created RabbitMQ channel")
            return cls._channel

    @classmethod
    async def close(cls) -> None:
        async with cls._lock:
            if cls._channel and not cls._channel.is_closed:
                await cls._channel.close()
                cls._channel = None
            if cls._connection and not cls._connection.is_closed:
                await cls._connection.close()
                cls._connection = None
                logger.info("Closed RabbitMQ connection")

    @classmethod
    async def declare_exchange(
        cls, name: str, exchange_type: ExchangeType = ExchangeType.TOPIC, durable: bool = True
    ) -> AbstractExchange:
        channel = await cls.get_channel()
        exchange = await channel.declare_exchange(name, exchange_type, durable=durable)
        return exchange

    @classmethod
    async def declare_queue(cls, name: str, durable: bool = True, arguments: Optional[dict] = None):
        channel = await cls.get_channel()
        queue = await channel.declare_queue(name, durable=durable, arguments=arguments)
        return queue

    @classmethod
    async def health_check(cls) -> dict:
        try:
            if cls._connection is None or cls._connection.is_closed:
                return {"status": "disconnected", "connected": False}
            return {"status": "healthy", "connected": True}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}

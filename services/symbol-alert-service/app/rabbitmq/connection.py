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
    _connection: Optional[AbstractRobustConnection] = None
    _channel: Optional[AbstractChannel] = None
    _lock = asyncio.Lock()

    @classmethod
    async def connect(cls) -> AbstractRobustConnection:
        async with cls._lock:
            if cls._connection is None or cls._connection.is_closed:
                logger.info(f"Connecting to RabbitMQ at {settings.rabbitmq_url}")
                cls._connection = await aio_pika.connect_robust(settings.rabbitmq_url, timeout=30)
                logger.info("Connected to RabbitMQ")
            return cls._connection

    @classmethod
    async def get_channel(cls) -> AbstractChannel:
        conn = await cls.connect()
        async with cls._lock:
            if cls._channel is None or cls._channel.is_closed:
                cls._channel = await conn.channel()
                await cls._channel.set_qos(prefetch_count=10)
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
                logger.info("RabbitMQ connection closed")

    @classmethod
    async def declare_exchange(
        cls, name: str, exchange_type: ExchangeType = ExchangeType.TOPIC, durable: bool = True
    ) -> AbstractExchange:
        channel = await cls.get_channel()
        return await channel.declare_exchange(name, exchange_type, durable=durable)

    @classmethod
    async def declare_queue(cls, name: str, durable: bool = True, arguments: Optional[dict] = None):
        channel = await cls.get_channel()
        return await channel.declare_queue(name, durable=durable, arguments=arguments)

    @classmethod
    async def health_check(cls) -> dict:
        try:
            if cls._connection is None or cls._connection.is_closed:
                return {"status": "disconnected"}
            return {"status": "healthy"}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}

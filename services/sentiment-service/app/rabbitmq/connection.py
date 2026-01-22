"""
RabbitMQ connection manager for async operations.
Provides singleton connection management using aio-pika.
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
    """
    Manages RabbitMQ connection using aio_pika for async operations.
    Implements singleton pattern for connection reuse.
    """
    
    _instance: Optional["RabbitMQConnection"] = None
    _connection: Optional[AbstractRobustConnection] = None
    _channel: Optional[AbstractChannel] = None
    _lock = asyncio.Lock()
    
    def __new__(cls) -> "RabbitMQConnection":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    @classmethod
    async def connect(cls) -> AbstractRobustConnection:
        """
        Establish connection to RabbitMQ.
        
        Returns:
            RabbitMQ connection instance.
        """
        async with cls._lock:
            if cls._connection is None or cls._connection.is_closed:
                try:
                    logger.info(f"Connecting to RabbitMQ at {settings.rabbitmq_url}")
                    cls._connection = await aio_pika.connect_robust(
                        settings.rabbitmq_url,
                        timeout=30,
                    )
                    logger.info("Successfully connected to RabbitMQ")
                except Exception as e:
                    logger.error(f"Failed to connect to RabbitMQ: {e}")
                    raise
            
            return cls._connection
    
    @classmethod
    async def get_channel(cls) -> AbstractChannel:
        """
        Get or create a channel.
        
        Returns:
            RabbitMQ channel instance.
        """
        connection = await cls.connect()
        
        async with cls._lock:
            if cls._channel is None or cls._channel.is_closed:
                cls._channel = await connection.channel()
                await cls._channel.set_qos(prefetch_count=10)
                logger.info("Created RabbitMQ channel")
            
            return cls._channel
    
    @classmethod
    async def close(cls) -> None:
        """Close the RabbitMQ connection."""
        async with cls._lock:
            if cls._channel and not cls._channel.is_closed:
                await cls._channel.close()
                cls._channel = None
                logger.info("Closed RabbitMQ channel")
            
            if cls._connection and not cls._connection.is_closed:
                await cls._connection.close()
                cls._connection = None
                logger.info("Closed RabbitMQ connection")
    
    @classmethod
    async def declare_exchange(
        cls,
        name: str,
        exchange_type: ExchangeType = ExchangeType.TOPIC,
        durable: bool = True,
    ) -> AbstractExchange:
        """
        Declare an exchange.
        
        Args:
            name: Exchange name.
            exchange_type: Type of exchange.
            durable: Whether exchange survives broker restart.
            
        Returns:
            Declared exchange.
        """
        channel = await cls.get_channel()
        exchange = await channel.declare_exchange(
            name,
            exchange_type,
            durable=durable,
        )
        logger.debug(f"Declared exchange: {name}")
        return exchange
    
    @classmethod
    async def declare_queue(
        cls,
        name: str,
        durable: bool = True,
        arguments: Optional[dict] = None,
    ):
        """
        Declare a queue.
        
        Args:
            name: Queue name.
            durable: Whether queue survives broker restart.
            arguments: Additional queue arguments.
            
        Returns:
            Declared queue.
        """
        channel = await cls.get_channel()
        queue = await channel.declare_queue(
            name,
            durable=durable,
            arguments=arguments,
        )
        logger.debug(f"Declared queue: {name}")
        return queue
    
    @classmethod
    async def health_check(cls) -> dict:
        """
        Check RabbitMQ connection health.
        
        Returns:
            Health status dictionary.
        """
        try:
            if cls._connection is None or cls._connection.is_closed:
                return {
                    "status": "disconnected",
                    "connected": False,
                }
            return {
                "status": "healthy",
                "connected": True,
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
            }

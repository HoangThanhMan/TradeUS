"""
RabbitMQ connection management for Prediction Service.
"""

import asyncio
import logging
from typing import Optional

from aio_pika import connect_robust, RobustConnection, RobustChannel, Message
from aio_pika.abc import AbstractRobustConnection

from app.config import settings

logger = logging.getLogger(__name__)


class RabbitMQConnection:
    """
    Singleton manager for RabbitMQ connections.
    Provides connection pooling and channel management.
    """
    
    _connection: Optional[AbstractRobustConnection] = None
    _channel: Optional[RobustChannel] = None
    _lock = asyncio.Lock()
    
    @classmethod
    async def connect(cls) -> AbstractRobustConnection:
        """
        Establish connection to RabbitMQ.
        Uses connection pooling for efficiency.
        """
        async with cls._lock:
            if cls._connection is None or cls._connection.is_closed:
                logger.info(f"Connecting to RabbitMQ: {settings.rabbitmq_url}")
                
                cls._connection = await connect_robust(
                    settings.rabbitmq_url,
                    client_properties={
                        "connection_name": settings.service_name,
                    },
                )
                
                logger.info("RabbitMQ connection established")
                
            return cls._connection
    
    @classmethod
    async def get_channel(cls) -> RobustChannel:
        """
        Get or create a channel for message operations.
        """
        if cls._connection is None or cls._connection.is_closed:
            await cls.connect()
            
        async with cls._lock:
            if cls._channel is None or cls._channel.is_closed:
                cls._channel = await cls._connection.channel()
                await cls._channel.set_qos(prefetch_count=10)
                
            return cls._channel
    
    @classmethod
    async def close(cls) -> None:
        """Close all RabbitMQ connections."""
        async with cls._lock:
            if cls._channel and not cls._channel.is_closed:
                await cls._channel.close()
                cls._channel = None
                
            if cls._connection and not cls._connection.is_closed:
                await cls._connection.close()
                cls._connection = None
                
            logger.info("RabbitMQ connection closed")
    
    @classmethod
    def is_connected(cls) -> bool:
        """Check if RabbitMQ is connected."""
        return cls._connection is not None and not cls._connection.is_closed

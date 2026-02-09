"""
RabbitMQ module for Email Service.
"""

from app.rabbitmq.connection import RabbitMQConnection
from app.rabbitmq.consumer import EmailConsumer, get_consumer

__all__ = ["RabbitMQConnection", "EmailConsumer", "get_consumer"]

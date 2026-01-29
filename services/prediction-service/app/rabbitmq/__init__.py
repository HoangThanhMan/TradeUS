"""
RabbitMQ module for Prediction Service.
"""

from app.rabbitmq.connection import RabbitMQConnection
from app.rabbitmq.consumer import get_consumer, PredictionConsumer
from app.rabbitmq.publisher import get_publisher, PredictionPublisher
from app.rabbitmq.schemas import EventType

__all__ = [
    "RabbitMQConnection",
    "get_consumer",
    "PredictionConsumer",
    "get_publisher",
    "PredictionPublisher",
    "EventType",
]

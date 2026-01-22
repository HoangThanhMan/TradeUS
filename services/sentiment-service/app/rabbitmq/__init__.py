"""
RabbitMQ module for Sentiment Service.
Provides message queue integration for async communication with other services.
"""

from app.rabbitmq.connection import RabbitMQConnection
from app.rabbitmq.publisher import SentimentPublisher, get_publisher
from app.rabbitmq.consumer import SentimentConsumer, get_consumer
from app.rabbitmq.schemas import (
    BaseMessage,
    NewsMessage,
    SentimentResultMessage,
    SentimentAlertMessage,
    PriceUpdateMessage,
)

__all__ = [
    "RabbitMQConnection",
    "SentimentPublisher",
    "SentimentConsumer",
    "get_publisher",
    "get_consumer",
    "BaseMessage",
    "NewsMessage",
    "SentimentResultMessage",
    "SentimentAlertMessage",
    "PriceUpdateMessage",
]

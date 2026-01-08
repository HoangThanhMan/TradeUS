"""
RabbitMQ consumer for receiving news and price data from other services.
Automatically triggers sentiment analysis when news is received.
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Optional

from aio_pika import IncomingMessage, ExchangeType

from app.config import settings
from app.rabbitmq.connection import RabbitMQConnection
from app.rabbitmq.schemas import EventType

logger = logging.getLogger(__name__)


# Exchange and queue names
NEWS_EXCHANGE = "news.exchange"
NEWS_QUEUE = "sentiment.news.queue"
NEWS_ROUTING_KEY = "news.#"

PRICE_EXCHANGE = "price.exchange"
PRICE_QUEUE = "sentiment.price.queue"
PRICE_ROUTING_KEY = "price.update.#"


class SentimentConsumer:
    """
    Consumer for processing incoming news and price messages.
    Automatically triggers sentiment analysis when news is received.
    """
    
    def __init__(self) -> None:
        """Initialize the consumer."""
        self._running = False
        self._tasks: list[asyncio.Task] = []
    
    async def start(self) -> None:
        """Start consuming messages from all queues."""
        if self._running:
            logger.warning("Consumer already running")
            return
        
        self._running = True
        
        try:
            # Start news consumer
            news_task = asyncio.create_task(
                self._consume_news(),
                name="news_consumer"
            )
            self._tasks.append(news_task)
            
            # Start price consumer (for future correlation analysis)
            price_task = asyncio.create_task(
                self._consume_price_updates(),
                name="price_consumer"
            )
            self._tasks.append(price_task)
            
            logger.info("RabbitMQ consumers started")
            
        except Exception as e:
            logger.error(f"Failed to start consumers: {e}")
            self._running = False
            raise
    
    async def stop(self) -> None:
        """Stop all consumers."""
        self._running = False
        
        for task in self._tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        
        self._tasks.clear()
        logger.info("RabbitMQ consumers stopped")
    
    async def _consume_news(self) -> None:
        """Consume news messages and trigger sentiment analysis."""
        try:
            channel = await RabbitMQConnection.get_channel()
            
            # Declare exchange and queue
            exchange = await channel.declare_exchange(
                NEWS_EXCHANGE,
                ExchangeType.TOPIC,
                durable=True,
            )
            
            queue = await channel.declare_queue(
                NEWS_QUEUE,
                durable=True,
                arguments={
                    "x-message-ttl": 86400000,  # 24 hours
                    "x-max-length": 10000,
                }
            )
            
            # Bind queue to exchange
            await queue.bind(exchange, NEWS_ROUTING_KEY)
            
            logger.info(f"Consuming from queue: {NEWS_QUEUE}")
            
            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    if not self._running:
                        break
                    await self._process_news_message(message)
                    
        except asyncio.CancelledError:
            logger.info("News consumer cancelled")
        except Exception as e:
            logger.error(f"Error in news consumer: {e}")
            if self._running:
                # Retry after delay
                await asyncio.sleep(5)
                asyncio.create_task(self._consume_news())
    
    async def _consume_price_updates(self) -> None:
        """Consume price update messages for correlation analysis."""
        try:
            channel = await RabbitMQConnection.get_channel()
            
            # Declare exchange and queue
            exchange = await channel.declare_exchange(
                PRICE_EXCHANGE,
                ExchangeType.TOPIC,
                durable=True,
            )
            
            queue = await channel.declare_queue(
                PRICE_QUEUE,
                durable=True,
                arguments={
                    "x-message-ttl": 3600000,  # 1 hour
                    "x-max-length": 1000,
                }
            )
            
            # Bind queue to exchange
            await queue.bind(exchange, PRICE_ROUTING_KEY)
            
            logger.info(f"Consuming from queue: {PRICE_QUEUE}")
            
            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    if not self._running:
                        break
                    await self._process_price_message(message)
                    
        except asyncio.CancelledError:
            logger.info("Price consumer cancelled")
        except Exception as e:
            logger.error(f"Error in price consumer: {e}")
            if self._running:
                await asyncio.sleep(5)
                asyncio.create_task(self._consume_price_updates())
    
    async def _process_news_message(self, message: IncomingMessage) -> None:
        """
        Process incoming news message and trigger sentiment analysis.
        
        Args:
            message: The incoming RabbitMQ message.
        """
        async with message.process():
            try:
                body = json.loads(message.body.decode())
                event = body.get("event", "unknown")
                logger.info(f"Received news message: {event}")
                
                # Extract news data
                data = body.get("data", {})
                
                # Import here to avoid circular imports
                from app.models.schemas import NewsInput
                from app.services.sentiment_service import SentimentService
                from app.rabbitmq.publisher import get_publisher
                
                # Create NewsInput from message
                title = data.get("title", "")
                content = data.get("content") or data.get("summary") or title
                link = data.get("link") or data.get("url", "")
                published = data.get("published_at") or data.get("published_date")
                
                if not title or not link:
                    logger.warning("Invalid news message: missing title or link")
                    return
                
                # Parse published date
                if isinstance(published, str):
                    published = datetime.fromisoformat(published.replace("Z", "+00:00"))
                elif published is None:
                    published = datetime.utcnow()
                
                news_input = NewsInput(
                    title=title,
                    content=content,
                    link=link,
                    published_date=published,
                )
                
                # Analyze sentiment
                service = SentimentService()
                result = await service.analyze_and_save(news_input)
                
                logger.info(
                    f"Analyzed news via MQ: {title[:50]}... "
                    f"-> {result.symbol} ({result.sentiment:.2f})"
                )
                
                # Publish result to RabbitMQ
                publisher = await get_publisher()
                await publisher.publish_sentiment_result(
                    sentiment_id=result.id,
                    symbol=result.symbol,
                    sentiment=result.sentiment,
                    emotion=result.emotion,
                    reason=result.reason,
                    title=result.title,
                    link=result.link,
                    published=result.published,
                )
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to decode message: {e}")
            except Exception as e:
                logger.error(f"Error processing news message: {e}")
    
    async def _process_price_message(self, message: IncomingMessage) -> None:
        """
        Process incoming price update message.
        Can be used for correlation analysis between sentiment and price.
        
        Args:
            message: The incoming RabbitMQ message.
        """
        async with message.process():
            try:
                body = json.loads(message.body.decode())
                data = body.get("data", {})
                
                symbol = data.get("symbol", "")
                price = data.get("price", 0)
                change_percent = data.get("change_percent", 0)
                
                logger.debug(
                    f"Price update: {symbol} = ${price:,.2f} ({change_percent:+.2f}%)"
                )
                
                # TODO: Implement correlation analysis
                # - Store price data for later analysis
                # - Compare sentiment trends with price movements
                # - Generate correlation insights
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to decode price message: {e}")
            except Exception as e:
                logger.error(f"Error processing price message: {e}")


# Singleton instance
_consumer: Optional[SentimentConsumer] = None


async def get_consumer() -> SentimentConsumer:
    """Get or create the singleton consumer instance."""
    global _consumer
    if _consumer is None:
        _consumer = SentimentConsumer()
    return _consumer

"""
RabbitMQ consumer for receiving price data from collector-price.
Fetches sentiment directly from sentiment-service via HTTP API.
Triggers predictions when new data arrives.
"""

import asyncio
import json
import logging
from typing import Optional

from aio_pika import IncomingMessage, ExchangeType

from app.config import settings
from app.rabbitmq.connection import RabbitMQConnection
from app.rabbitmq.schemas import EventType
from app.ml import model_manager

logger = logging.getLogger(__name__)


# Exchange and queue names - Must match collector-price service
# Collector uses: exchange="tradex.prices", routing_key="price.{symbol}" or "price.historical.{symbol}"
PRICE_EXCHANGE = "tradex.prices"
PRICE_QUEUE = "prediction.price.queue"
PRICE_ROUTING_KEY = "price.#"  # Match: price.btcusdt, price.ethusdt, etc.

HISTORICAL_QUEUE = "prediction.historical.queue"
HISTORICAL_ROUTING_KEY = "price.historical.#"  # Match: price.historical.btcusdt, etc.


class PredictionConsumer:
    """
    Consumer for processing incoming price messages from collector-price.
    Fetches sentiment data directly from sentiment-service via HTTP API.
    Automatically triggers predictions when sufficient data is available.
    """
    
    def __init__(self) -> None:
        """Initialize the consumer."""
        self._running = False
        self._tasks: list[asyncio.Task] = []
        self._publisher = None
        self._sentiment_client = None
    
    async def start(self) -> None:
        """Start consuming messages from price queues."""
        if self._running:
            logger.warning("Consumer already running")
            return
        
        self._running = True
        
        try:
            # Get publisher for sending predictions
            from app.rabbitmq.publisher import get_publisher
            self._publisher = await get_publisher()
            
            # Get sentiment client for fetching sentiment via HTTP
            from app.services import get_sentiment_client
            self._sentiment_client = get_sentiment_client()
            
            # Start price consumer (subscribe to collector-price via RabbitMQ)
            price_task = asyncio.create_task(
                self._consume_price_updates(),
                name="price_consumer"
            )
            self._tasks.append(price_task)
            
            # Start historical data consumer
            historical_task = asyncio.create_task(
                self._consume_historical_data(),
                name="historical_consumer"
            )
            self._tasks.append(historical_task)
            
            logger.info("RabbitMQ price consumers started")
            logger.info(f"Sentiment will be fetched from: {settings.sentiment_service_url}")
            
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
    
    async def _consume_price_updates(self) -> None:
        """Consume real-time price updates from collector-price."""
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
                    "x-message-ttl": 60000,  # 1 minute TTL
                },
            )
            
            await queue.bind(exchange, PRICE_ROUTING_KEY)
            
            logger.info(f"Listening for price updates on {PRICE_QUEUE}")
            
            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    if not self._running:
                        break
                    await self._process_price_message(message)
                    
        except asyncio.CancelledError:
            logger.info("Price consumer cancelled")
        except Exception as e:
            logger.error(f"Price consumer error: {e}")
            if self._running:
                # Retry after delay
                await asyncio.sleep(5)
                asyncio.create_task(self._consume_price_updates())
    
    async def _consume_historical_data(self) -> None:
        """Consume historical candlestick data for buffer initialization."""
        try:
            channel = await RabbitMQConnection.get_channel()
            
            exchange = await channel.declare_exchange(
                PRICE_EXCHANGE,
                ExchangeType.TOPIC,
                durable=True,
            )
            
            queue = await channel.declare_queue(
                HISTORICAL_QUEUE,
                durable=True,
                arguments={
                    "x-message-ttl": 300000,  # 5 minutes TTL
                },
            )
            
            await queue.bind(exchange, HISTORICAL_ROUTING_KEY)
            
            logger.info(f"Listening for historical data on {HISTORICAL_QUEUE}")
            
            async with queue.iterator() as queue_iter:
                async for message in queue_iter:
                    if not self._running:
                        break
                    await self._process_historical_message(message)
                    
        except asyncio.CancelledError:
            logger.info("Historical consumer cancelled")
        except Exception as e:
            logger.error(f"Historical consumer error: {e}")
            if self._running:
                await asyncio.sleep(5)
                asyncio.create_task(self._consume_historical_data())
    
    async def _fetch_sentiment_from_service(self, symbol: str) -> float:
        """
        Fetch sentiment directly from sentiment-service via HTTP API.
        
        Args:
            symbol: Trading symbol (e.g., BTCUSDT)
            
        Returns:
            Sentiment score (-1 to 1), default 0 if not available
        """
        if self._sentiment_client is None:
            return 0.0
        
        try:
            sentiment_data = await self._sentiment_client.get_latest_sentiment(symbol)
            if sentiment_data:
                sentiment = sentiment_data.get("sentiment", 0.0)
                logger.debug(f"Fetched sentiment for {symbol}: {sentiment}")
                return float(sentiment)
        except Exception as e:
            logger.warning(f"Failed to fetch sentiment for {symbol}: {e}")
        
        return 0.0
    
    async def _process_price_message(self, message: IncomingMessage) -> None:
        """
        Process incoming price update message from collector-price.
        Fetches sentiment from sentiment-service via HTTP API before prediction.
        
        Expected message format from collector-price (PriceMessage):
        {
            "symbol": "BTCUSDT",
            "timestamp": 1234567890,
            "open": 100000.0,
            "high": 100500.0,
            "low": 99500.0,
            "close": 100200.0,
            "volume": 1234.56,
            "quoteVolume": 123456789.0,
            "source": "binance-futures",
            "streamType": "miniTicker"
        }
        """
        async with message.process():
            try:
                data = json.loads(message.body.decode())
                
                symbol = data.get("symbol", "").upper()
                if not symbol:
                    logger.warning("Price message missing symbol")
                    return
                
                # Extract price data - match PriceMessage format from collector-price
                price_data = {
                    "open": float(data.get("open", 0)),
                    "high": float(data.get("high", 0)),
                    "low": float(data.get("low", 0)),
                    "close": float(data.get("close", 0)),
                    "volume": float(data.get("volume", 0)),
                    "timestamp": data.get("timestamp"),
                }
                
                logger.debug(f"Received price for {symbol}: close={price_data['close']}")
                
                # Update model manager buffer
                # Note: collector-price uses miniTicker which doesn't have interval, default to 1h
                interval = data.get("interval", settings.default_interval)
                model_manager.update_price_buffer(symbol, interval, price_data)
                
                # Only auto-predict if enabled in config
                if settings.auto_predict and model_manager.can_predict(symbol, interval):
                    # Fetch sentiment from sentiment-service via HTTP API
                    sentiment = await self._fetch_sentiment_from_service(symbol)
                    model_manager.update_sentiment(symbol, sentiment)
                    
                    # Make prediction
                    prediction = model_manager.predict(symbol, interval)
                    if prediction and self._publisher:
                        await self._publisher.publish_prediction(prediction)
                
            except json.JSONDecodeError:
                logger.warning("Invalid JSON in price message")
            except Exception as e:
                logger.error(f"Error processing price message: {e}")
    
    async def _process_historical_message(self, message: IncomingMessage) -> None:
        """
        Process historical candlestick data to initialize buffer.
        
        Expected message format (HistoricalDataMessage):
        {
            "symbol": "BTCUSDT",
            "interval": "1h",
            "source": "binance-futures",
            "dataType": "historical",
            "count": 100,
            "data": [
                {"time": 123456, "open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 1000, "quoteVolume": 100000},
                ...
            ],
            "fetchedAt": 1234567890
        }
        """
        async with message.process():
            try:
                data = json.loads(message.body.decode())
                
                symbol = data.get("symbol", "").upper()
                interval = data.get("interval", settings.default_interval)
                candles = data.get("data", [])
                
                if not symbol or not candles:
                    logger.warning(f"Historical message missing symbol or data")
                    return
                
                logger.info(f"Received {len(candles)} historical candles for {symbol}/{interval}")
                
                # Add each candle to buffer - note: CandlestickData uses "time" not "timestamp"
                for candle in candles:
                    price_data = {
                        "open": float(candle.get("open", 0)),
                        "high": float(candle.get("high", 0)),
                        "low": float(candle.get("low", 0)),
                        "close": float(candle.get("close", 0)),
                        "volume": float(candle.get("volume", 0)),
                        "timestamp": candle.get("time"),  # CandlestickData uses "time"
                    }
                    model_manager.update_price_buffer(symbol, interval, price_data)
                
                buffer_status = model_manager.get_buffer_status()
                status = buffer_status.get(symbol, {}).get(interval, {})
                logger.info(f"Buffer initialized for {symbol}/{interval}: {status}")
                
            except json.JSONDecodeError:
                logger.warning("Invalid JSON in historical message")
            except Exception as e:
                logger.error(f"Error processing historical message: {e}")


# Consumer singleton
_consumer: Optional[PredictionConsumer] = None


async def get_consumer() -> PredictionConsumer:
    """Get or create the consumer singleton."""
    global _consumer
    if _consumer is None:
        _consumer = PredictionConsumer()
    return _consumer

"""
Yahoo Finance news collector for cryptocurrency news.
Uses yfinance library to collect news articles for crypto symbols.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from app.config import settings
from app.models.schemas import (
    CollectedNewsDocument,
    CollectionResult,
    DataSourceType,
    YahooNewsItem,
)

logger = logging.getLogger(__name__)


class YahooCollector:
    """
    Collector for Yahoo Finance cryptocurrency news.
    Fetches news articles related to specified crypto symbols.
    """

    def __init__(self) -> None:
        """Initialize the Yahoo Finance collector."""
        self._initialized = False

    async def collect_news(
        self,
        symbols: Optional[list[str]] = None,
        limit: Optional[int] = None,
    ) -> list[YahooNewsItem]:
        """
        Collect news for specified cryptocurrency symbols.
        
        Args:
            symbols: List of Yahoo Finance symbols (e.g., BTC-USD, ETH-USD).
            limit: Maximum news items per symbol.
            
        Returns:
            List of collected Yahoo news items.
        """
        symbols = symbols or settings.yahoo_symbols_list
        limit = limit or settings.yahoo_news_limit
        
        collected_news: list[YahooNewsItem] = []
        
        for symbol in symbols:
            try:
                logger.info(f"Collecting news for {symbol}")
                
                # Run synchronous yfinance code in thread pool
                news_items = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda s=symbol, l=limit: self._fetch_symbol_news(s, l)
                )
                
                collected_news.extend(news_items)
                logger.info(f"Collected {len(news_items)} news items for {symbol}")
                
            except Exception as e:
                logger.error(f"Error collecting news for {symbol}: {e}")
                continue
        
        return collected_news

    def _fetch_symbol_news(
        self,
        symbol: str,
        limit: int,
    ) -> list[YahooNewsItem]:
        """
        Synchronous helper to fetch news for a symbol.
        
        Args:
            symbol: Yahoo Finance symbol.
            limit: Maximum number of news items.
            
        Returns:
            List of YahooNewsItem objects.
        """
        try:
            import yfinance as yf
        except ImportError:
            raise RuntimeError(
                "yfinance library not installed. Run: pip install yfinance"
            )
        
        news_items = []
        
        try:
            ticker = yf.Ticker(symbol)
            news = ticker.news
            
            if not news:
                logger.warning(f"No news found for {symbol}")
                return []
            
            for item in news[:limit]:
                try:
                    # Parse publish time
                    publish_time = item.get("providerPublishTime", 0)
                    if isinstance(publish_time, int):
                        published_at = datetime.fromtimestamp(
                            publish_time, tz=timezone.utc
                        )
                    else:
                        published_at = datetime.now(timezone.utc)
                    
                    # Get thumbnail URL if available
                    thumbnail_url = None
                    if "thumbnail" in item and item["thumbnail"]:
                        resolutions = item["thumbnail"].get("resolutions", [])
                        if resolutions:
                            thumbnail_url = resolutions[0].get("url")
                    
                    news_item = YahooNewsItem(
                        uuid=item.get("uuid", ""),
                        title=item.get("title", ""),
                        summary=item.get("summary", item.get("title", "")),
                        link=item.get("link", ""),
                        publisher=item.get("publisher", "Yahoo Finance"),
                        symbol=symbol,
                        published_at=published_at,
                        thumbnail_url=thumbnail_url,
                    )
                    
                    # Only add if we have valid content
                    if news_item.title and news_item.link:
                        news_items.append(news_item)
                    
                except Exception as e:
                    logger.warning(f"Error parsing news item: {e}")
                    continue
            
        except Exception as e:
            logger.error(f"Error fetching news for {symbol}: {e}")
        
        return news_items

    async def collect_and_store(
        self,
        symbols: Optional[list[str]] = None,
        limit: Optional[int] = None,
    ) -> CollectionResult:
        """
        Collect news and store them in the database.
        
        Args:
            symbols: List of symbols to collect news for.
            limit: Maximum news items per symbol.
            
        Returns:
            CollectionResult with collection statistics.
        """
        import time
        from app.database import Database
        
        start_time = time.time()
        errors: list[str] = []
        new_count = 0
        
        try:
            news_items = await self.collect_news(symbols, limit)
            
            # Store in database
            collection = Database.get_collection("collected_news")
            
            for news in news_items:
                try:
                    # Check for duplicates
                    existing = await collection.find_one({
                        "source": DataSourceType.YAHOO.value,
                        "source_id": news.uuid
                    })
                    
                    if existing:
                        continue
                    
                    # Create document
                    doc = CollectedNewsDocument(
                        source=DataSourceType.YAHOO,
                        source_id=news.uuid,
                        title=news.title,
                        content=news.summary,
                        link=news.link,
                        published_at=news.published_at,
                        metadata={
                            "symbol": news.symbol,
                            "publisher": news.publisher,
                            "thumbnail_url": news.thumbnail_url,
                        }
                    )
                    
                    await collection.insert_one(doc.model_dump())
                    new_count += 1
                    
                except Exception as e:
                    errors.append(f"Error storing news {news.uuid}: {str(e)}")
            
            duration = time.time() - start_time
            
            return CollectionResult(
                source=DataSourceType.YAHOO,
                collected_count=len(news_items),
                new_count=new_count,
                analyzed_count=0,
                errors=errors,
                duration_seconds=round(duration, 2)
            )
            
        except Exception as e:
            duration = time.time() - start_time
            errors.append(f"Collection failed: {str(e)}")
            
            return CollectionResult(
                source=DataSourceType.YAHOO,
                collected_count=0,
                new_count=0,
                errors=errors,
                duration_seconds=round(duration, 2)
            )

    def convert_symbol_to_tradex(self, yahoo_symbol: str) -> str:
        """
        Convert Yahoo Finance symbol to TradeX format.
        
        Args:
            yahoo_symbol: Yahoo format (e.g., BTC-USD)
            
        Returns:
            TradeX format (e.g., BTCUSDT)
        """
        # Common conversions
        symbol_map = {
            "BTC-USD": "BTCUSDT",
            "ETH-USD": "ETHUSDT",
            "BNB-USD": "BNBUSDT",
            "SOL-USD": "SOLUSDT",
            "XRP-USD": "XRPUSDT",
            "ADA-USD": "ADAUSDT",
            "DOGE-USD": "DOGEUSDT",
            "DOT-USD": "DOTUSDT",
            "MATIC-USD": "MATICUSDT",
            "AVAX-USD": "AVAXUSDT",
        }
        
        if yahoo_symbol in symbol_map:
            return symbol_map[yahoo_symbol]
        
        # Generic conversion: remove dash, replace USD with USDT
        return yahoo_symbol.replace("-", "").replace("USD", "USDT")


# Mock collector for development/testing
class MockYahooCollector(YahooCollector):
    """Mock Yahoo collector for testing without API access."""

    async def collect_news(
        self,
        symbols: Optional[list[str]] = None,
        limit: Optional[int] = None,
    ) -> list[YahooNewsItem]:
        """Return mock Yahoo Finance news for testing."""
        from datetime import timedelta
        import random
        import uuid
        
        mock_news = [
            {
                "title": "Bitcoin ETF Sees Record Inflows as Institutional Demand Surges",
                "summary": "The spot Bitcoin ETF has seen record-breaking inflows this week as institutional investors continue to allocate capital to cryptocurrency markets.",
                "symbol": "BTC-USD",
                "publisher": "Bloomberg",
            },
            {
                "title": "Ethereum Foundation Announces Major Protocol Upgrade",
                "summary": "The Ethereum Foundation has announced plans for a significant protocol upgrade that will improve scalability and reduce transaction costs.",
                "symbol": "ETH-USD",
                "publisher": "CoinDesk",
            },
            {
                "title": "Crypto Markets Rally Amid Positive Regulatory News",
                "summary": "Cryptocurrency markets are experiencing a broad rally following positive regulatory developments in major economies.",
                "symbol": "BTC-USD",
                "publisher": "Reuters",
            },
            {
                "title": "Solana DeFi TVL Reaches New All-Time High",
                "summary": "The total value locked in Solana DeFi protocols has reached a new all-time high, signaling growing confidence in the ecosystem.",
                "symbol": "SOL-USD",
                "publisher": "The Block",
            },
            {
                "title": "Warning: Crypto Volatility Expected Ahead of Fed Decision",
                "summary": "Analysts warn of potential volatility in cryptocurrency markets ahead of the Federal Reserve's upcoming interest rate decision.",
                "symbol": "BTC-USD",
                "publisher": "CNBC",
            },
        ]
        
        symbols = symbols or settings.yahoo_symbols_list
        limit = limit or settings.yahoo_news_limit
        
        news_items = []
        now = datetime.now(timezone.utc)
        
        for i, mock in enumerate(mock_news[:limit]):
            if mock["symbol"] in symbols or not symbols:
                news_items.append(YahooNewsItem(
                    uuid=str(uuid.uuid4()),
                    title=mock["title"],
                    summary=mock["summary"],
                    link=f"https://finance.yahoo.com/news/mock-article-{i}",
                    publisher=mock["publisher"],
                    symbol=mock["symbol"],
                    published_at=now - timedelta(hours=random.randint(1, 48)),
                    thumbnail_url=None,
                ))
        
        logger.info(f"Generated {len(news_items)} mock Yahoo Finance news items")
        return news_items

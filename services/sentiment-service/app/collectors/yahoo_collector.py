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
                    # New yfinance API structure: data is inside 'content' key
                    content = item.get("content", item)
                    
                    # Parse publish time - new API uses 'pubDate' in ISO format
                    pub_date = content.get("pubDate")
                    if pub_date:
                        try:
                            published_at = datetime.fromisoformat(
                                pub_date.replace("Z", "+00:00")
                            )
                        except (ValueError, AttributeError):
                            published_at = datetime.now(timezone.utc)
                    else:
                        # Fallback to old API format
                        publish_time = content.get("providerPublishTime", 0)
                        if isinstance(publish_time, int) and publish_time > 0:
                            published_at = datetime.fromtimestamp(
                                publish_time, tz=timezone.utc
                            )
                        else:
                            published_at = datetime.now(timezone.utc)
                    
                    # Get thumbnail URL if available (new structure)
                    thumbnail_url = None
                    thumbnail = content.get("thumbnail")
                    if thumbnail:
                        resolutions = thumbnail.get("resolutions", [])
                        if resolutions:
                            thumbnail_url = resolutions[0].get("url")
                    
                    # Get link from canonicalUrl or clickThroughUrl (new API)
                    link = ""
                    canonical_url = content.get("canonicalUrl", {})
                    click_through_url = content.get("clickThroughUrl", {})
                    if canonical_url:
                        link = canonical_url.get("url", "")
                    if not link and click_through_url:
                        link = click_through_url.get("url", "")
                    # Fallback to old API
                    if not link:
                        link = content.get("link", "")
                    
                    # Get publisher (new structure)
                    publisher = "Yahoo Finance"
                    provider = content.get("provider", {})
                    if provider:
                        publisher = provider.get("displayName", "Yahoo Finance")
                    else:
                        publisher = content.get("publisher", "Yahoo Finance")
                    
                    news_item = YahooNewsItem(
                        uuid=content.get("id", item.get("id", "")),
                        title=content.get("title", ""),
                        summary=content.get("summary", content.get("title", "")),
                        link=link,
                        publisher=publisher,
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
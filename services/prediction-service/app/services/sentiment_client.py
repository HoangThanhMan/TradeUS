"""
Sentiment service client for fetching sentiment data.
"""

import logging
from typing import Optional
from datetime import datetime, timedelta

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class SentimentClient:
    """Client for interacting with the sentiment service."""
    
    def __init__(self, base_url: str = None):
        self.base_url = base_url or settings.sentiment_service_url
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=30.0,
            )
        return self._client
    
    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
    
    async def get_latest_sentiment(self, symbol: str) -> Optional[dict]:
        """
        Get the latest sentiment for a symbol.
        
        Args:
            symbol: Trading symbol (e.g., BTC-USD or BTCUSDT)
            
        Returns:
            Sentiment data dict or None
        """
        try:
            client = await self._get_client()
            
            # Sentiment service stores with BTCUSDT format, keep it as-is
            api_symbol = symbol.upper()
            
            # Use /sentiments/symbol/{symbol} endpoint (no /api prefix)
            response = await client.get(
                f"/sentiments/symbol/{api_symbol}",
                params={"limit": 1}
            )
            
            if response.status_code == 200:
                data = response.json()
                # Return the first (latest) sentiment if available
                if data and len(data) > 0:
                    return data[0]
                return None
            else:
                logger.warning(
                    f"Failed to get sentiment for {symbol}: {response.status_code}"
                )
                return None
                
        except Exception as e:
            logger.error(f"Error fetching sentiment for {symbol}: {e}")
            return None
    
    async def get_average_sentiment(
        self, 
        symbol: str, 
        hours: int = 24
    ) -> Optional[float]:
        """
        Get average sentiment for a symbol over a time period.
        
        Arsymbol
            hours: Number of hours to average over
            
        Returns:
            Average sentiment score or Nonegs:
            symbol: Trading 
        """
        try:
            client = await self._get_client()
            
            # Convert symbol format
            if "USDT" in symbol:
                api_symbol = symbol.replace("USDT", "-USD")
            else:
                api_symbol = symbol
            
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=hours)
            
            response = await client.get(
                f"/api/sentiments/aggregate",
                params={
                    "symbol": api_symbol,
                    "start_time": start_time.isoformat(),
                    "end_time": end_time.isoformat(),
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get("data", {}).get("average_sentiment")
            else:
                return None
                
        except Exception as e:
            logger.error(f"Error fetching average sentiment: {e}")
            return None
    
    async def health_check(self) -> bool:
        """Check if sentiment service is healthy."""
        try:
            client = await self._get_client()
            response = await client.get("/health")
            return response.status_code == 200
        except Exception:
            return False


# Singleton client
_sentiment_client: Optional[SentimentClient] = None


def get_sentiment_client() -> SentimentClient:
    """Get or create sentiment client singleton."""
    global _sentiment_client
    if _sentiment_client is None:
        _sentiment_client = SentimentClient()
    return _sentiment_client

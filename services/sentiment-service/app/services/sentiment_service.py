"""
Service layer for sentiment analysis.
Contains business logic for LLM-based sentiment analysis and orchestrates
the flow between input processing, analysis, and storage.
"""

import json
import logging
import random
from datetime import datetime
from typing import Any, Optional

from app.config import settings
from app.models.schemas import (
    EmotionType,
    NewsInput,
    SentimentAnalysisResult,
    SentimentDocument,
    SentimentResponse,
)
from app.repositories.sentiment_repository import SentimentRepository

logger = logging.getLogger(__name__)

# LLM Prompt for sentiment analysis
SENTIMENT_ANALYSIS_PROMPT = """You are a financial sentiment analysis expert specializing in cryptocurrency markets.

Analyze the following news article and extract sentiment information.

**News Title:** {title}

**News Content:** {content}

**Published Date:** {published_date}

**Instructions:**
1. Identify the primary cryptocurrency trading pair mentioned (e.g., BTCUSDT, ETHUSDT). If multiple are mentioned, choose the most relevant one. If none is explicitly mentioned, infer from context or use "CRYPTO" as a general symbol.
2. Determine the sentiment score from -1 (very negative) to 1 (very positive).
3. Classify the dominant emotion from: Optimism, Greed, Excitement, Fear, Anger, Pessimism.
4. Provide a brief reason (1-2 sentences) explaining your sentiment assessment.

**Response Format (JSON only, no markdown):**
{{
    "symbol": "BTCUSDT",
    "sentiment": 0.75,
    "emotion": "Optimism",
    "reason": "The article highlights strong institutional buying pressure and positive market outlook."
}}

Respond ONLY with the JSON object, no additional text or formatting."""


class SentimentService:
    """
    Service for analyzing news sentiment using LLM (Google Gemini).
    Provides methods for sentiment analysis and result persistence.
    """

    def __init__(self, repository: Optional[SentimentRepository] = None) -> None:
        """
        Initialize the sentiment service.
        
        Args:
            repository: Optional repository instance for dependency injection.
        """
        self.repository = repository or SentimentRepository()
        self._gemini_model = None

    async def analyze_and_save(self, news_input: NewsInput) -> SentimentResponse:
        """
        Analyze news sentiment and save the result to the database.
        
        This is the main entry point for sentiment analysis. It:
        1. Sends the news to the LLM for analysis
        2. Parses the LLM response
        3. Creates a document and saves it to MongoDB
        4. Returns the saved document
        
        Args:
            news_input: The news article to analyze.
            
        Returns:
            SentimentResponse: The saved sentiment analysis result.
            
        Raises:
            Exception: If analysis or storage fails.
        """
        logger.info(f"Analyzing sentiment for article: {news_input.title[:50]}...")
        
        # Perform sentiment analysis
        analysis_result = await self._analyze_sentiment(news_input)
        
        # Create document for storage
        document = SentimentDocument(
            title=news_input.title,
            published=news_input.published_date,
            link=news_input.link,
            content=news_input.content,
            symbol=analysis_result.symbol,
            sentiment=analysis_result.sentiment,
            reason=analysis_result.reason,
            emotion=analysis_result.emotion.value,
            created_at=datetime.utcnow()
        )
        
        # Save to database
        response = await self.repository.create(document)
        
        logger.info(
            f"Saved sentiment analysis: symbol={analysis_result.symbol}, "
            f"sentiment={analysis_result.sentiment:.2f}, emotion={analysis_result.emotion.value}"
        )
        
        return response

    async def _analyze_sentiment(self, news_input: NewsInput) -> SentimentAnalysisResult:
        """
        Perform sentiment analysis on news content.
        
        Uses Google Gemini API if configured, otherwise falls back to mock.
        
        Args:
            news_input: The news article to analyze.
            
        Returns:
            SentimentAnalysisResult: The analysis results.
        """
        if settings.use_mock_llm or not settings.gemini_api_key:
            logger.info("Using mock LLM for sentiment analysis")
            return await self._mock_sentiment_analysis(news_input)
        
        return await self._gemini_sentiment_analysis(news_input)

    async def _gemini_sentiment_analysis(
        self,
        news_input: NewsInput
    ) -> SentimentAnalysisResult:
        """
        Analyze sentiment using Google Gemini API.
        
        Args:
            news_input: The news article to analyze.
            
        Returns:
            SentimentAnalysisResult: The analysis results from Gemini.
        """
        try:
            import google.generativeai as genai
            
            # Configure Gemini
            genai.configure(api_key=settings.gemini_api_key)
            
            # Get or create model
            if self._gemini_model is None:
                self._gemini_model = genai.GenerativeModel(settings.gemini_model)
            
            # Format the prompt
            prompt = SENTIMENT_ANALYSIS_PROMPT.format(
                title=news_input.title,
                content=news_input.content[:5000],  # Limit content length
                published_date=news_input.published_date.isoformat()
            )
            
            # Generate response
            response = await self._gemini_model.generate_content_async(prompt)
            
            # Parse response
            result = self._parse_llm_response(response.text)
            
            logger.debug(f"Gemini analysis result: {result}")
            return result
            
        except ImportError:
            logger.warning("google-generativeai not installed, falling back to mock")
            return await self._mock_sentiment_analysis(news_input)
        except Exception as e:
            logger.error(f"Gemini API error: {e}, falling back to mock")
            return await self._mock_sentiment_analysis(news_input)

    async def _mock_sentiment_analysis(
        self,
        news_input: NewsInput
    ) -> SentimentAnalysisResult:
        """
        Mock sentiment analysis for development/testing.
        
        Provides realistic-looking results based on keyword analysis.
        
        Args:
            news_input: The news article to analyze.
            
        Returns:
            SentimentAnalysisResult: Mock analysis results.
        """
        content_lower = (news_input.title + " " + news_input.content).lower()
        
        # Simple keyword-based symbol detection
        symbol = self._detect_symbol(content_lower)
        
        # Simple keyword-based sentiment scoring
        sentiment, emotion = self._calculate_mock_sentiment(content_lower)
        
        # Generate a mock reason
        reason = self._generate_mock_reason(sentiment, emotion, symbol)
        
        return SentimentAnalysisResult(
            symbol=symbol,
            sentiment=sentiment,
            emotion=emotion,
            reason=reason
        )

    def _detect_symbol(self, content: str) -> str:
        """Detect cryptocurrency symbol from content."""
        symbol_keywords = {
            "BTCUSDT": ["bitcoin", "btc", "₿"],
            "ETHUSDT": ["ethereum", "eth", "ether"],
            "BNBUSDT": ["binance coin", "bnb"],
            "XRPUSDT": ["ripple", "xrp"],
            "SOLUSDT": ["solana", "sol"],
            "ADAUSDT": ["cardano", "ada"],
            "DOGEUSDT": ["dogecoin", "doge"],
            "DOTUSDT": ["polkadot", "dot"],
            "MATICUSDT": ["polygon", "matic"],
            "AVAXUSDT": ["avalanche", "avax"],
        }
        
        for symbol, keywords in symbol_keywords.items():
            if any(kw in content for kw in keywords):
                return symbol
        
        return "BTCUSDT"  # Default to BTC

    def _calculate_mock_sentiment(self, content: str) -> tuple[float, EmotionType]:
        """Calculate mock sentiment score and emotion from content."""
        positive_words = [
            "surge", "rally", "bull", "gain", "rise", "growth", "profit",
            "breakout", "adoption", "institutional", "invest", "success",
            "milestone", "record", "optimistic", "bullish", "moon"
        ]
        negative_words = [
            "crash", "drop", "fall", "bear", "loss", "decline", "fear",
            "sell", "dump", "panic", "warning", "risk", "fraud", "scam",
            "ban", "regulate", "pessimistic", "bearish", "plunge"
        ]
        
        positive_count = sum(1 for word in positive_words if word in content)
        negative_count = sum(1 for word in negative_words if word in content)
        
        # Calculate base sentiment
        total = positive_count + negative_count
        if total == 0:
            sentiment = random.uniform(-0.2, 0.2)
        else:
            sentiment = (positive_count - negative_count) / total
            sentiment = max(-1, min(1, sentiment + random.uniform(-0.1, 0.1)))
        
        # Determine emotion based on sentiment
        if sentiment > 0.5:
            emotion = random.choice([EmotionType.OPTIMISM, EmotionType.EXCITEMENT, EmotionType.GREED])
        elif sentiment > 0:
            emotion = EmotionType.OPTIMISM
        elif sentiment > -0.5:
            emotion = EmotionType.PESSIMISM
        else:
            emotion = random.choice([EmotionType.FEAR, EmotionType.ANGER, EmotionType.PESSIMISM])
        
        return round(sentiment, 4), emotion

    def _generate_mock_reason(
        self,
        sentiment: float,
        emotion: EmotionType,
        symbol: str
    ) -> str:
        """Generate a mock explanation for the sentiment."""
        reasons = {
            EmotionType.OPTIMISM: [
                f"Positive outlook for {symbol} based on favorable market conditions.",
                f"Article suggests bullish sentiment for {symbol} with growing adoption.",
                f"Market indicators point to continued growth for {symbol}.",
            ],
            EmotionType.GREED: [
                f"Strong FOMO indicators present for {symbol} suggesting speculative interest.",
                f"Excessive bullish sentiment detected, indicating potential {symbol} euphoria.",
            ],
            EmotionType.EXCITEMENT: [
                f"High enthusiasm around {symbol} developments and announcements.",
                f"Market showing strong excitement for {symbol} recent news.",
            ],
            EmotionType.FEAR: [
                f"Market uncertainty driving fear around {symbol} positions.",
                f"Negative news cycle creating bearish pressure on {symbol}.",
            ],
            EmotionType.ANGER: [
                f"Frustration detected regarding {symbol} market manipulation concerns.",
                f"Negative sentiment driven by regulatory concerns for {symbol}.",
            ],
            EmotionType.PESSIMISM: [
                f"Bearish outlook for {symbol} based on current market analysis.",
                f"Article indicates cautious sentiment for {symbol} in near term.",
            ],
        }
        
        return random.choice(reasons.get(emotion, reasons[EmotionType.OPTIMISM]))

    def _parse_llm_response(self, response_text: str) -> SentimentAnalysisResult:
        """
        Parse LLM JSON response into SentimentAnalysisResult.
        
        Args:
            response_text: The raw text response from the LLM.
            
        Returns:
            SentimentAnalysisResult: Parsed analysis result.
            
        Raises:
            ValueError: If response cannot be parsed.
        """
        try:
            # Clean up response (remove markdown code blocks if present)
            cleaned = response_text.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
            if cleaned.endswith("```"):
                cleaned = cleaned.rsplit("```", 1)[0]
            cleaned = cleaned.strip()
            
            # Parse JSON
            data = json.loads(cleaned)
            
            # Validate and create result
            emotion_str = data.get("emotion", "Optimism")
            try:
                emotion = EmotionType(emotion_str)
            except ValueError:
                emotion = EmotionType.OPTIMISM
            
            return SentimentAnalysisResult(
                symbol=data.get("symbol", "BTCUSDT").upper(),
                sentiment=max(-1, min(1, float(data.get("sentiment", 0)))),
                emotion=emotion,
                reason=data.get("reason", "Analysis completed.")[:500]
            )
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.error(f"Failed to parse LLM response: {e}")
            raise ValueError(f"Invalid LLM response format: {e}")

    async def get_sentiment_by_id(self, sentiment_id: str) -> Optional[SentimentResponse]:
        """
        Retrieve a sentiment analysis by ID.
        
        Args:
            sentiment_id: The MongoDB document ID.
            
        Returns:
            SentimentResponse if found, None otherwise.
        """
        return await self.repository.find_by_id(sentiment_id)

    async def get_sentiments_by_symbol(
        self,
        symbol: str,
        limit: int = 10,
        skip: int = 0
    ) -> list[SentimentResponse]:
        """
        Get sentiment analyses for a specific crypto symbol.
        
        Args:
            symbol: The crypto trading pair (e.g., BTCUSDT).
            limit: Maximum results to return.
            skip: Number of results to skip.
            
        Returns:
            List of sentiment responses.
        """
        return await self.repository.find_by_symbol(symbol, limit, skip)

    async def get_recent_sentiments(
        self,
        limit: int = 20,
        skip: int = 0
    ) -> list[SentimentResponse]:
        """
        Get the most recent sentiment analyses.
        
        Args:
            limit: Maximum results to return.
            skip: Number of results to skip.
            
        Returns:
            List of recent sentiment responses.
        """
        return await self.repository.find_recent(limit, skip)

    async def get_average_sentiment(
        self,
        symbol: str,
        days: int = 7
    ) -> Optional[dict[str, Any]]:
        """
        Get average sentiment for a symbol over a time period.
        
        Args:
            symbol: The crypto trading pair.
            days: Number of days to look back.
            
        Returns:
            Dictionary with average sentiment statistics.
        """
        return await self.repository.get_average_sentiment(symbol, days)

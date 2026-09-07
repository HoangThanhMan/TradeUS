"""
Service layer for sentiment analysis.
Contains business logic for LLM-based sentiment analysis and orchestrates
the flow between input processing, analysis, and storage.
"""

import asyncio
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

# # LLM Prompt for sentiment analysis
# SENTIMENT_ANALYSIS_PROMPT = """You are a financial sentiment analysis expert specializing in cryptocurrency markets.

# Analyze the following news article and extract sentiment information.

# **News Title:** {title}

# **News Content:** {content}

# **Published Date:** {published_date}

# **Instructions:**
# 1. Identify the primary cryptocurrency trading pair mentioned (e.g., BTCUSDT, ETHUSDT). If multiple are mentioned, choose the most relevant one. If none is explicitly mentioned, infer from context or use "CRYPTO" as a general symbol.
# 2. Determine the sentiment score from -1 (very negative) to 1 (very positive).
# 3. Classify the dominant emotion from: Optimism, Greed, Excitement, Fear, Anger, Pessimism.
# 4. Provide a brief reason (1-2 sentences) explaining your sentiment assessment.

# **Response Format (JSON only, no markdown):**
# {{
#     "symbol": "BTCUSDT",
#     "sentiment": 0.75,
#     "emotion": "Optimism",
#     "reason": "The article highlights strong institutional buying pressure and positive market outlook."
# }}

# Respond ONLY with the JSON object, no additional text or formatting."""

SENTIMENT_ANALYSIS_PROMPT = """You are an elite financial analyst and cryptocurrency market sentiment expert with deep expertise in behavioral finance, technical analysis, and market psychology.

Your task is to perform a comprehensive, institutional-grade sentiment analysis on the following news article.

═══════════════════════════════════════════════════════════════════
📰 NEWS ARTICLE FOR ANALYSIS
═══════════════════════════════════════════════════════════════════

**Title:** {title}

**Content:** {content}

**Published Date:** {published_date}

═══════════════════════════════════════════════════════════════════
📋 ANALYSIS FRAMEWORK
═══════════════════════════════════════════════════════════════════

Perform a multi-dimensional analysis covering these aspects:

### 1. SYMBOL IDENTIFICATION
- Identify the PRIMARY cryptocurrency/trading pair (e.g., BTCUSDT, ETHUSDT)
- If multiple assets mentioned, select the one with HIGHEST relevance to the core narrative
- If no specific crypto mentioned, infer from context or default to "CRYPTO"

### 2. SENTIMENT SCORING (-1.0 to +1.0)
Apply this calibrated scale:
- **+0.8 to +1.0**: Extremely bullish (major positive catalyst, breakthrough news)
- **+0.5 to +0.8**: Strongly positive (institutional adoption, favorable regulation)
- **+0.2 to +0.5**: Moderately positive (minor good news, steady growth indicators)
- **-0.2 to +0.2**: Neutral (mixed signals, balanced reporting)
- **-0.5 to -0.2**: Moderately negative (concerns raised, minor setbacks)
- **-0.8 to -0.5**: Strongly negative (significant risks, regulatory threats)
- **-1.0 to -0.8**: Extremely bearish (crisis, major negative catalyst)

### 3. EMOTION CLASSIFICATION
Select the DOMINANT market emotion from:
- **Optimism**: Confident expectation of positive outcomes
- **Greed**: Excessive desire for gains, FOMO indicators
- **Excitement**: High enthusiasm, buzz around developments
- **Fear**: Anxiety about potential losses or risks
- **Anger**: Frustration, often about manipulation or unfairness
- **Pessimism**: Negative expectations, bearish outlook

### 4. COMPREHENSIVE REASONING (CRITICAL - Be thorough!)
Your analysis MUST include:

**A) Key Catalyst Identification:**
- What is the PRIMARY driver of this news? (e.g., ETF approval, hack, partnership, regulation)
- Is this a leading indicator or lagging information?

**B) Market Impact Assessment:**
- SHORT-TERM impact (24-72 hours): How will traders react immediately?
- MEDIUM-TERM impact (1-4 weeks): What are the sustained effects?
- Potential PRICE ACTION implications (support/resistance levels affected?)

**C) Stakeholder Analysis:**
- How does this affect: Retail investors? Institutions? Miners/Validators? Developers?
- Who benefits? Who is at risk?

**D) Sentiment Drivers:**
- Quote specific phrases/keywords from the article that drive your sentiment score
- Analyze the TONE: Is it sensationalist, objective, fear-mongering, or promotional?
- Look for hidden biases or agenda in the reporting

**E) Risk Factors & Contrarian View:**
- What could go WRONG with the bullish thesis (or right with bearish)?
- Are there any red flags or overlooked concerns?
- What is the market potentially NOT pricing in?

**F) Confidence Level:**
- How reliable is this news source?
- Is this speculation or confirmed information?
- Are there conflicting reports?

═══════════════════════════════════════════════════════════════════
📤 RESPONSE FORMAT
═══════════════════════════════════════════════════════════════════

Respond ONLY with a valid JSON object (no markdown, no extra text):

{{
    "symbol": "BTCUSDT",
    "sentiment": 0.72,
    "emotion": "Optimism",
    "reason": "COMPREHENSIVE ANALYSIS HERE - This must be 5-8 sentences covering: (1) The primary catalyst identified in the article [specific quote/fact]. (2) Immediate market implications - how this affects supply/demand dynamics and trader psychology. (3) Medium-term outlook and potential price action scenarios. (4) Key stakeholders impacted and their likely response. (5) Risk factors or contrarian considerations that could invalidate this thesis. (6) Confidence assessment based on source reliability and information quality. The tone of the article [describe tone] supports the [emotion] classification because [specific language examples]."
}}

IMPORTANT: The 'reason' field should be a comprehensive paragraph (150-250 words) that demonstrates deep analytical thinking, NOT a superficial summary."""

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
        
        # If symbol_hint is provided and LLM returned a generic/default symbol, prefer the hint
        if news_input.symbol_hint and analysis_result.symbol == "BTCUSDT":
            hint_upper = news_input.symbol_hint.upper()
            # Only override if hint is different and looks valid
            if hint_upper != "BTCUSDT" and hint_upper.endswith("USDT"):
                logger.info(f"Overriding LLM symbol {analysis_result.symbol} with hint {hint_upper}")
                analysis_result.symbol = hint_upper
        
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
            backend=analysis_result.backend,
            created_at=datetime.utcnow()
        )
        
        # Save to database
        response = await self.repository.create(document)
        
        logger.info(
            f"Saved sentiment analysis: symbol={analysis_result.symbol}, "
            f"sentiment={analysis_result.sentiment:.2f}, "
            f"emotion={analysis_result.emotion.value}, "
            f"backend={analysis_result.backend}"
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
        # An explicit mock override wins over everything else.
        if settings.use_mock_llm:
            logger.info("Using mock LLM for sentiment analysis")
            result = await self._mock_sentiment_analysis(news_input)
            result.backend = result.backend or "mock"
            return result

        # Checked before the API-key guard: running locally is precisely the
        # case where there is no Gemini key to configure, so requiring one
        # would defeat the point of the local backend.
        if settings.sentiment_backend == "local":
            result = await self._local_sentiment_analysis(news_input)
            if result is not None:
                return result
            # Local inference failed. Fall through to the API path so switching
            # backends can degrade but never break the pipeline.
            logger.warning("Local backend unavailable, falling back to Gemini")

        if not settings.gemini_api_key:
            logger.info("No Gemini API key configured, using mock LLM")
            result = await self._mock_sentiment_analysis(news_input)
            result.backend = result.backend or "mock"
            return result

        return await self._gemini_sentiment_analysis(news_input)

    async def _local_sentiment_analysis(
        self,
        news_input: NewsInput
    ) -> Optional[SentimentAnalysisResult]:
        """
        Score the article with the local encoder instead of calling Gemini.

        Returns None rather than raising when the model cannot be loaded or run,
        so the caller can fall back to the API path.

        The local model produces a score and an emotion but no written
        rationale. The reason field says so explicitly rather than synthesising
        analysis the model never performed.

        Args:
            news_input: The news article to analyze.

        Returns:
            SentimentAnalysisResult, or None if local inference is unavailable.
        """
        try:
            from app.ml.local_model import get_local_model

            model = get_local_model()
            text = f"{news_input.title}\n\n{news_input.content[:5000]}"

            # Torch inference is blocking CPU work; keep it off the event loop.
            score, emotion_label = await asyncio.to_thread(model.predict, text)
        except Exception as e:
            logger.error(f"Local sentiment inference failed: {e}", exc_info=True)
            return None

        try:
            emotion = EmotionType(emotion_label)
        except ValueError:
            emotion = EmotionType.OPTIMISM

        resolved_hint = self._resolve_symbol_hint(news_input)
        symbol = resolved_hint or self._detect_symbol(
            (news_input.title + " " + news_input.content).lower()
        )

        backend = f"local:{settings.local_model_variant}"
        reason = (
            f"Scored locally by the {settings.local_model_variant} model "
            f"({model.describe().get('base_model', 'unknown base')}): "
            f"sentiment {score:+.3f}, emotion {emotion.value}. "
            "This backend returns scores only — no written rationale is "
            "generated, so no explanatory text should be attributed to it."
        )

        logger.debug(
            f"Local sentiment: {symbol} {score:+.3f} {emotion.value} via {backend}"
        )

        return SentimentAnalysisResult(
            symbol=symbol,
            sentiment=max(-1.0, min(1.0, float(score))),
            emotion=emotion,
            reason=reason,
            backend=backend,
        )

    def _resolve_symbol_hint(self, news_input: NewsInput) -> Optional[str]:
        """Convert symbol_hint to TradeX format (XXXUSDT) if provided."""
        if not news_input.symbol_hint:
            return None
        hint = news_input.symbol_hint.upper()
        if hint.endswith("USDT"):
            return hint
        # Convert Yahoo format: BTC-USD -> BTCUSDT
        if "-USD" in hint:
            return hint.replace("-USD", "USDT").replace("-", "")
        return hint + "USDT"

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
            symbol_context = ""
            resolved_hint = self._resolve_symbol_hint(news_input)
            if resolved_hint:
                symbol_context = f"\n\n**Source Symbol:** {resolved_hint} (This article was collected from the {news_input.symbol_hint} feed. Use this symbol unless the article is clearly about a different cryptocurrency.)\n"
            
            prompt = SENTIMENT_ANALYSIS_PROMPT.format(
                title=news_input.title,
                content=news_input.content[:5000],  # Limit content length
                published_date=news_input.published_date.isoformat()
            )
            
            # Insert symbol context after the article section
            if symbol_context:
                prompt = prompt + symbol_context
            
            # Generate response
            response = await self._gemini_model.generate_content_async(prompt)
            
            # Parse response
            result = self._parse_llm_response(response.text)
            result.backend = "gemini"
            
            logger.debug(f"Gemini analysis result: {result}")
            return result
            
        except ImportError:
            logger.warning("google-generativeai not installed, falling back to mock")
            result = await self._mock_sentiment_analysis(news_input)
            result.backend = "mock"
            return result
        except Exception as e:
            # Logged at ERROR because a silent fallback here is indistinguishable
            # from a healthy pipeline -- the stored `backend` field is the only
            # durable record that Gemini did not answer.
            logger.error(f"Gemini API error: {e}, falling back to mock")
            result = await self._mock_sentiment_analysis(news_input)
            result.backend = "mock"
            return result

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
        
        # Use symbol_hint if provided, otherwise detect from content
        resolved_hint = self._resolve_symbol_hint(news_input)
        if resolved_hint:
            symbol = resolved_hint
        else:
            symbol = self._detect_symbol(content_lower)
        
        # Simple keyword-based sentiment scoring
        sentiment, emotion = self._calculate_mock_sentiment(content_lower)
        
        # Generate a mock reason
        reason = self._generate_mock_reason(sentiment, emotion, symbol)
        
        return SentimentAnalysisResult(
            symbol=symbol,
            sentiment=sentiment,
            emotion=emotion,
            reason=reason,
            backend="mock"
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
        """Generate a comprehensive mock explanation for the sentiment."""
        reasons = {
            EmotionType.OPTIMISM: [
                f"The article presents a constructive outlook for {symbol}, driven by favorable market conditions and growing institutional interest. Key catalysts include expanding adoption metrics and positive on-chain data suggesting accumulation patterns. The measured tone of the reporting indicates confidence without excessive hype, supporting a moderately bullish sentiment. Short-term price action may see support at current levels with potential upside in the coming weeks. Risk factors include broader macro uncertainty, though the overall narrative remains positive for medium-term holders.",
                f"Analysis reveals bullish undertones for {symbol} based on multiple positive indicators mentioned in the article. The report highlights increasing network activity and declining exchange reserves, suggesting supply-side pressure that could favor price appreciation. Institutional flows appear steady with no signs of distribution. The language used is optimistic but grounded, avoiding sensationalism while emphasizing fundamental improvements. Traders should monitor key resistance levels as a breakout could accelerate momentum.",
            ],
            EmotionType.GREED: [
                f"Strong FOMO (Fear Of Missing Out) signals detected for {symbol}, with the article emphasizing rapid gains and 'once-in-a-lifetime' opportunity language. The sentiment score reflects heightened speculative interest, which historically precedes volatile price action. While short-term momentum may continue, the excessive bullishness raises caution flags for risk-aware traders. The article's promotional tone and focus on price targets rather than fundamentals suggests retail-driven euphoria. Contrarian analysis suggests potential for sharp corrections once profit-taking begins.",
                f"The article displays characteristics of peak greed phase for {symbol}, with multiple references to price predictions and lifestyle gains. Key warning signs include lack of risk disclosure, emphasis on FOMO, and absence of balanced analysis. While momentum traders may benefit short-term, the sentiment extreme suggests elevated reversal risk. Smart money indicators should be monitored for distribution patterns. Historical precedent shows such euphoric coverage often marks local tops.",
            ],
            EmotionType.EXCITEMENT: [
                f"High enthusiasm permeates the {symbol} coverage, driven by significant technological or partnership announcements. The article's energetic tone reflects genuine market excitement about new developments that could expand utility or adoption. Unlike pure speculation, this excitement appears anchored to tangible catalysts with measurable impact potential. Short-term volatility is expected as traders position around the news, with the medium-term outlook dependent on execution of announced initiatives. The balanced coverage of both opportunities and implementation challenges adds credibility to the bullish thesis.",
                f"The market shows elevated excitement for {symbol} following breakthrough developments detailed in the article. The enthusiasm appears justified given the scale of announcements, though implementation risk remains a consideration. Trading volumes and social metrics likely to spike in coming sessions. The article maintains journalistic objectivity while conveying the significance of developments, suggesting this is substantive news rather than manufactured hype. Price discovery phase expected as market digests implications.",
            ],
            EmotionType.FEAR: [
                f"The article conveys significant market anxiety around {symbol}, with emphasis on downside risks and cautionary language. Key concerns include regulatory uncertainty, security vulnerabilities, or adverse market conditions detailed in the coverage. The fearful sentiment may present contrarian opportunities for long-term investors, though short-term price pressure is likely as weak hands exit positions. Risk management is paramount in current conditions. The article's focus on worst-case scenarios, while potentially valid, may also reflect media negativity bias during market downturns.",
                f"Fear-driven sentiment dominates {symbol} coverage, with the article highlighting multiple risk factors and potential threats to the asset. While some concerns appear legitimate and warrant attention, the overall tone may be excessively pessimistic. Capitulation indicators should be monitored for potential bottom signals. The article lacks balance, focusing predominantly on bearish scenarios without acknowledging countervailing bullish factors. This asymmetric coverage often intensifies at market lows.",
            ],
            EmotionType.ANGER: [
                f"The article reflects market frustration regarding {symbol}, with pointed criticism of market manipulation, governance failures, or broken promises. The angry sentiment stems from perceived unfair treatment of retail participants or failure of project leadership to deliver on commitments. While the criticism may be valid, emotion-driven trading decisions during such periods often prove costly. The article's accusatory tone and calls for action suggest community tensions that could impact price and development progress. Long-term implications depend on project team response to concerns.",
                f"Strong frustration detected in {symbol} coverage, with the article detailing grievances about market structure, insider behavior, or regulatory overreach. The anger appears directed at specific actors or decisions rather than the asset fundamentally. Such sentiment often creates short-term selling pressure but may not reflect long-term value proposition. The confrontational language suggests community divisions that require resolution. Trading during high-emotion periods carries elevated risk.",
            ],
            EmotionType.PESSIMISM: [
                f"The article presents a bearish outlook for {symbol}, citing multiple headwinds and unfavorable market conditions. Key concerns include declining metrics, competitive pressures, or structural challenges that may limit upside potential. While the pessimism appears well-reasoned based on presented evidence, extreme negative sentiment historically has coincided with attractive entry points for patient investors. The measured, analytical tone of the coverage suggests professional concern rather than retail panic. Risk-reward assessment should account for potential value at current depressed sentiment levels.",
                f"Cautious sentiment prevails in {symbol} analysis, with the article methodically outlining challenges facing the asset. The pessimistic outlook is supported by data-driven arguments about fundamentals, competition, and macro factors. Short-term price action likely to remain subdued until catalyst emergence. The article's avoidance of sensationalism while maintaining bearish stance suggests informed skepticism rather than uninformed fear. Accumulation opportunities may emerge for those with longer time horizons and higher risk tolerance.",
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
                reason=data.get("reason", "Analysis completed.")[:1500]  # Increased limit for detailed analysis
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

    async def get_negative_sentiments_today(
        self,
        symbol: Optional[str] = None,
        threshold: float = 0.0,
        limit: int = 50
    ) -> list[SentimentResponse]:
        """
        Get today's negative sentiment analyses.

        Args:
            symbol: Optional symbol filter.
            threshold: Maximum sentiment score (exclusive). Default 0.
            limit: Maximum results to return.

        Returns:
            List of negative sentiment responses from today.
        """
        from datetime import timezone

        now = datetime.now(timezone.utc)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return await self.repository.find_negative_by_date(
            start_date=start_of_day,
            end_date=now,
            symbol=symbol,
            threshold=threshold,
            limit=limit,
        )

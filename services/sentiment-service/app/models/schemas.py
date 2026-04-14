"""
Pydantic models/schemas for Sentiment Service.
Defines input/output data structures for the API and database.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class EmotionType(str, Enum):
    """Enumeration of possible emotion types for sentiment analysis."""
    
    OPTIMISM = "Optimism"
    GREED = "Greed"
    EXCITEMENT = "Excitement"
    FEAR = "Fear"
    ANGER = "Anger"
    PESSIMISM = "Pessimism"


class NewsInput(BaseModel):
    """
    Input schema for news data to be analyzed.
    Accepts news articles for sentiment analysis.
    """
    
    title: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Title of the news article",
        examples=["Bitcoin Surges Past $100,000 Amid Institutional Buying"]
    )
    content: str = Field(
        ...,
        min_length=10,
        max_length=50000,
        description="Full content/body of the news article",
        examples=["Bitcoin has reached a new all-time high..."]
    )
    link: str = Field(
        ...,
        description="URL/link to the original news article",
        examples=["https://example.com/news/bitcoin-surges"]
    )
    published_date: datetime = Field(
        ...,
        description="Publication date of the news article",
        examples=["2026-01-05T10:30:00Z"]
    )
    symbol_hint: Optional[str] = Field(
        None,
        description="Optional symbol hint from the news source (e.g., BTC-USD). Used to improve symbol detection accuracy.",
        examples=["BTC-USD", "BTCUSDT"]
    )

    @field_validator("link")
    @classmethod
    def validate_link(cls, v: str) -> str:
        """Validate that the link is a valid URL."""
        if not v.startswith(("http://", "https://")):
            raise ValueError("Link must be a valid HTTP/HTTPS URL")
        return v


class SentimentAnalysisResult(BaseModel):
    """
    Result from the LLM sentiment analysis.
    Contains extracted crypto symbol, sentiment score, emotion, and reasoning.
    """
    
    symbol: str = Field(
        ...,
        description="The crypto trading pair mentioned (e.g., BTCUSDT)",
        examples=["BTCUSDT", "ETHUSDT", "BNBUSDT"]
    )
    sentiment: float = Field(
        ...,
        ge=-1.0,
        le=1.0,
        description="Sentiment score from -1 (Negative) to 1 (Positive)",
        examples=[0.85, -0.5, 0.0]
    )
    emotion: EmotionType = Field(
        ...,
        description="The dominant emotion detected in the content",
        examples=[EmotionType.OPTIMISM, EmotionType.FEAR]
    )
    reason: str = Field(
        ...,
        max_length=2000,
        description="Comprehensive explanation for the sentiment analysis result",
        examples=["The article presents a constructive outlook driven by favorable market conditions and growing institutional interest. Key catalysts include expanding adoption metrics and positive on-chain data."]
    )


class SentimentDocument(BaseModel):
    """
    MongoDB document schema for storing sentiment analysis results.
    This is the complete record stored in the 'sentiments' collection.
    """
    
    title: str = Field(..., description="Title of the analyzed news article")
    published: datetime = Field(..., description="Publication date of the article")
    link: str = Field(..., description="URL to the original article")
    content: str = Field(..., description="Full content of the article")
    symbol: str = Field(..., description="Crypto trading pair (e.g., BTCUSDT)")
    sentiment: float = Field(..., description="Sentiment score (-1 to 1)")
    reason: str = Field(..., description="Explanation for the sentiment")
    emotion: str = Field(..., description="Detected emotion")
    created_at: datetime = Field(
        default_factory=lambda: datetime.utcnow(),
        description="Timestamp when the record was created"
    )

    class Config:
        """Pydantic model configuration."""
        
        json_schema_extra = {
            "example": {
                "title": "Bitcoin Surges Past $100,000",
                "published": "2026-01-05T10:30:00Z",
                "link": "https://example.com/news/bitcoin-surges",
                "content": "Bitcoin has reached a new all-time high...",
                "symbol": "BTCUSDT",
                "sentiment": 0.85,
                "reason": "Strong positive sentiment due to institutional adoption",
                "emotion": "Optimism",
                "created_at": "2026-01-05T12:00:00Z"
            }
        }

class SentimentResponse(BaseModel):
    """
    API response schema for sentiment analysis endpoint.
    Includes the document ID and analysis results.
    """
    
    id: str = Field(..., description="MongoDB document ID")
    title: str = Field(..., description="Title of the analyzed article")
    published: datetime = Field(..., description="Publication date")
    link: str = Field(..., description="URL to the original article")
    symbol: str = Field(..., description="Crypto trading pair")
    sentiment: float = Field(..., description="Sentiment score (-1 to 1)")
    emotion: str = Field(..., description="Detected emotion")
    reason: str = Field(..., description="Explanation for the sentiment")
    created_at: Optional[datetime] = Field(None, description="Record creation timestamp")

    class Config:
        """Pydantic model configuration."""
        
        from_attributes = True


# =============================================================================
# Data Source Enums and Collector Schemas
# =============================================================================

class DataSourceType(str, Enum):
    """Enumeration of data source types for news collection."""
    
    REDDIT = "reddit"
    YAHOO = "yahoo"
    MANUAL = "manual"
    RSS = "rss"


class RedditPost(BaseModel):
    """
    Schema for Reddit post data.
    Represents a post collected from Reddit.
    """
    
    post_id: str = Field(..., description="Reddit post ID")
    subreddit: str = Field(..., description="Subreddit name")
    title: str = Field(..., description="Post title")
    content: str = Field(..., description="Post body/selftext")
    author: str = Field(..., description="Reddit username")
    url: str = Field(..., description="Permalink to the post")
    score: int = Field(default=0, description="Post upvote score")
    num_comments: int = Field(default=0, description="Number of comments")
    created_utc: datetime = Field(..., description="Post creation timestamp")
    flair: Optional[str] = Field(None, description="Post flair/tag")

    def to_news_input(self) -> "NewsInput":
        """Convert Reddit post to NewsInput for sentiment analysis."""
        return NewsInput(
            title=self.title,
            content=self.content if self.content else self.title,
            link=self.url,
            published_date=self.created_utc
        )


class YahooNewsItem(BaseModel):
    """
    Schema for Yahoo Finance news data.
    Represents a news article from Yahoo Finance.
    """
    
    uuid: str = Field(..., description="Yahoo news UUID")
    title: str = Field(..., description="News headline")
    summary: str = Field(..., description="News summary/description")
    link: str = Field(..., description="URL to the full article")
    publisher: str = Field(..., description="News publisher name")
    symbol: str = Field(..., description="Related stock/crypto symbol")
    published_at: datetime = Field(..., description="Publication timestamp")
    thumbnail_url: Optional[str] = Field(None, description="Thumbnail image URL")

    def to_news_input(self) -> "NewsInput":
        """Convert Yahoo news to NewsInput for sentiment analysis."""
        return NewsInput(
            title=self.title,
            content=self.summary,
            link=self.link,
            published_date=self.published_at
        )


class CollectedNewsDocument(BaseModel):
    """
    MongoDB document for storing raw collected news before analysis.
    Stores news from various sources for later processing.
    """
    
    source: DataSourceType = Field(..., description="Source of the news")
    source_id: str = Field(..., description="Unique ID from the source")
    title: str = Field(..., description="News title")
    content: str = Field(..., description="News content/body")
    link: str = Field(..., description="URL to original")
    published_at: datetime = Field(..., description="Publication date")
    collected_at: datetime = Field(
        default_factory=lambda: datetime.utcnow(),
        description="When the news was collected"
    )
    metadata: dict = Field(default_factory=dict, description="Additional source-specific data")
    analyzed: bool = Field(default=False, description="Whether sentiment was analyzed")
    sentiment_id: Optional[str] = Field(None, description="Reference to sentiment analysis result")


class CollectionResult(BaseModel):
    """Response schema for data collection operations."""
    
    source: DataSourceType = Field(..., description="Source that was collected")
    collected_count: int = Field(..., description="Number of items collected")
    new_count: int = Field(..., description="Number of new items (not duplicates)")
    analyzed_count: int = Field(default=0, description="Number of items analyzed")
    errors: list[str] = Field(default_factory=list, description="Any errors encountered")
    duration_seconds: float = Field(..., description="Time taken for collection")


class CollectionRequest(BaseModel):
    """Request schema for triggering data collection."""
    
    analyze_immediately: bool = Field(
        default=True,
        description="Whether to analyze collected news immediately"
    )
    limit: Optional[int] = Field(
        None,
        ge=1,
        le=100,
        description="Override default collection limit"
    )


class RedditCollectionRequest(CollectionRequest):
    """Request schema for Reddit collection."""
    
    subreddits: Optional[list[str]] = Field(
        None,
        description="Specific subreddits to collect from (overrides config)"
    )
    time_filter: str = Field(
        default="day",
        description="Time filter: hour, day, week, month, year, all"
    )


class YahooCollectionRequest(CollectionRequest):
    """Request schema for Yahoo Finance collection."""
    
    symbols: Optional[list[str]] = Field(
        None,
        description="Specific symbols to collect news for (overrides config)"
    )

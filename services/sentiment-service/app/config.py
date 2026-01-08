"""
Configuration module for Sentiment Service.
Reads settings from environment variables with sensible defaults.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Service info
    service_name: str = "sentiment-service"
    version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8001
    debug: bool = False

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # CORS (for development)
    cors_origins: str = "*"

    # RabbitMQ configuration
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    enable_rabbitmq: bool = True  # Set to False to disable RabbitMQ
    enable_rabbitmq_consumer: bool = True  # Enable/disable message consumers
    
    # Sentiment alert threshold
    sentiment_alert_threshold: float = 0.8  # Trigger alert when |sentiment| >= threshold

    # Redis configuration
    redis_url: str = "redis://localhost:6379"

    # MongoDB configuration
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_database: str = "tradex_sentiment"

    # Google Gemini API configuration
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    use_mock_llm: bool = True  # Set to False to use real Gemini API

    # Reddit API configuration (for data collection)
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "TradeX-Sentiment-Bot/1.0"
    reddit_subreddits: str = "cryptocurrency,bitcoin,ethereum,CryptoMarkets"
    reddit_post_limit: int = 25

    # Yahoo Finance configuration
    yahoo_symbols: str = "BTC-USD,ETH-USD,BNB-USD,SOL-USD,XRP-USD"
    yahoo_news_limit: int = 10

    @property
    def reddit_subreddits_list(self) -> list[str]:
        """Parse Reddit subreddits as a list."""
        return [sub.strip() for sub in self.reddit_subreddits.split(",")]

    @property
    def yahoo_symbols_list(self) -> list[str]:
        """Parse Yahoo symbols as a list."""
        return [sym.strip() for sym in self.yahoo_symbols.split(",")]

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins as a list."""
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Export settings instance
settings = get_settings()

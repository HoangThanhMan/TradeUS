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
    mongodb_database: str = "tradex"

    # Google Gemini API configuration
    # No default: a key committed to the repo is a key that gets revoked. The
    # previous hardcoded default was suspended by Google for exactly that
    # reason. Empty means the service falls back to the keyword mock, which is
    # visible in /health and in each record's `backend` field.
    gemini_api_key: str = ""
    # gemini-1.5-flash đã bị Google gỡ. Đổi được qua env GEMINI_MODEL.
    gemini_model: str = "gemini-3.6-flash"
    use_mock_llm: bool = False  # Set to False to use real Gemini API

    # Sentiment backend selection
    # "gemini" -> call the Gemini API (default; unchanged behaviour)
    # "local"  -> score with the local encoder in app/ml/local_model.py
    # Gemini stays the fallback when local inference fails, so switching
    # backends can degrade but never break the pipeline.
    sentiment_backend: Literal["gemini", "local"] = "gemini"

    # Local backend configuration (only read when sentiment_backend == "local")
    # "student" -> the LoRA adapter from training/train_distill.py
    # "base"    -> the public checkpoint with no adapter. Measured at 66.0%
    #              bucket accuracy vs the student's 58.0% on the hand-labelled
    #              set (see services/sentiment-service/training/report.md), so
    #              this is currently the better local option.
    local_model_variant: Literal["student", "base"] = "student"
    local_model_dir: str = "training/artifacts"
    local_model_base: str = (
        "mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis"
    )
    local_max_length: int = 256
    local_model_device: str = ""  # "" -> auto-detect, or "cpu" / "cuda"
    local_model_warmup: bool = True  # load at startup instead of on first request

    # Reddit API configuration (for data collection)
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "TradeX-Sentiment-Bot/1.0"
    reddit_subreddits: str = "cryptocurrency,bitcoin,ethereum,CryptoMarkets"
    reddit_post_limit: int = 25

    # Yahoo Finance configuration
    yahoo_symbols: str = "BTC-USD,ETH-USD,BNB-USD,SOL-USD,XRP-USD"
    yahoo_news_limit: int = 10

    # Scheduler configuration
    enable_scheduler: bool = True  # Enable/disable automatic news collection
    collection_interval_seconds: int = 300  # 5 minutes (5 * 60 seconds)
    collection_limit: int = 10  # Number of items to collect per source
    collection_analyze_immediately: bool = True  # Analyze news immediately after collection

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

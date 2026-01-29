"""
Configuration module for Prediction Service.
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
    service_name: str = "prediction-service"
    version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8002
    debug: bool = False

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # CORS (for development)
    cors_origins: str = "*"

    # RabbitMQ configuration
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    enable_rabbitmq: bool = True
    enable_rabbitmq_consumer: bool = True

    # Redis configuration
    redis_url: str = "redis://localhost:6379"

    # MongoDB configuration
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_database: str = "tradex_predictions"

    # Model Configuration
    model_path: str = "models\crypto_predictor_btcusdt.pt"
    default_symbol: str = "BTCUSDT"
    default_interval: str = "1h"

    # Sentiment Service
    sentiment_service_url: str = "http://localhost:8001"

    # Prediction Settings
    prediction_cache_ttl: int = 60  # seconds
    price_buffer_size: int = 100  # number of candles to keep in buffer
    auto_predict: bool = False  # If True, auto predict when new price arrives; If False, only predict via API

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

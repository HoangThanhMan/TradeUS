"""
Configuration module for Email Service.
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
    service_name: str = "email-service"
    version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8003
    debug: bool = False

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # CORS
    cors_origins: str = "*"

    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    enable_rabbitmq: bool = True

    # Gmail SMTP
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""  # Gmail address
    smtp_password: str = ""  # Gmail App Password (16 chars)
    smtp_from_email: str = ""  # Auto-filled from smtp_username if empty
    smtp_from_name: str = "USTrading"

    # Email strategy: smtp (Gmail) | console (dev)
    email_strategy: Literal["smtp", "console"] = "smtp"

    # Alert notification exchange (publish email status to ws-gateway)
    alert_exchange: str = "alert.exchange"
    alert_routing_key: str = "alert.email.status"

    @property
    def cors_origins_list(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

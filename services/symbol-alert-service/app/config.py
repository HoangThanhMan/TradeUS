"""
Configuration for Symbol Alert Service.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    service_name: str = "symbol-alert-service"
    version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"

    host: str = "0.0.0.0"
    port: int = 8004
    debug: bool = False

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    cors_origins: str = "*"

    # RabbitMQ
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    enable_rabbitmq: bool = True

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Cooldown: minimum seconds between two alerts for the same user+symbol
    alert_cooldown_seconds: int = 300

    # Subscription service (HTTP)
    subscription_service_url: str = "http://localhost:8005"

    # User service (HTTP) – to lookup real user email
    user_service_url: str = "http://localhost:3010"

    # Email exchange (publish email requests)
    email_exchange: str = "email.exchange"
    email_routing_key: str = "email.send.alert"

    # Alert notification exchange (publish to ws-gateway)
    alert_exchange: str = "alert.exchange"
    alert_routing_key: str = "alert.notification.#"

    @property
    def cors_origins_list(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

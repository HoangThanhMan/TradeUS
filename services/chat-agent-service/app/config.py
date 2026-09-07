"""
Configuration module for Chat Agent Service.
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
    service_name: str = "chat-agent-service"
    version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"

    # Server settings (the FastAPI app itself lands in T3.1)
    host: str = "0.0.0.0"
    port: int = 8006
    debug: bool = False

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # MongoDB — source of the articles to embed
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_databases: str = "tradex_sentiment,tradex"
    collected_news_collection: str = "collected_news"

    # Qdrant
    # Either a running server (qdrant_url) or an embedded on-disk store
    # (qdrant_path). The embedded mode exists so the ingestion and search paths
    # can be exercised without Docker; the API is identical either way.
    qdrant_url: str = "http://localhost:6333"
    qdrant_path: str = ""  # non-empty -> embedded local mode, ignores qdrant_url
    qdrant_api_key: str = ""
    qdrant_collection: str = "news_chunks"
    qdrant_timeout: int = 30

    # Embeddings
    # "gemini" -> Google embedding API (the intended production path)
    # "local"  -> a small sentence encoder run on CPU, no API key required
    embedding_backend: Literal["gemini", "local"] = "gemini"
    gemini_api_key: str = ""
    # models/embedding-001 đã bị Google gỡ. Bản thay thế trả 3072 chiều (cũ 768),
    # nên collection Qdrant cũ không dùng lại được — phải ingest lại với
    # --recreate. Đổi được qua env GEMINI_EMBEDDING_MODEL.
    gemini_embedding_model: str = "models/gemini-embedding-001"
    local_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_batch_size: int = 16

    # Chunking — one chunk per article at this corpus's length
    max_chunk_chars: int = 2000

    # Downstream services called by the agent tools
    prediction_service_url: str = "http://localhost:8002"
    sentiment_service_url: str = "http://localhost:8001"
    tool_timeout: float = 10.0

    # Agent loop
    # "gemini" -> real function calling (needs GEMINI_API_KEY)
    # "rules"  -> deterministic keyword planner over the same tools, no LLM
    # Gemini falls back to rules on failure, so the endpoint always answers.
    agent_backend: Literal["gemini", "rules"] = "gemini"
    # gemini-2.0-flash đã bị Google gỡ ("no longer available"). Google gỡ model
    # khá thường xuyên, nên đổi được qua env GEMINI_MODEL mà không cần build lại.
    gemini_model: str = "gemini-3.6-flash"
    max_tool_rounds: int = 3
    stream_delay_ms: int = 12  # paces SSE chunks so streaming reads as live
    warmup_on_startup: bool = True  # preload the embedder instead of on request 1

    # Let search_news degrade to local embeddings if Gemini embeddings fail.
    # Safe at query time (one throwaway vector), unlike ingestion where a
    # backend switch would corrupt the collection.
    embedding_allow_fallback: bool = True

    # CORS
    cors_origins: str = "*"

    @property
    def mongodb_databases_list(self) -> list[str]:
        """Parse the comma-separated database list."""
        return [db.strip() for db in self.mongodb_databases.split(",") if db.strip()]

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

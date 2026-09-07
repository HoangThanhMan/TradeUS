"""
Embedding providers for the news retrieval index.

Two backends, selected by ``EMBEDDING_BACKEND``:

``gemini``
    Google's embedding API — the intended production path, and the one the
    improvement plan specifies. Keeps the service on a single provider.

``local``
    A small sentence encoder run on CPU. No API key, no per-call cost, and it
    keeps the ingestion and retrieval paths runnable while the Gemini key is
    unavailable. Different vector dimension, so the two are not interchangeable
    within one collection -- see ``dimension``.

Both expose the same interface, and both distinguish *document* embeddings from
*query* embeddings. That distinction matters for retrieval quality: Gemini's API
takes an explicit ``task_type``, and asymmetric models score noticeably better
when the two sides are encoded differently.
"""

from __future__ import annotations

import logging
from typing import Protocol

logger = logging.getLogger(__name__)


class Embedder(Protocol):
    """The interface the ingestion and search scripts depend on."""

    name: str
    dimension: int

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of articles for storage."""
        ...

    def embed_query(self, text: str) -> list[float]:
        """Embed a single search query."""
        ...


class GeminiEmbedder:
    """Embeddings from Google's embedding API."""

    # models/embedding-001 returns 768 dimensions. Newer models differ, so the
    # dimension is probed on first use rather than hardcoded.
    def __init__(self, api_key: str, model: str = "models/embedding-001") -> None:
        if not api_key:
            raise ValueError(
                "EMBEDDING_BACKEND=gemini requires GEMINI_API_KEY. "
                "Set it, or use EMBEDDING_BACKEND=local."
            )
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        self._genai = genai
        self.model = model
        self.name = f"gemini:{model}"
        self._dimension: int | None = None

    @property
    def dimension(self) -> int:
        """Vector width, probed once with a throwaway embedding call."""
        if self._dimension is None:
            self._dimension = len(self._embed_one("dimension probe", "retrieval_query"))
        return self._dimension

    def _embed_one(self, text: str, task_type: str) -> list[float]:
        """Embed a single string with the given task type."""
        response = self._genai.embed_content(
            model=self.model, content=text, task_type=task_type
        )
        return list(response["embedding"])

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed articles for storage."""
        return [self._embed_one(text, "retrieval_document") for text in texts]

    def embed_query(self, text: str) -> list[float]:
        """Embed a search query."""
        return self._embed_one(text, "retrieval_query")


class LocalEmbedder:
    """
    Mean-pooled sentence embeddings from a small local encoder.

    Mean pooling over unmasked tokens followed by L2 normalisation is exactly
    what the sentence-transformers wrapper does for this checkpoint, so the
    vectors match what that library would produce without taking the extra
    dependency.
    """

    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2") -> None:
        import torch
        from transformers import AutoModel, AutoTokenizer

        logger.info("Loading local embedding model: %s", model_name)
        self._torch = torch
        self._tokenizer = AutoTokenizer.from_pretrained(model_name)
        self._model = AutoModel.from_pretrained(model_name)
        self._model.eval()

        self.name = f"local:{model_name}"
        self.dimension = int(self._model.config.hidden_size)

    def _encode(self, texts: list[str]) -> list[list[float]]:
        """Tokenise, mean-pool and L2-normalise a batch."""
        torch = self._torch
        encoded = self._tokenizer(
            texts, padding=True, truncation=True, max_length=512, return_tensors="pt"
        )

        with torch.no_grad():
            output = self._model(**encoded)

        hidden = output.last_hidden_state
        mask = encoded["attention_mask"].unsqueeze(-1).to(hidden.dtype)
        pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1e-9)
        # Normalise so cosine distance in Qdrant behaves as expected.
        pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)

        return pooled.cpu().tolist()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed articles for storage."""
        return self._encode(texts)

    def embed_query(self, text: str) -> list[float]:
        """Embed a search query."""
        return self._encode([text])[0]


def build_embedder(
    backend: str | None = None,
    *,
    allow_fallback: bool = False,
) -> Embedder:
    """
    Construct the configured embedder.

    With ``allow_fallback``, a failure to build the Gemini embedder degrades to
    the local one instead of raising. Ingestion does *not* use that: silently
    switching backends mid-corpus would mix incompatible vectors into one
    collection, which is worse than stopping.
    """
    from app.config import settings

    backend = backend or settings.embedding_backend

    if backend == "gemini":
        try:
            return GeminiEmbedder(
                api_key=settings.gemini_api_key,
                model=settings.gemini_embedding_model,
            )
        except Exception as exc:  # noqa: BLE001 - reported or re-raised below
            if not allow_fallback:
                raise
            logger.warning(
                "Gemini embedder unavailable (%s); falling back to local", exc
            )

    return LocalEmbedder(settings.local_embedding_model)

"""
Tests for the SENTIMENT_BACKEND switch and the local inference path.

The tests that need torch are skipped when the ML extras are not installed,
because the default deployment runs the Gemini backend and does not ship them.
The routing and fallback tests do *not* need torch -- those are the ones that
protect the promise that switching backends can never break the pipeline.
"""

import asyncio
from datetime import datetime, timezone

import pytest

from app.models.schemas import EmotionType, NewsInput, SentimentAnalysisResult
from app.services.sentiment_service import SentimentService

try:  # pragma: no cover - availability depends on the install
    import torch  # noqa: F401
    import transformers  # noqa: F401

    HAS_ML_EXTRAS = True
except ImportError:  # pragma: no cover
    HAS_ML_EXTRAS = False

requires_ml = pytest.mark.skipif(
    not HAS_ML_EXTRAS, reason="ML extras not installed (requirements-local.txt)"
)


def make_news(
    title="Bitcoin Surges Past $100,000",
    content="Institutional inflows hit a record high.",
):
    """Build a minimal NewsInput for the analysis path."""
    return NewsInput(
        title=title,
        content=content,
        link="https://example.com/article",
        published_date=datetime.now(timezone.utc),
        symbol_hint="BTC-USD",
    )


def bare_service():
    """A SentimentService with no repository — only the analysis path is used."""
    service = SentimentService.__new__(SentimentService)
    service.repository = None
    service._gemini_model = None
    return service


class TestBackendRouting:
    """The backend switch picks the right path and always stamps provenance."""

    def test_mock_path_is_stamped(self, monkeypatch):
        """USE_MOCK_LLM short-circuits everything and records backend='mock'."""
        from app.config import settings

        monkeypatch.setattr(settings, "use_mock_llm", True)

        result = asyncio.run(bare_service()._analyze_sentiment(make_news()))

        assert result.backend == "mock"
        assert -1.0 <= result.sentiment <= 1.0

    def test_local_failure_falls_back_to_gemini_path(self, monkeypatch):
        """
        A broken local model must degrade, never raise.

        This is the core safety property of the feature: pointing
        SENTIMENT_BACKEND at a local model that cannot load has to leave the
        service answering requests.
        """
        from app.config import settings

        monkeypatch.setattr(settings, "use_mock_llm", False)
        monkeypatch.setattr(settings, "sentiment_backend", "local")
        monkeypatch.setattr(settings, "gemini_api_key", "a-key")

        service = bare_service()

        async def broken_local(_news_input):
            return None

        monkeypatch.setattr(service, "_local_sentiment_analysis", broken_local)

        sentinel = SentimentAnalysisResult(
            symbol="BTCUSDT",
            sentiment=0.5,
            emotion=EmotionType.OPTIMISM,
            reason="from the fallback",
            backend="gemini",
        )

        async def fake_gemini(_news_input):
            return sentinel

        monkeypatch.setattr(service, "_gemini_sentiment_analysis", fake_gemini)

        result = asyncio.run(service._analyze_sentiment(make_news()))

        assert result.backend == "gemini"

    def test_local_result_is_returned_when_available(self, monkeypatch):
        """When local inference succeeds, Gemini is never called."""
        from app.config import settings

        monkeypatch.setattr(settings, "use_mock_llm", False)
        monkeypatch.setattr(settings, "sentiment_backend", "local")
        monkeypatch.setattr(settings, "gemini_api_key", "not-empty")

        service = bare_service()
        expected = SentimentAnalysisResult(
            symbol="BTCUSDT",
            sentiment=-0.4,
            emotion=EmotionType.FEAR,
            reason="local",
            backend="local:base",
        )

        async def good_local(_news_input):
            return expected

        async def explode(_news_input):
            raise AssertionError("Gemini must not be called when local succeeds")

        monkeypatch.setattr(service, "_local_sentiment_analysis", good_local)
        monkeypatch.setattr(service, "_gemini_sentiment_analysis", explode)

        result = asyncio.run(service._analyze_sentiment(make_news()))

        assert result.backend == "local:base"
        assert result.sentiment == pytest.approx(-0.4)

    def test_local_backend_needs_no_gemini_key(self, monkeypatch):
        """
        SENTIMENT_BACKEND=local must work with no Gemini key configured.

        Running locally is the case where there is no API key to supply, so the
        missing-key guard must not short-circuit ahead of the local path.
        """
        from app.config import settings

        monkeypatch.setattr(settings, "use_mock_llm", False)
        monkeypatch.setattr(settings, "sentiment_backend", "local")
        monkeypatch.setattr(settings, "gemini_api_key", "")

        service = bare_service()
        expected = SentimentAnalysisResult(
            symbol="BTCUSDT",
            sentiment=0.3,
            emotion=EmotionType.OPTIMISM,
            reason="local",
            backend="local:base",
        )

        async def good_local(_news_input):
            return expected

        monkeypatch.setattr(service, "_local_sentiment_analysis", good_local)

        result = asyncio.run(service._analyze_sentiment(make_news()))

        assert result.backend == "local:base"

    def test_local_failure_without_key_degrades_to_mock(self, monkeypatch):
        """With no key and a broken local model, the service still answers."""
        from app.config import settings

        monkeypatch.setattr(settings, "use_mock_llm", False)
        monkeypatch.setattr(settings, "sentiment_backend", "local")
        monkeypatch.setattr(settings, "gemini_api_key", "")

        service = bare_service()

        async def broken_local(_news_input):
            return None

        monkeypatch.setattr(service, "_local_sentiment_analysis", broken_local)

        result = asyncio.run(service._analyze_sentiment(make_news()))

        assert result.backend == "mock"

    def test_gemini_is_the_default_backend(self):
        """The switch must default to the pre-existing behaviour."""
        from app.config import Settings

        assert Settings().sentiment_backend == "gemini"


class TestScoreToEmotion:
    """The base variant has no emotion head, so emotions come from the score."""

    def test_mapping_is_monotonic_in_polarity(self):
        """Positive scores map to positive emotions and vice versa."""
        from app.ml.local_model import emotion_from_score

        assert emotion_from_score(0.9) == "Excitement"
        assert emotion_from_score(0.4) == "Optimism"
        assert emotion_from_score(-0.4) == "Pessimism"
        assert emotion_from_score(-0.9) == "Fear"

    def test_every_output_is_a_valid_platform_emotion(self):
        """Whatever the score, the label must fit the schema's enum."""
        from app.ml.local_model import emotion_from_score

        for step in range(-10, 11):
            label = emotion_from_score(step / 10)
            assert EmotionType(label)


class TestLocalModelConfig:
    """Loading is resolved from artifacts, and failures are reported not raised."""

    def test_missing_artifacts_reports_error_without_raising(self, tmp_path):
        """A missing adapter directory sets load_error rather than blowing up."""
        from app.ml.local_model import LocalSentimentModel

        model = LocalSentimentModel(
            artifacts_dir=str(tmp_path / "nope"), variant="student"
        )

        assert model.load() is False
        assert model.is_loaded is False
        assert "not found" in (model.load_error or "").lower()

    def test_describe_is_safe_before_loading(self, tmp_path):
        """/health calls describe() on a cold model; it must not raise."""
        from app.ml.local_model import LocalSentimentModel

        info = LocalSentimentModel(artifacts_dir=str(tmp_path)).describe()

        assert info["loaded"] is False
        assert info["variant"] == "student"

    def test_base_model_is_read_from_training_run(self, tmp_path):
        """
        The adapter's base checkpoint comes from training_run.json.

        Guards against silently attaching a saved adapter to a different base
        than the one it was trained with.
        """
        import json

        from app.ml.local_model import LocalSentimentModel

        (tmp_path / "training_run.json").write_text(
            json.dumps({"config": {"base_model": "some-org/some-checkpoint"}}),
            encoding="utf-8",
        )

        model = LocalSentimentModel(
            artifacts_dir=str(tmp_path), base_model="configured-default"
        )

        assert model._resolve_base_model() == "some-org/some-checkpoint"

    def test_falls_back_to_configured_base_when_metadata_missing(self, tmp_path):
        """With no training_run.json, the configured base model is used."""
        from app.ml.local_model import LocalSentimentModel

        model = LocalSentimentModel(
            artifacts_dir=str(tmp_path), base_model="configured-default"
        )

        assert model._resolve_base_model() == "configured-default"


@requires_ml
class TestLocalInference:
    """End-to-end scoring through the real model. Downloads the base checkpoint."""

    def test_base_variant_separates_bullish_from_bearish(self):
        """The base checkpoint should rank an obvious rally above an obvious crash."""
        from app.ml.local_model import LocalSentimentModel

        model = LocalSentimentModel(artifacts_dir="training/artifacts", variant="base")
        if not model.load():
            pytest.skip(f"base checkpoint unavailable: {model.load_error}")

        bullish, _ = model.predict(
            "Bitcoin Surges Past $100,000 Amid Record Institutional Inflows"
        )
        bearish, _ = model.predict(
            "Bitcoin Crashes To 15-Month Low As Investors Panic Sell"
        )

        assert bullish > bearish
        assert -1.0 <= bearish <= 1.0 and -1.0 <= bullish <= 1.0

    def test_predictions_stay_in_schema_range(self):
        """Scores must fit SentimentAnalysisResult's -1..+1 constraint."""
        from app.ml.local_model import LocalSentimentModel

        model = LocalSentimentModel(artifacts_dir="training/artifacts", variant="base")
        if not model.load():
            pytest.skip(f"base checkpoint unavailable: {model.load_error}")

        score, emotion = model.predict("Ethereum network upgrade ships on schedule.")

        SentimentAnalysisResult(
            symbol="ETHUSDT",
            sentiment=score,
            emotion=EmotionType(emotion),
            reason="test",
            backend="local:base",
        )

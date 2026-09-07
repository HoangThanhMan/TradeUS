"""
Tests for the tools, the agent loop and the SSE contract.

No network, no API key, no model download: downstream services are stubbed with
``httpx.MockTransport`` and the tool registry is patched where the loop itself is
under test.

The SSE tests matter most. ``apps/web/src/components/page/ChatbotPanel.tsx``
parses this stream by hand, so the wire format is a real contract with a real
consumer — if these break, the chat panel silently renders nothing.
"""

import asyncio
import json
import os
import sys

import httpx
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import tools  # noqa: E402
from app.agent import (  # noqa: E402
    AgentTrace,
    answer,
    plan_tools,
    render_rule_based_answer,
    stream_answer,
)
from app.tools import call_tool, normalise_symbol  # noqa: E402


def run(coro):
    """Run a coroutine to completion."""
    return asyncio.run(coro)


def mock_client_factory(handler):
    """
    Build a replacement for httpx.AsyncClient backed by a mock transport.

    The real class is captured here, before monkeypatch swaps the name — calling
    ``httpx.AsyncClient`` from inside the replacement would otherwise recurse
    into itself.
    """
    real_async_client = httpx.AsyncClient

    class _Client:
        def __init__(self, *args, **kwargs):
            self._client = real_async_client(transport=httpx.MockTransport(handler))

        async def __aenter__(self):
            return self._client

        async def __aexit__(self, *exc):
            await self._client.aclose()

    return _Client


class TestSymbolNormalisation:
    """Whatever the model emits has to become a valid trading pair."""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("BTCUSDT", "BTCUSDT"),
            ("btc", "BTCUSDT"),
            ("ETH-USD", "ETHUSDT"),
            ("sol/usdt", "SOLUSDT"),
            ("XRPUSD", "XRPUSDT"),
            (None, "BTCUSDT"),
            ("", "BTCUSDT"),
        ],
    )
    def test_normalises(self, raw, expected):
        """Common spellings all land on the platform's form."""
        assert normalise_symbol(raw) == expected


class TestGetPrediction:
    """The prediction tool must summarise success and survive failure."""

    def test_returns_the_fields_the_model_needs(self, monkeypatch):
        """Only the useful subset is forwarded, not the whole payload."""

        def handler(request):
            assert request.url.params["symbol"] == "ETHUSDT"
            return httpx.Response(
                200,
                json={
                    "symbol": "ETHUSDT",
                    "interval": "1h",
                    "current_price": 2000.0,
                    "predicted_price": 2020.0,
                    "price_change_percent": 1.0,
                    "signal": "BUY",
                    "sentiment": 0.3,
                    "signal_color": "#00c853",
                    "message": "noise the model does not need",
                },
            )

        monkeypatch.setattr(httpx, "AsyncClient", mock_client_factory(handler))
        result = run(tools.get_prediction("eth"))

        assert result["signal"] == "BUY"
        assert result["predicted_price"] == 2020.0
        assert "signal_color" not in result

    def test_http_error_becomes_a_readable_message(self, monkeypatch):
        """A nested `detail` dict must not reach the user as a Python repr."""

        def handler(request):
            return httpx.Response(
                400,
                json={
                    "detail": {
                        "error": "Insufficient data for prediction",
                        "message": "Need 24 candles, have 0",
                    }
                },
            )

        monkeypatch.setattr(httpx, "AsyncClient", mock_client_factory(handler))
        result = run(tools.get_prediction("BTCUSDT"))

        assert result["error"] == "Need 24 candles, have 0"

    def test_unreachable_service_is_reported_not_raised(self, monkeypatch):
        """A dead service degrades the answer; it must not fail the request."""

        def handler(request):
            raise httpx.ConnectError("connection refused")

        monkeypatch.setattr(httpx, "AsyncClient", mock_client_factory(handler))
        result = run(tools.get_prediction("BTCUSDT"))

        assert "unreachable" in result["error"]


class TestGetSentimentSummary:
    """Sentiment is bucketed for the model, and 404 is not an error."""

    def test_buckets_the_score(self, monkeypatch):
        """A raw float means little to an LLM; the bucket is what it reasons on."""

        def handler(request):
            return httpx.Response(
                200,
                json={
                    "average_sentiment": 0.55,
                    "sample_count": 12,
                    "period_days": 7,
                },
            )

        monkeypatch.setattr(httpx, "AsyncClient", mock_client_factory(handler))
        result = run(tools.get_sentiment_summary("BTCUSDT"))

        assert result["sentiment_bucket"] == "bullish"
        assert result["sample_count"] == 12

    @pytest.mark.parametrize(
        "score,bucket", [(0.5, "bullish"), (0.0, "neutral"), (-0.5, "bearish")]
    )
    def test_bucket_thresholds_match_the_evals(self, monkeypatch, score, bucket):
        """Same +/-0.2 thresholds the sentiment evaluation used."""

        def handler(request):
            return httpx.Response(
                200,
                json={"average_sentiment": score, "sample_count": 5, "period_days": 7},
            )

        monkeypatch.setattr(httpx, "AsyncClient", mock_client_factory(handler))
        assert run(tools.get_sentiment_summary("BTCUSDT"))["sentiment_bucket"] == bucket

    def test_no_data_is_not_an_error(self, monkeypatch):
        """
        404 means "nothing collected in this window", which is information.

        Reporting it as an error would make the model apologise for a working
        system.
        """

        def handler(request):
            return httpx.Response(404, json={"detail": "No sentiment data found"})

        monkeypatch.setattr(httpx, "AsyncClient", mock_client_factory(handler))
        result = run(tools.get_sentiment_summary("BTCUSDT"))

        assert "error" not in result
        assert result["sample_count"] == 0

    def test_days_is_clamped_to_the_api_range(self, monkeypatch):
        """The upstream endpoint rejects anything outside 1-90."""
        seen = {}

        def handler(request):
            seen["days"] = request.url.params["days"]
            return httpx.Response(
                200, json={"average_sentiment": 0, "sample_count": 1, "period_days": 90}
            )

        monkeypatch.setattr(httpx, "AsyncClient", mock_client_factory(handler))
        run(tools.get_sentiment_summary("BTCUSDT", days=9999))

        assert seen["days"] == "90"


class TestCallTool:
    """Dispatch has to tolerate everything a language model might emit."""

    def test_unknown_tool_name(self):
        """Hallucinated tool names come back as an error, not an exception."""
        assert "unknown tool" in run(call_tool("nope", {}))["error"]

    def test_bad_arguments(self):
        """Wrong kwargs are the model's mistake, not a crash."""
        result = run(call_tool("get_prediction", {"not_a_param": 1}))
        assert "invalid arguments" in result["error"]

    def test_every_declared_tool_is_registered(self):
        """A declaration with no implementation would fail only at runtime."""
        declared = {tool["name"] for tool in tools.TOOL_DECLARATIONS}
        assert declared == set(tools.TOOL_REGISTRY)


class TestPlanner:
    """The rule-based planner picks tools from the question."""

    def test_news_search_always_runs(self):
        """It is the grounding tool; every answer benefits from real articles."""
        for message in ["hello", "what is a moving average", "should I buy?"]:
            assert "search_news" in {
                call["name"] for call in plan_tools(message, "BTCUSDT")
            }

    def test_sentiment_question_triggers_sentiment(self):
        """An explicit mood question routes to the sentiment tool."""
        names = {c["name"] for c in plan_tools("what's the sentiment?", "BTCUSDT")}
        assert "get_sentiment_summary" in names

    def test_decision_question_triggers_prediction(self):
        """
        "Is now a good time" is a forecast question with no forecast words.

        This phrasing is the flagship demo question, and an earlier version of
        the planner missed it entirely.
        """
        names = {
            c["name"]
            for c in plan_tools("is now a good time to look at it?", "ETHUSDT")
        }
        assert "get_prediction" in names

    def test_combined_question_fires_all_three(self):
        """The Sprint 3 demo question must exercise every tool."""
        names = {
            c["name"]
            for c in plan_tools(
                "What's the sentiment on ETH right now and is now a good "
                "time to look at it?",
                "ETHUSDT",
            )
        }
        assert names == {"get_prediction", "get_sentiment_summary", "search_news"}


class TestAnswerRendering:
    """The templated answer must read cleanly and never invent data."""

    def test_cites_retrieved_headlines_verbatim(self):
        """Grounding means quoting what retrieval returned."""
        text = render_rule_based_answer(
            "BTCUSDT",
            {
                "search_news": {
                    "results": [
                        {"title": "Fidelity to Launch a Stablecoin"},
                        {"title": "Bitcoin holds $84,000"},
                    ]
                }
            },
        )

        assert "Fidelity to Launch a Stablecoin" in text

    def test_failed_tool_is_reported_readably(self):
        """No Python reprs in front of the user."""
        text = render_rule_based_answer(
            "BTCUSDT", {"get_prediction": {"error": "Need 24 candles, have 0"}}
        )

        assert "Need 24 candles, have 0" in text
        assert "{" not in text.split("Generated without")[0]

    def test_declares_that_no_llm_was_used(self):
        """The fallback must never be mistaken for a model-written answer."""
        text = render_rule_based_answer("BTCUSDT", {})
        assert "without an LLM" in text


class TestAgentLoop:
    """End-to-end through answer(), with tools stubbed."""

    @pytest.fixture
    def stub_tools(self, monkeypatch):
        """Replace the registry with recording stubs."""
        called = []

        async def prediction(symbol, interval="1h"):
            called.append("get_prediction")
            return {"symbol": symbol, "signal": "BUY", "price_change_percent": 1.5,
                    "current_price": 100, "predicted_price": 101.5, "interval": "1h"}

        async def sentiment(symbol, days=7):
            called.append("get_sentiment_summary")
            return {"symbol": symbol, "sample_count": 9, "period_days": 7,
                    "average_sentiment": 0.4, "sentiment_bucket": "bullish"}

        async def news(query, symbol=None, limit=5):
            called.append("search_news")
            return {"results": [{"title": "A Real Headline", "link": "https://x"}]}

        monkeypatch.setitem(tools.TOOL_REGISTRY, "get_prediction", prediction)
        monkeypatch.setitem(tools.TOOL_REGISTRY, "get_sentiment_summary", sentiment)
        monkeypatch.setitem(tools.TOOL_REGISTRY, "search_news", news)
        return called

    def test_records_every_tool_call_in_the_trace(self, stub_tools, monkeypatch):
        """The trace is how "did it call the tool?" gets answered."""
        from app.config import settings

        monkeypatch.setattr(settings, "agent_backend", "rules")

        text, trace = run(
            answer("What's the sentiment and is now a good time?", "ETHUSDT")
        )

        assert set(stub_tools) == {
            "get_prediction",
            "get_sentiment_summary",
            "search_news",
        }
        assert {t["name"] for t in trace.as_dict()["tools"]} == set(stub_tools)
        assert "A Real Headline" in text

    def test_falls_back_when_gemini_is_unavailable(self, stub_tools, monkeypatch):
        """A broken LLM must degrade to the rule-based path, not 500."""
        from app.config import settings

        monkeypatch.setattr(settings, "agent_backend", "gemini")
        monkeypatch.setattr(settings, "gemini_api_key", "a-key")

        async def explode(*args, **kwargs):
            raise RuntimeError("403 CONSUMER_SUSPENDED")

        monkeypatch.setattr("app.agent.run_gemini_agent", explode)

        text, trace = run(answer("what is the sentiment?", "BTCUSDT"))

        assert trace.backend == "rules"
        assert "CONSUMER_SUSPENDED" in (trace.error or "")
        assert text


class TestSSEContract:
    """The wire format ChatbotPanel.tsx parses by hand."""

    @pytest.fixture
    def stub_answer(self, monkeypatch):
        """Pin the answer text so the stream can be asserted exactly."""

        async def fake_answer(message, symbol="BTCUSDT", current_price=None):
            trace = AgentTrace(backend="rules", rounds=1)
            return "Hello there, market friend.", trace

        monkeypatch.setattr("app.agent.answer", fake_answer)
        monkeypatch.setattr("app.config.settings.stream_delay_ms", 0)

    def collect(self, **kwargs):
        """Drain stream_answer into a list of lines."""

        async def drain():
            return [chunk async for chunk in stream_answer("q", **kwargs)]

        return run(drain())

    def test_terminates_with_done(self, stub_answer):
        """ChatbotPanel stops reading on [DONE]; without it the panel hangs."""
        assert self.collect()[-1] == "data: [DONE]\n\n"

    def test_every_line_is_a_data_frame(self, stub_answer):
        """Anything else in the stream would break the client's line parser."""
        assert all(chunk.startswith("data: ") for chunk in self.collect())
        assert all(chunk.endswith("\n\n") for chunk in self.collect())

    def test_chunks_reassemble_to_the_exact_answer(self, stub_answer):
        """The client concatenates chunks; whitespace must survive the split."""
        text = ""
        for chunk in self.collect():
            payload = chunk[6:].strip()
            if payload == "[DONE]":
                break
            parsed = json.loads(payload)
            text += parsed.get("text", "")

        assert text == "Hello there, market friend."

    def test_emits_a_trace_event_before_done(self, stub_answer):
        """Additive: the existing client ignores frames with no `text` key."""
        chunks = self.collect()
        trace_frames = [
            json.loads(c[6:].strip())
            for c in chunks
            if c[6:].strip() != "[DONE]" and "trace" in c
        ]

        assert len(trace_frames) == 1
        assert trace_frames[0]["trace"]["backend"] == "rules"

    def test_stream_still_terminates_when_the_agent_explodes(self, monkeypatch):
        """
        An unhandled failure must still close the stream.

        Otherwise the browser waits on an open socket forever and the panel
        shows a spinner with no error.
        """

        async def explode(*args, **kwargs):
            raise RuntimeError("catastrophe")

        monkeypatch.setattr("app.agent.answer", explode)
        monkeypatch.setattr("app.config.settings.stream_delay_ms", 0)

        chunks = self.collect()

        assert chunks[-1] == "data: [DONE]\n\n"
        assert "could not complete" in chunks[0]

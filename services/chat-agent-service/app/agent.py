"""
The market agent: a function-calling loop over the three tools in ``tools.py``.

Flow
----
1. Send the user's message plus the tool schemas to Gemini.
2. If Gemini asks for function calls, run them and feed the results back.
3. Repeat until it returns text, capped at ``max_tool_rounds`` so a confused
   model cannot spin forever.
4. Stream the final answer out as SSE.

No orchestration framework. The loop is the twenty lines below, which means the
whole control flow is visible and every step is traceable in the logs.

Backends
--------
``gemini``
    Real function calling. The intended path.

``rules``
    A deterministic planner that picks tools from keywords, runs them, and
    renders a templated answer. It exists because the pipeline has to stay
    demonstrable and testable when the API key is unavailable, and because it
    makes the tool-execution and SSE machinery testable without a network call.
    It is **not** an LLM and the response says so.

Every turn records a trace -- which tools were called, with what arguments, how
long each took -- so "did it actually call the tool?" is answerable from logs
rather than from vibes.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from app.config import settings
from app.tools import TOOL_DECLARATIONS, call_tool, normalise_symbol

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert cryptocurrency trading assistant for the \
TradeX platform.

You have tools that read this platform's own live data. Use them rather than \
your own recollection: your training data is stale, and the user is asking \
about right now.

- For price direction, forecasts, or buy/sell questions -> get_prediction
- For market mood or sentiment questions -> get_sentiment_summary
- For "what is happening" or anything that should cite real news -> search_news

Call several tools in one turn when the question needs them. When you cite a \
headline, use the title returned by search_news verbatim -- never invent one.

Answering:
- Ground every claim in tool output. If a tool failed, say so plainly.
- Be concise: 2-4 short paragraphs, under 150 words.
- Give both the bullish and bearish read where it is genuinely ambiguous.
- Emojis sparingly (📈 📉 💡 ⚠️).
- Close by noting this is not financial advice.

Current context:
- Symbol: {symbol}
{price_line}"""


@dataclass
class ToolCallRecord:
    """One executed tool call, kept for the trace."""

    name: str
    arguments: dict[str, Any]
    duration_ms: float
    ok: bool
    result_preview: str


@dataclass
class AgentTrace:
    """Everything that happened during one turn."""

    backend: str
    rounds: int = 0
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        """Serialisable form, emitted as the final SSE event."""
        return {
            "backend": self.backend,
            "rounds": self.rounds,
            "tools": [
                {
                    "name": record.name,
                    "arguments": record.arguments,
                    "duration_ms": round(record.duration_ms, 1),
                    "ok": record.ok,
                }
                for record in self.tool_calls
            ],
            "error": self.error,
        }


def build_system_prompt(symbol: str, current_price: float | None) -> str:
    """Fill the system prompt with the panel's current context."""
    price_line = (
        f"- Current price: ${current_price:,.2f}" if current_price else ""
    )
    return SYSTEM_PROMPT.format(symbol=symbol, price_line=price_line)


async def _run_tool(name: str, arguments: dict[str, Any]) -> tuple[dict, ToolCallRecord]:
    """Execute one tool and record how it went."""
    started = time.perf_counter()
    result = await call_tool(name, arguments)
    duration_ms = (time.perf_counter() - started) * 1000

    ok = "error" not in result
    record = ToolCallRecord(
        name=name,
        arguments=arguments,
        duration_ms=duration_ms,
        ok=ok,
        result_preview=json.dumps(result, default=str)[:200],
    )
    logger.info(
        "tool %s(%s) -> %s in %.0fms",
        name,
        json.dumps(arguments, default=str),
        "ok" if ok else f"error: {result.get('error')}",
        duration_ms,
    )
    return result, record


# ---------------------------------------------------------------------------
# Gemini backend
# ---------------------------------------------------------------------------


async def run_gemini_agent(
    message: str, symbol: str, current_price: float | None, trace: AgentTrace
) -> str:
    """
    Run the Gemini function-calling loop and return the final answer text.

    Raises on transport/auth failure so the caller can decide whether to fall
    back; tool failures are handled inside and reported to the model.
    """
    import google.generativeai as genai

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(
        model_name=settings.gemini_model,
        tools=[{"function_declarations": TOOL_DECLARATIONS}],
        system_instruction=build_system_prompt(symbol, current_price),
    )

    chat = model.start_chat(enable_automatic_function_calling=False)
    reply = await chat.send_message_async(message)

    for round_index in range(settings.max_tool_rounds):
        function_calls = _extract_function_calls(reply)
        if not function_calls:
            break

        trace.rounds = round_index + 1
        logger.info(
            "round %d: model requested %d tool(s): %s",
            trace.rounds,
            len(function_calls),
            [call["name"] for call in function_calls],
        )

        # Independent calls in one round run concurrently -- three sequential
        # HTTP round trips per turn is the difference between a snappy answer
        # and a sluggish one.
        results = await asyncio.gather(
            *(_run_tool(call["name"], call["args"]) for call in function_calls)
        )

        responses = []
        for call, (result, record) in zip(function_calls, results, strict=True):
            trace.tool_calls.append(record)
            responses.append(
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=call["name"], response={"result": result}
                    )
                )
            )

        reply = await chat.send_message_async(genai.protos.Content(parts=responses))
    else:
        # Loop exhausted without the model settling on an answer. Ask once more,
        # with tools withheld, so the turn ends in prose rather than a dangling
        # function call.
        logger.warning(
            "hit max_tool_rounds=%d; requesting a final answer",
            settings.max_tool_rounds,
        )
        if _extract_function_calls(reply):
            reply = await chat.send_message_async(
                "Answer now using the tool results you already have. "
                "Do not request any more tools."
            )

    return _extract_text(reply)


def _extract_function_calls(reply: Any) -> list[dict[str, Any]]:
    """Pull function calls out of a Gemini response, tolerating empty parts."""
    calls: list[dict[str, Any]] = []
    for candidate in getattr(reply, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", []) or []:
            function_call = getattr(part, "function_call", None)
            if function_call and getattr(function_call, "name", ""):
                calls.append(
                    {
                        "name": function_call.name,
                        "args": dict(function_call.args or {}),
                    }
                )
    return calls


def _extract_text(reply: Any) -> str:
    """Concatenate the text parts of a Gemini response."""
    chunks: list[str] = []
    for candidate in getattr(reply, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", []) or []:
            text = getattr(part, "text", "")
            if text:
                chunks.append(text)
    return "".join(chunks).strip()


# ---------------------------------------------------------------------------
# Rule-based backend
# ---------------------------------------------------------------------------

PREDICTION_WORDS = (
    # direction and forecasting
    "predict", "forecast", "price", "target", "direction", "signal", "outlook",
    "trend", "move", "going",
    # trade decisions -- "is now a good time to look at it?" is a prediction
    # question even though it names none of the words above
    "buy", "sell", "hold", "entry", "invest", "worth", "should i",
    "good time", "right now", "opportunity", "position",
)
SENTIMENT_WORDS = (
    "sentiment", "mood", "feel", "bullish", "bearish", "fear", "greed",
    "optimis", "pessimis", "confidence", "hype", "panic",
)


def plan_tools(message: str, symbol: str) -> list[dict[str, Any]]:
    """
    Decide which tools a question needs, by keyword.

    A crude stand-in for the model's own judgement -- but it drives exactly the
    same execution path, so what it proves about the plumbing is real.

    ``search_news`` always runs. It is the grounding tool: its whole purpose is
    to anchor answers in real articles instead of recollection, and there is no
    market question where real headlines are unhelpful. The other two are gated
    on the question actually being about forecasts or mood.
    """
    lowered = message.lower()
    planned: list[dict[str, Any]] = []

    if any(word in lowered for word in PREDICTION_WORDS):
        planned.append({"name": "get_prediction", "args": {"symbol": symbol}})
    if any(word in lowered for word in SENTIMENT_WORDS):
        planned.append({"name": "get_sentiment_summary", "args": {"symbol": symbol}})

    planned.append(
        {"name": "search_news", "args": {"query": message, "symbol": symbol}}
    )
    return planned


def _error_message(result: dict[str, Any]) -> str:
    """
    Pull a human-readable reason out of a failed tool result.

    Downstream services nest their own JSON inside the error, and dumping that
    raw into a chat reply is unreadable.
    """
    error = result.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("error") or error)
    return str(error)


def render_rule_based_answer(
    symbol: str, results: dict[str, dict[str, Any]]
) -> str:
    """Compose an answer from tool output, with no model involved."""
    paragraphs: list[str] = []

    prediction = results.get("get_prediction")
    if prediction and "error" not in prediction:
        change = prediction.get("price_change_percent")
        arrow = "📈" if (change or 0) > 0 else "📉"
        paragraphs.append(
            f"{arrow} The model's next-{prediction.get('interval', '1h')} call on "
            f"{symbol} is {prediction.get('signal', 'HOLD')}: "
            f"${prediction.get('current_price')} → "
            f"${prediction.get('predicted_price')} ({change:+.2f}%)."
            if change is not None
            else f"{arrow} Signal for {symbol}: {prediction.get('signal', 'HOLD')}."
        )
    elif prediction:
        paragraphs.append(
            f"⚠️ No prediction available for {symbol} right now — "
            f"{_error_message(prediction)}."
        )

    sentiment = results.get("get_sentiment_summary")
    if sentiment and "error" not in sentiment:
        if sentiment.get("sample_count"):
            paragraphs.append(
                f"News sentiment over the last {sentiment.get('period_days')} days is "
                f"{sentiment.get('sentiment_bucket')} "
                f"({sentiment.get('average_sentiment'):.3f} across "
                f"{sentiment.get('sample_count')} articles)."
            )
        else:
            paragraphs.append(
                f"No sentiment data has been collected for {symbol} recently."
            )
    elif sentiment:
        paragraphs.append(
            f"⚠️ Sentiment unavailable — {_error_message(sentiment)}."
        )

    news = results.get("search_news")
    if news and news.get("results"):
        headlines = "\n".join(
            f"• {item['title']}" for item in news["results"][:3]
        )
        paragraphs.append(f"💡 Recent coverage:\n{headlines}")
    elif news and news.get("error"):
        paragraphs.append(f"⚠️ News search unavailable — {_error_message(news)}.")

    paragraphs.append(
        "Generated without an LLM — the assistant is running its rule-based "
        "fallback because no language model backend is configured. The figures "
        "above are real, the wording is templated. Not financial advice."
    )

    return "\n\n".join(paragraphs)


async def run_rule_based_agent(
    message: str, symbol: str, current_price: float | None, trace: AgentTrace
) -> str:
    """Plan, execute and render — the same tool path, no model."""
    planned = plan_tools(message, symbol)
    trace.rounds = 1
    logger.info(
        "rule-based plan: %s", [call["name"] for call in planned]
    )

    executed = await asyncio.gather(
        *(_run_tool(call["name"], call["args"]) for call in planned)
    )

    results: dict[str, dict[str, Any]] = {}
    for call, (result, record) in zip(planned, executed, strict=True):
        trace.tool_calls.append(record)
        results[call["name"]] = result

    return render_rule_based_answer(symbol, results)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def answer(
    message: str,
    symbol: str = "BTCUSDT",
    current_price: float | None = None,
) -> tuple[str, AgentTrace]:
    """
    Produce one grounded answer plus its trace.

    Falls back from Gemini to the rule-based planner rather than failing the
    request, matching how the rest of the platform degrades.
    """
    symbol = normalise_symbol(symbol)
    backend = settings.agent_backend

    if backend == "gemini" and settings.gemini_api_key:
        trace = AgentTrace(backend="gemini")
        try:
            text = await run_gemini_agent(message, symbol, current_price, trace)
            if text:
                return text, trace
            logger.warning("Gemini returned no text; falling back")
            trace.error = "empty response"
        except Exception as exc:  # noqa: BLE001 - degrade, never 500
            logger.error("Gemini agent failed: %s", exc, exc_info=True)
            trace.error = f"{type(exc).__name__}: {exc}"

        fallback_trace = AgentTrace(backend="rules")
        fallback_trace.error = trace.error
        fallback_trace.tool_calls = trace.tool_calls
        text = await run_rule_based_agent(
            message, symbol, current_price, fallback_trace
        )
        return text, fallback_trace

    trace = AgentTrace(backend="rules")
    if backend == "gemini":
        trace.error = "no GEMINI_API_KEY configured"
    text = await run_rule_based_agent(message, symbol, current_price, trace)
    return text, trace


# Split on whitespace but keep it, so reassembling the chunks client-side
# reproduces the answer exactly.
_CHUNK_PATTERN = re.compile(r"\S+\s*")


async def stream_answer(
    message: str,
    symbol: str = "BTCUSDT",
    current_price: float | None = None,
) -> AsyncIterator[str]:
    """
    Yield the answer as Server-Sent Events.

    Wire format matches what ``apps/web`` already consumes:
    ``data: {"text": "..."}`` chunks, then ``data: [DONE]``. The frontend needs
    no changes.

    A ``trace`` event goes out just before ``[DONE]``; the existing client
    ignores any event without a ``text`` field, so this is additive.
    """
    try:
        text, trace = await answer(message, symbol, current_price)
    except Exception as exc:  # noqa: BLE001 - the stream must always terminate
        logger.error("agent failed: %s", exc, exc_info=True)
        payload = json.dumps(
            {"text": "⚠️ The assistant could not complete that request."}
        )
        yield f"data: {payload}\n\n"
        yield "data: [DONE]\n\n"
        return

    for match in _CHUNK_PATTERN.finditer(text):
        yield f"data: {json.dumps({'text': match.group(0)})}\n\n"
        if settings.stream_delay_ms:
            await asyncio.sleep(settings.stream_delay_ms / 1000)

    yield f"data: {json.dumps({'trace': trace.as_dict()})}\n\n"
    yield "data: [DONE]\n\n"

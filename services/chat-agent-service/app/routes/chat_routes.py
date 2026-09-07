"""
Chat endpoints.

``POST /chat`` streams the grounded answer as SSE, in the exact wire format
``apps/web`` already consumes. ``POST /chat/debug`` returns the same answer plus
the full tool trace as ordinary JSON, which is what makes "did it really call
the tools?" a question you can answer with curl.
"""

import logging
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent import answer, stream_answer

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])


class ChatRequest(BaseModel):
    """Request body — matches what the existing frontend already posts."""

    message: str = Field(..., min_length=1, max_length=4000)
    symbol: str = Field(default="BTCUSDT")
    currentPrice: float | None = Field(  # noqa: N815 - frontend's casing
        default=None, description="Price shown in the panel, for context"
    )


class ChatDebugResponse(BaseModel):
    """Non-streaming response with the tool trace attached."""

    answer: str
    trace: dict[str, Any]


@router.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    """
    Stream a grounded answer as Server-Sent Events.

    Emits ``data: {"text": "..."}`` chunks then ``data: [DONE]``, so
    ``ChatbotPanel.tsx`` works against this unchanged.
    """
    logger.info(
        "chat: symbol=%s price=%s message=%r",
        request.symbol,
        request.currentPrice,
        request.message[:120],
    )

    return StreamingResponse(
        stream_answer(request.message, request.symbol, request.currentPrice),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Nginx buffers proxied responses by default, which would hold the
            # whole answer back and destroy the streaming effect.
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/debug", response_model=ChatDebugResponse)
async def chat_debug(request: ChatRequest) -> ChatDebugResponse:
    """Same answer, returned whole, with the tool trace — for demos and tests."""
    text, trace = await answer(
        request.message, request.symbol, request.currentPrice
    )
    return ChatDebugResponse(answer=text, trace=trace.as_dict())

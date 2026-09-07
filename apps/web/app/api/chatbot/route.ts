// app/api/chatbot/route.ts
//
// Thin proxy to chat-agent-service.
//
// This route used to call Gemini directly with a single interpolated prompt,
// which meant the assistant could not read the platform's own prediction,
// sentiment or news data. That orchestration now lives in chat-agent-service,
// which calls those services as tools and grounds its answer in real articles.
//
// The SSE wire format is unchanged -- `data: {"text": "..."}` chunks terminated
// by `data: [DONE]` -- so ChatbotPanel.tsx needs no changes.

import { NextRequest, NextResponse } from 'next/server';

const CHAT_AGENT_URL =
  process.env.CHAT_AGENT_SERVICE_URL ?? 'http://localhost:8006';

// The agent may run several tool calls before it answers, so allow more headroom
// than a plain completion would need.
const REQUEST_TIMEOUT_MS = Number(
  process.env.CHAT_AGENT_TIMEOUT_MS ?? 60_000,
);

interface ChatRequest {
  message: string;
  symbol: string;
  currentPrice?: number | null;
}

export async function POST(request: NextRequest) {
  let body: ChatRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message, symbol, currentPrice } = body;

  if (!message || !symbol) {
    return NextResponse.json(
      { error: 'Message and symbol are required' },
      { status: 400 },
    );
  }

  // Abort the upstream request if the agent hangs, so the browser gets an error
  // instead of an open socket.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${CHAT_AGENT_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, symbol, currentPrice }),
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      console.error(
        `chat-agent-service returned ${upstream.status}: ${detail.slice(0, 500)}`,
      );
      return NextResponse.json(
        {
          error: 'Failed to generate response',
          details: `chat-agent-service returned ${upstream.status}`,
        },
        { status: 502 },
      );
    }

    // Stream straight through. Clearing the timeout is tied to the stream
    // finishing rather than the response headers arriving, otherwise a slow
    // answer would be cut off mid-sentence.
    const passthrough = new TransformStream({
      flush() {
        clearTimeout(timeout);
      },
    });

    return new NextResponse(upstream.body.pipeThrough(passthrough), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        // Stops nginx from buffering the stream and destroying the live feel.
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: unknown) {
    clearTimeout(timeout);

    const aborted = error instanceof Error && error.name === 'AbortError';
    const message =
      error instanceof Error ? error.message : 'Unknown error';

    console.error('Chatbot proxy error:', error);

    return NextResponse.json(
      {
        error: aborted
          ? 'The assistant took too long to respond'
          : 'Failed to reach chat-agent-service',
        details: message,
      },
      { status: aborted ? 504 : 502 },
    );
  }
}

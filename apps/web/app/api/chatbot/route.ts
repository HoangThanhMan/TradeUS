// app/api/chatbot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_ID = 'gemini-3-flash-preview';

interface ChatRequest {
  message: string;
  symbol: string;
  currentPrice?: number | null;
}

// Strip markdown formatting from text
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1') // ***bold italic***
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/\*(.+?)\*/g, '$1') // *italic*
    .replace(/___(.+?)___/g, '$1') // ___bold italic___
    .replace(/__(.+?)__/g, '$1') // __bold__
    .replace(/_(.+?)_/g, '$1') // _italic_
    .replace(/~~(.+?)~~/g, '$1') // ~~strikethrough~~
    .replace(/#{1,6}\s+/g, '') // # headings
    .replace(/`([^`]+)`/g, '$1') // `inline code`
    .replace(/```[\s\S]*?```/g, '') // ```code blocks```
    .replace(/^\s*[-*+]\s+/gm, '• ') // - bullet points -> •
    .replace(/^\s*\d+\.\s+/gm, '') // 1. numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [links](url)
    .replace(/\n{3,}/g, '\n\n'); // collapse multiple newlines
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not defined in .env.local');
    }

    const body: ChatRequest = await request.json();
    const { message, symbol, currentPrice } = body;

    if (!message || !symbol) {
      return NextResponse.json(
        { error: 'Message and symbol are required' },
        { status: 400 },
      );
    }

    const systemPrompt = `You are an expert cryptocurrency trading assistant specializing in technical analysis and market insights.

Current Context:
- Symbol: ${symbol}
${currentPrice ? `- Current Price: $${currentPrice.toFixed(2)}` : ''}

Your role:
- Provide accurate, data-driven trading insights
- Explain technical concepts clearly
- Offer balanced perspectives on market conditions
- Use emojis sparingly for clarity (📈 📉 💡 ⚠️)
- Keep responses concise but informative (2-4 paragraphs max)
- Always remind users that this is not financial advice
- Keep your response under 124 words maximum. Be concise and to the point.

Guidelines:
- Be professional yet friendly
- Focus on ${symbol} when relevant
- Provide actionable insights when appropriate
- Explain technical terms when used
- Consider both bullish and bearish scenarios
- Emphasize risk management

Remember: You are an educational tool, not a financial advisor.`;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      systemInstruction: systemPrompt,
    });

    const { stream } = await model.generateContentStream(message);

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of stream) {
            const text = chunk.text();
            if (text) {
              const text = chunk.text();
              if (text) {
                const sseData = `data: ${JSON.stringify({ text })}\n\n`;
                controller.enqueue(encoder.encode(sseData));
              }
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Chatbot API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate response',
        details: error.message,
      },
      { status: 500 },
    );
  }
}

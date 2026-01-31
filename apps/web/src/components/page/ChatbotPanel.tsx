// src/components/page/ChatbotPanel.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Plus_Jakarta_Sans } from 'next/font/google';
import {
  IconRobot,
  IconSend,
  IconTrash,
  IconUser,
  IconSparkles,
  IconChartLine,
  IconLoader,
  IconCoin,
  IconBulb,
} from '@tabler/icons-react';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isThinking?: boolean;
}

interface ChatbotPanelProps {
  symbol: string;
  currentPrice?: number | null;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  'Analyze the current market trend for {symbol}',
  'What are the key support and resistance levels?',
  'Should I buy or sell {symbol} now?',
  'Explain the recent price movement',
  'What technical indicators should I watch?',
];

// Helper: delay in ms
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export function ChatbotPanel({
  symbol,
  currentPrice,
  onClose,
}: ChatbotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `👋 Hello! I'm your AI Trading Assistant. I can help you analyze ${symbol} and provide market insights. How can I assist you today?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const generateResponse = async (userMessage: string): Promise<void> => {
    const streamingMessageId = `${Date.now()}-streaming`;
    let firstChunkReceived = false;

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          symbol: symbol,
          currentPrice: currentPrice,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to get response from AI');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              // First chunk: xóa thinking, thêm streaming message
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                setMessages((prev) => [
                  ...prev.filter((m) => !m.isThinking),
                  {
                    id: streamingMessageId,
                    role: 'assistant' as const,
                    content: parsed.text,
                    timestamp: new Date(),
                  },
                ]);
              } else {
                // Các chunk sau: append từng chữ có delay
                const chars = parsed.text.split('');
                for (const char of chars) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMessageId
                        ? { ...m, content: m.content + char }
                        : m,
                    ),
                  );
                  // Delay giữa các chữ: 15-40ms tùy độ dài chunk
                  await delay(chars.length > 5 ? 15 : 40);
                }
              }
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Nếu không nhận được chunk nào
      if (!firstChunkReceived) {
        throw new Error('No response received');
      }
    } catch (error) {
      console.error('Chatbot error:', error);
      // Xóa thinking nếu chưa xóa, thêm error message
      setMessages((prev) => {
        const filtered = prev.filter(
          (m) => !m.isThinking && m.id !== streamingMessageId,
        );
        return [
          ...filtered,
          {
            id: `${Date.now()}-error`,
            role: 'assistant' as const,
            content:
              "I apologize, but I'm having trouble connecting to the AI service right now. Please try again in a moment.",
            timestamp: new Date(),
          },
        ];
      });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Thinking indicator — giữ cho đến khi chunk đầu về
    const thinkingMessage: Message = {
      id: `${Date.now()}-thinking`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isThinking: true,
    };
    setMessages((prev) => [...prev, thinkingMessage]);

    try {
      await generateResponse(userMessage.content);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    const filledPrompt = prompt.replace('{symbol}', symbol);
    setInput(filledPrompt);
    inputRef.current?.focus();
  };

  const clearChat = () => {
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: `Chat cleared! How can I help you analyze ${symbol}?`,
        timestamp: new Date(),
      },
    ]);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={`w-80 bg-white border-l border-gray-200 flex flex-col h-full ${pjs.className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <IconRobot size={18} stroke={1.8} className="text-black" />
          <h3 className="font-semibold text-[14px] text-gray-900">
            AI Assistant
          </h3>
          <IconSparkles size={14} className="text-black" />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={clearChat}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="Clear chat"
          >
            <IconTrash size={16} stroke={1.8} />
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Context Info */}
      <div className="px-4 py-2 bg-gray-100 border-b border-purple-100 flex-shrink-0">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <IconCoin size={16} className="text-yellow-600" />
            <span className="font-semibold text-yellow-600">{symbol}</span>
          </div>
          {currentPrice && (
            <span className="text-yellow-600 font-medium">
              ${currentPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-2 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <IconRobot size={16} className="text-black" />
              </div>
            )}

            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 ${
                message.role === 'user'
                  ? 'bg-purple-500 text-white'
                  : message.isThinking
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-gray-100 text-gray-900'
              }`}
            >
              {message.isThinking ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    Thinking
                    <span className="inline-flex gap-0.5 ml-1">
                      <span
                        className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </span>
                  </span>
                </div>
              ) : (
                <>
                  <div className="prose prose-sm text-[12px] max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>

                  <span
                    className={`text-[10px] mt-1 block ${
                      message.role === 'user'
                        ? 'text-purple-200'
                        : 'text-gray-500'
                    }`}
                  >
                    {formatTime(message.timestamp)}
                  </span>
                </>
              )}
            </div>

            {message.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                <IconUser size={16} className="text-white" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts */}
      {messages.length === 1 && (
        <div className="px-4 pb-2 flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2 font-medium flex items-center gap-1.5">
            <IconBulb size={16} stroke={1.8} className="text-yellow-500" />
            Suggested questions:
          </p>
          <div className="space-y-1">
            {SUGGESTED_PROMPTS.slice(0, 3).map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSuggestedPrompt(prompt)}
                className="w-full text-left px-2 py-1.5 text-[11px] text-gray-600 bg-gray-50 hover:bg-purple-50 hover:text-purple-700 rounded border border-gray-200 hover:border-purple-200 transition-all"
              >
                {prompt.replace('{symbol}', symbol)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-200 flex-shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 text-[11px] text-black placeholder-gray-600 placeholder:text-[11px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-3 py-2 bg-black text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <IconLoader size={18} className="animate-spin" />
            ) : (
              <IconSend size={18} stroke={1.8} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          ⚡ Powered by Gemini AI • Not financial advice
        </p>
      </div>
    </div>
  );
}

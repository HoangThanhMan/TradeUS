// src/components/page/RightSidebar.tsx
'use client';

import React from 'react';

export type RightPanelType = 'sentiment' | 'prediction' | 'chatbot' | null;

interface RightSidebarProps {
  activePanel: RightPanelType;
  onPanelChange: (panel: RightPanelType) => void;
  isVip?: boolean;
}

export function RightSidebar({
  activePanel,
  onPanelChange,
  isVip = false,
}: RightSidebarProps) {
  const handlePanelClick = (panel: RightPanelType) => {
    if (activePanel === panel) {
      onPanelChange(null);
    } else {
      onPanelChange(panel);
    }
  };

  return (
    <div className="w-12 bg-white border-l border-gray-200 flex flex-col items-center py-4 gap-2">
      {/* Sentiment Analysis Icon */}
      <button
        onClick={() => handlePanelClick('sentiment')}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 relative ${
          activePanel === 'sentiment'
            ? 'bg-green-500 text-white shadow-md'
            : isVip
              ? 'text-gray-600 hover:bg-gray-100 hover:text-green-600'
              : 'text-gray-400 hover:bg-gray-100 hover:text-amber-600'
        }`}
        title={isVip ? 'Sentiment News' : 'Sentiment News (VIP Only)'}
      >
        {!isVip && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
          />
        </svg>
      </button>

      {/* ML Prediction Icon */}
      <button
        onClick={() => handlePanelClick('prediction')}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 relative ${
          activePanel === 'prediction'
            ? 'bg-red-500 text-white shadow-md'
            : isVip
              ? 'text-gray-600 hover:bg-gray-100 hover:text-red-600'
              : 'text-gray-400 hover:bg-gray-100 hover:text-amber-600'
        }`}
        title={isVip ? 'ML Prediction' : 'ML Prediction (VIP Only)'}
      >
        {!isVip && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </button>

      {/* AI Chatbot Icon - NEW */}
      <button
        onClick={() => handlePanelClick('chatbot')}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 ${
          activePanel === 'chatbot'
            ? 'bg-purple-500 text-white shadow-md'
            : 'text-gray-500 hover:bg-gray-100 hover:text-purple-600'
        }`}
        title="AI Assistant"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      </button>
    </div>
  );
}
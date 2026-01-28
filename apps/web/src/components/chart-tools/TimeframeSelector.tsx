// src/components/chart/TimeframeSelector.tsx

'use client';

import React from 'react';

interface TimeframeSelectorProps {
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
}

const TIMEFRAMES = [
  { value: '1s', label: '1S' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
];

export function TimeframeSelector({ timeframe, onTimeframeChange }: TimeframeSelectorProps) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
      {TIMEFRAMES.map(tf => (
        <button
          key={tf.value}
          onClick={() => onTimeframeChange(tf.value)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            timeframe === tf.value
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}
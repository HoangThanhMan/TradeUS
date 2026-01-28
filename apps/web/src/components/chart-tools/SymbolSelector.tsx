// src/components/chart/SymbolSelector.tsx

'use client';

import React from 'react';

interface SymbolSelectorProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

const AVAILABLE_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'ADAUSDT',
  'XRPUSDT',
];

export function SymbolSelector({ symbol, onSymbolChange }: SymbolSelectorProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {AVAILABLE_SYMBOLS.map(s => (
        <button
          key={s}
          onClick={() => onSymbolChange(s)}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            symbol === s
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {s.replace('USDT', '/USDT')}
        </button>
      ))}
    </div>
  );
}
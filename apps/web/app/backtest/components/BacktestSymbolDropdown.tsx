// app/backtest/components/BacktestSymbolDropdown.tsx
'use client';

import { Plus_Jakarta_Sans } from 'next/font/google';
import React, { useState, useRef, useEffect } from 'react';

interface Props {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

interface SymbolOption {
  symbol: string;
  name: string;
  quote: string;
}

const POPULAR_SYMBOLS: SymbolOption[] = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', quote: 'USDT' },
  { symbol: 'ETHUSDT', name: 'Ethereum', quote: 'USDT' },
  { symbol: 'BNBUSDT', name: 'Binance Coin', quote: 'USDT' },
  { symbol: 'SOLUSDT', name: 'Solana', quote: 'USDT' },
  { symbol: 'ADAUSDT', name: 'Cardano', quote: 'USDT' },
  { symbol: 'XRPUSDT', name: 'Ripple', quote: 'USDT' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', quote: 'USDT' },
  { symbol: 'MATICUSDT', name: 'Polygon', quote: 'USDT' },
  { symbol: 'DOTUSDT', name: 'Polkadot', quote: 'USDT' },
  { symbol: 'AVAXUSDT', name: 'Avalanche', quote: 'USDT' },
  { symbol: 'LINKUSDT', name: 'Chainlink', quote: 'USDT' },
  { symbol: 'UNIUSDT', name: 'Uniswap', quote: 'USDT' },
];

export function BacktestSymbolDropdown({ symbol, onSymbolChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get full display text (e.g., "BTCUSDT - Bitcoin")
  const getDisplayText = (fullSymbol: string) => {
    const symbolData = POPULAR_SYMBOLS.find(s => s.symbol === fullSymbol);
    if (symbolData) {
      return `${symbolData.symbol} - ${symbolData.name}`;
    }
    return fullSymbol;
  };

  // Get short symbol for dropdown items (e.g., "BTC" from "BTCUSDT")
  const getShortSymbol = (fullSymbol: string) => {
    return fullSymbol.replace('USDT', '').replace('BUSD', '');
  };

  const filteredSymbols = POPULAR_SYMBOLS.filter(s => 
    s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (symbolOption: SymbolOption) => {
    onSymbolChange(symbolOption.symbol);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className={`relative ${pjs.className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-40 bg-white border border-gray-300 rounded px-3 py-2 text-left text-[12.5px] text-black font-semibold hover:border-gray-400 focus:outline-none focus:border-blue-500 flex items-center justify-between"
      >
        <span className="font-medium">{getDisplayText(symbol)}</span>
        <svg 
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute z-50 mt-1 w-70 bg-white border border-gray-300 rounded-lg shadow-xl ${pjs.className}`}>
          {/* Search Input */}
          <div className="p-3 border-b border-gray-200">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search symbols..."
              className="w-full px-3 py-2 placeholder-black placeholder:text-[13px] border border-blue-400 rounded focus:outline-none focus:border-blue-500 text-sm"
              autoFocus
            />
          </div>

          {/* Symbols List */}
          <div className="max-h-96 overflow-y-auto">
            {/* Category Header */}
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
              Major
            </div>

            {/* Symbol Options */}
            {filteredSymbols.length > 0 ? (
              filteredSymbols.map((symbolOption) => (
                <button
                  key={symbolOption.symbol}
                  onClick={() => handleSelect(symbolOption)}
                  className={`w-full px-4 py-2 text-left hover:bg-blue-50 transition-colors flex items-center justify-between group ${
                    symbol === symbolOption.symbol ? 'bg-blue-50' : 'bg-white'
                  }`}
                >
                  <div className="flex items-left flex-col justify-left">
                    <div className={`font-bold text-[14px] ${
                      symbol === symbolOption.symbol ? 'text-blue-700' : 'text-black'
                    }`}>
                      {getShortSymbol(symbolOption.symbol)}
                    </div>
                    <div className="text-[12px] font-semibold text-gray-600">
                      {symbolOption.name}
                    </div>
                  </div>
                  <div className="text-[13px] text-gray-400 font-medium">
                    {symbolOption.quote}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-4 text-center text-sm text-gray-500">
                No symbols found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
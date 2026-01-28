// src/components/chart/ChartHeader.tsx (WITH SYMBOL SELECTOR)
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SYMBOL_META } from '../../constants/symbols';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { use24hTicker } from '../../hooks/use24hTicker';
import { useRealtimeTicker } from '../../hooks/useRealtimeTicker';

interface ChartHeaderProps {
  symbol: string;
  chartNumber?: number;
  showChartNumber?: boolean;
  onSymbolChange?: (symbol: string) => void;  // 🔥 NEW
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

// Generate SYMBOLS array from SYMBOL_META
const SYMBOLS = Object.keys(SYMBOL_META).map(base => `${base}USDT`);

export function ChartHeader({ 
  symbol, 
  chartNumber, 
  showChartNumber = true,
  onSymbolChange  // 🔥 NEW
}: ChartHeaderProps) {
  // 🔥 Real 24h stats from REST API (updates every 5s)
  const { ticker: ticker24h } = use24hTicker(symbol);
  
  // 🔥 Realtime price from WebSocket (updates every second)
  const { ticker: realtimeTicker } = useRealtimeTicker(symbol);

  // Track previous price for color animation
  const [prevPrice, setPrevPrice] = useState<number>(0);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  // Symbol dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getSymbolParts = (symbol: string) => {
    const quoteCurrencies = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB'];

    for (const quote of quoteCurrencies) {
      if (symbol.endsWith(quote)) {
        const base = symbol.slice(0, -quote.length);
        return { base, quote };
      }
    }

    return { base: symbol.slice(0, -4), quote: symbol.slice(-4) };
  };

  const { base, quote } = getSymbolParts(symbol);
  const meta = SYMBOL_META[base];

  // Get current price from realtime ticker (updates every second)
  const currentPrice = realtimeTicker?.price || 0;
  
  // Get 24h stats from REST API
  const high24h = ticker24h ? parseFloat(ticker24h.highPrice) : 0;
  const low24h = ticker24h ? parseFloat(ticker24h.lowPrice) : 0;
  const volume24h = ticker24h ? parseFloat(ticker24h.volume) : 0;
  
  // Get price change from realtime ticker (more accurate than REST API)
  const priceChangePercent = realtimeTicker?.priceChangePercent || 
                             (ticker24h ? parseFloat(ticker24h.priceChangePercent) : 0);

  const isPositive = priceChangePercent >= 0;
  const priceColor = isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]';
  const realtimePriceColor =
    priceFlash === 'up'
      ? 'text-[#0ecb81]'
      : priceFlash === 'down'
      ? 'text-[#f6465d]'
      : priceColor;

  // Price change animation effect
  useEffect(() => {
    if (currentPrice > 0 && prevPrice > 0 && currentPrice !== prevPrice) {
      const direction = currentPrice > prevPrice ? 'up' : 'down';
      setPriceFlash(direction);
      
      // Remove flash after 300ms
      const timer = setTimeout(() => setPriceFlash(null), 300);
      return () => clearTimeout(timer);
    }
  }, [currentPrice, prevPrice]);

  // Update previous price
  useEffect(() => {
    if (currentPrice > 0) {
      setPrevPrice(currentPrice);
    }
  }, [currentPrice]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter symbols based on search
  const filteredSymbols = SYMBOLS.filter(s => {
    const base = s.replace('USDT', '');
    const meta = SYMBOL_META[base];
    return s.toLowerCase().includes(searchTerm.toLowerCase()) ||
           meta?.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Group symbols by category
  const groupedSymbols = filteredSymbols.reduce((acc, s) => {
    const base = s.replace('USDT', '');
    const meta = SYMBOL_META[base];
    const category = meta?.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(s);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <div className={`bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between ${pjs.className}`}>
      <div className="flex items-center gap-4">
        {/* Symbol Selector with Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex flex-col gap-0.5 hover:bg-gray-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className={`text-base font-[1000] text-gray-900 leading-none ${pjs.className}`}>
                {base}{quote}
              </span>
              <svg 
                className={`w-4 h-4 text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <span className="text-[11px] text-gray-500 leading-none text-left">
              {meta ? `${meta.name} • ${meta.category}` : 'Unknown Asset'}
            </span>
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && onSymbolChange && (
            <div className="absolute left-0 top-full mt-2 w-70 bg-white border border-gray-200 rounded-lg shadow-2xl z-[100] max-h-[600px] overflow-hidden">
              {/* Search Input */}
              <div className="p-3 border-b border-gray-200 bg-gray-50">
                <input
                  type="text"
                  placeholder="Search symbols..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 placeholder-black placeholder:text-[12.5px] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Symbols List */}
              <div className="max-h-[500px] overflow-y-autox">
                {Object.entries(groupedSymbols).map(([category, symbols]) => (
                  <div key={category}>
                    <div className="sticky top-0 px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-100 border-b border-gray-200">
                      {category}
                    </div>
                    {symbols.map(s => {
                      const symbolBase = s.replace('USDT', '');
                      const symbolMeta = SYMBOL_META[symbolBase];
                      const isSelected = symbol === s;

                      return (
                        <button
                          key={s}
                          onClick={() => {
                            onSymbolChange(s);
                            setDropdownOpen(false);
                            setSearchTerm('');
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between transition-colors ${
                            isSelected ? 'bg-blue-50 pl-5 border-blue-500' : 'border-l-4 border-transparent'
                          }`}
                        >
                          <div className={`flex flex-col`}>
                            <span className={`font-semibold text-sm ${isSelected ? 'text-blue-600' : 'text-gray-900'}`}>
                              {symbolBase}
                            </span>
                            <span className="text-xs text-gray-500">
                              {symbolMeta?.name || symbolBase}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-medium">USDT</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {filteredSymbols.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-sm">No symbols found</p>
                    <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Live Price Display - Updates Every Second */}
        {(realtimeTicker || ticker24h) && (
          <div className="flex items-center gap-8 border-l border-gray-200 pl-4">
            {/* Current Price - With Flash Animation */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-500 leading-none">Price</span>
              <span
                className={`text-lg font-bold leading-none transition-all duration-300 py-1 rounded ${realtimePriceColor}`}
              >
                {currentPrice > 0 ? currentPrice.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }) : '-'}
              </span>
            </div>

            {/* 24h Change */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-500 leading-none">24h Change</span>
              <span className={`text-sm font-semibold leading-none ${priceColor}`}>
                {isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%
              </span>
            </div>

            {/* 24h High */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-500 leading-none">24h High</span>
              <span className="text-sm font-medium leading-none text-gray-900">
                {high24h > 0 ? high24h.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }) : '-'}
              </span>
            </div>

            {/* 24h Low */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-500 leading-none">24h Low</span>
              <span className="text-sm font-medium leading-none text-gray-900">
                {low24h > 0 ? low24h.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }) : '-'}
              </span>
            </div>

            {/* 24h Volume */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-500 leading-none">24h Volume({base})</span>
              <span className="text-sm font-medium leading-none text-gray-900">
                {volume24h > 0 ? (volume24h / 1000).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }) + 'K' : '-'}
              </span>
            </div>

            {/* Connection Status Indicator */}
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <div className={`w-1.5 h-1.5 rounded-full ${realtimeTicker ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span>{realtimeTicker ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Chart Number Badge */}
      {showChartNumber && chartNumber && (
        <div className="bg-gray-900 text-white px-3 py-1.5 rounded text-[11px] font-semibold">
          Chart {chartNumber}
        </div>
      )}
    </div>
  );
}
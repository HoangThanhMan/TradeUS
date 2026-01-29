// src/components/chart/SymbolDropdown.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { SYMBOL_META } from '../../constants/symbols';

interface SymbolDropdownProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

// Generate SYMBOLS array from SYMBOL_META
const SYMBOLS = Object.keys(SYMBOL_META).map(base => `${base}USDT`);

export function SymbolDropdown({ symbol, onSymbolChange }: SymbolDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
    <div className={`relative ${pjs.className}`} ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="text-[14px] text-black font-bold px-3 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-2 border border-gray-300"
      >
        {symbol.replace('USDT', '')}
        <span className="text-black text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
          <div className="p-2 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search symbols..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 text-sm placeholder-black placeholder:text-[13px] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {Object.entries(groupedSymbols).map(([category, symbols]) => (
              <div key={category}>
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50">
                  {category}
                </div>
                {symbols.map(s => {
                  const base = s.replace('USDT', '');
                  const meta = SYMBOL_META[base];
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        onSymbolChange(s);
                        setOpen(false);
                        setSearchTerm('');
                      }}
                      className={`w-full text-left text-black px-4 py-2.5 text-sm hover:bg-gray-100 flex items-center justify-between ${
                        symbol === s ? 'bg-blue-50 text-blue-600 font-semibold' : ''
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold">{base}</span>
                        <span className="text-xs text-gray-500">{meta?.name || base}</span>
                      </div>
                      <span className="text-xs text-gray-400">USDT</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {filteredSymbols.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                No symbols found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
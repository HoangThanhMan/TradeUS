// src/components/chart/ChartHeader.tsx
'use client';

import React from 'react';
import { SYMBOL_META } from '../../constants/symbols';
import { Plus_Jakarta_Sans } from 'next/font/google';

interface ChartHeaderProps {
  symbol: string;
  chartNumber: number;
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

export function ChartHeader({ symbol, chartNumber }: ChartHeaderProps) {
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

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className={`text-base font-[1000] text-gray-900 mb-1.5 leading-none ${pjs.className}`}>
          {base}{quote}
        </span>

        <span className="text-[11px] text-gray-500 leading-none">
          {meta ? `${meta.name} • ${meta.category}` : 'Unknown Asset'}
        </span>
      </div>

      <div className="bg-gray-900 text-white px-3 py-1.5 rounded text-[11px] font-semibold">
        Chart {chartNumber}
      </div>
    </div>
  );
}

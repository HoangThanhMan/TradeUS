'use client';

import { Plus_Jakarta_Sans } from 'next/font/google';
import React, { useState, useRef, useEffect } from 'react';
import {
  FunctionSquare,
  Globe,
  Settings,
  Camera,
  Maximize
} from 'lucide-react';

interface ChartToolbarProps {
  symbol: string;
  timeframe: string;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (tf: string) => void;
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

export function ChartToolbar({
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange
}: ChartToolbarProps) {

  const timeframes = ['1s', '1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w'];
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // click outside -> close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={`${pjs.className} font-bold bg-white border-b border-gray-200 px-4 h-10 flex items-center`}>
      
      {/* LEFT */}
      <div className="flex items-center gap-4">
        
        {/* SYMBOL DROPDOWN */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(v => !v)}
            className="text-[17px] text-black font-bold px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-1"
          >
            {symbol.replace('USDT', '')}
            <span className="text-black text-xs">▾</span>
          </button>

          {open && (
            <div className="absolute left-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-md z-50">
              {symbols.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    onSymbolChange(s);
                    setOpen(false);
                  }}
                  className={`w-full text-left text-black px-3 py-1.5 text-sm hover:bg-gray-100 ${
                    symbol === s ? 'bg-blue-50 text-blue-600' : ''
                  }`}
                >
                  {s.replace('USDT', '')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-gray-200" />

        {/* TIMEFRAMES */}
        <div className="flex items-center gap-1">
          {timeframes.map(tf => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2 py-1 text-xs font-bold rounded ${
                timeframe === tf
                  ? 'bg-gray-300 text-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      

      {/* RIGHT */}
      <div className="flex items-center gap-1 text-[11.5px] text-gray-700">

        <div className="h-10 w-px bg-gray-200 mx-3" />
        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
          <FunctionSquare className="w-4 h-4" />
          <span>Indicator</span>
        </button>

        <div className="h-10 w-px bg-gray-200 mx-3" />

        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
          <Globe className="w-4 h-4" />
          <span>Timezone</span>
        </button>

        <div className="h-10 w-px bg-gray-200 mx-3" />

        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
          <Settings className="w-4 h-4" />
          <span>Setting</span>
        </button>

        <div className="h-10 w-px bg-gray-200 mx-3" />

        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
          <Camera className="w-4 h-4" />
          <span>Screenshot</span>
        </button>

        <div className="h-10 w-px bg-gray-200 mx-3" />

        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
          <Maximize className="w-4 h-4" />
          <span>Full Screen</span>
        </button>
      </div>
    </div>
  );
}

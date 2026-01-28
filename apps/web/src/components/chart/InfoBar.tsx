// src/components/chart/InfoBar.tsx

'use client';

import React from 'react';
import { PriceMessage } from '../../types/trading.types';
import { Plus_Jakarta_Sans } from 'next/font/google';

interface InfoBarProps {
  latestPrice: PriceMessage | null;
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

export function InfoBar({ latestPrice }: InfoBarProps) {
  if (!latestPrice) {
    return (
      <div className={`bg-white border-b border-gray-200 px-4 py-2 ${pjs.className}`}>
        <div className="text-[12px] text-gray-500">Loading price data...</div>
      </div>
    );
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  return (
  //   <div className="bg-white border-b border-gray-200 px-4 py-2">
  //     <div className="flex items-center gap-6 text-xs">
  //       {/* Time */}
  //       <div className="flex items-center gap-2">
  //         <span className="text-gray-500">Time:</span>
  //         <span className="text-gray-900">{formatTime(latestPrice.timestamp)}</span>
  //       </div>

  //       {/* Open */}
  //       <div className="flex items-center gap-2">
  //         <span className="text-gray-500">Open:</span>
  //         <span className="text-gray-900">{latestPrice.open.toFixed(2)}</span>
  //       </div>

  //       {/* High */}
  //       <div className="flex items-center gap-2">
  //         <span className="text-gray-500">High:</span>
  //         <span className="text-green-600">{latestPrice.high.toFixed(2)}</span>
  //       </div>

  //       {/* Low */}
  //       <div className="flex items-center gap-2">
  //         <span className="text-gray-500">Low:</span>
  //         <span className="text-red-600">{latestPrice.low.toFixed(2)}</span>
  //       </div>

  //       {/* Close */}
  //       <div className="flex items-center gap-2">
  //         <span className="text-gray-500">Close:</span>
  //         <span className="text-gray-900 font-medium">{latestPrice.close.toFixed(2)}</span>
  //       </div>

  //       {/* Volume */}
  //       <div className="flex items-center gap-2">
  //         <span className="text-gray-500">Volume:</span>
  //         <span className="text-gray-900">{latestPrice.volume.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
  //       </div>

  //       {/* MA Indicators */}
  //       <div className="flex items-center gap-4 ml-auto">
  //         <div className="flex items-center gap-1">
  //           <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
  //           <span className="text-gray-500">MA5:</span>
  //           <span className="text-orange-500">10,36.80</span>
  //         </div>
  //         <div className="flex items-center gap-1">
  //           <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
  //           <span className="text-gray-500">MA10:</span>
  //           <span className="text-blue-500">111,349.43</span>
  //         </div>
  //         <div className="flex items-center gap-1">
  //           <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
  //           <span className="text-gray-500">MA20:</span>
  //           <span className="text-purple-500">111,326.58</span>
  //         </div>
  //       </div>
  //     </div>
  //   </div>
  null
  );
}
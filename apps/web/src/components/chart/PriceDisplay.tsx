// src/components/chart/PriceDisplay.tsx

'use client';

import React from 'react';
import { PriceMessage } from '../../types/trading.types';

interface PriceDisplayProps {
  latestPrice: PriceMessage | null;
}

export function PriceDisplay({ latestPrice }: PriceDisplayProps) {
  if (!latestPrice) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-center h-24">
          <div className="text-gray-500">Loading price data...</div>
        </div>
      </div>
    );
  }

  const priceChange = latestPrice.close - latestPrice.open;
  const priceChangePercent = (priceChange / latestPrice.open) * 100;
  const isPositive = priceChange >= 0;

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <div className="text-3xl font-bold text-white">
            ${latestPrice.close.toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}
          </div>
          <div className={`text-lg font-medium flex items-center gap-1 ${
            isPositive ? 'text-green-500' : 'text-red-500'
          }`}>
            {isPositive ? '▲' : '▼'} 
            ${Math.abs(priceChange).toFixed(2)} 
            ({Math.abs(priceChangePercent).toFixed(2)}%)
          </div>
        </div>
        <div className="text-sm text-gray-500">
          {new Date(latestPrice.timestamp).toLocaleTimeString()}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 text-sm">
        <div className="bg-gray-900 rounded p-3">
          <div className="text-gray-500 mb-1">Open</div>
          <div className="text-white font-medium">
            ${latestPrice.open.toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3">
          <div className="text-gray-500 mb-1">High</div>
          <div className="text-green-500 font-medium">
            ${latestPrice.high.toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3">
          <div className="text-gray-500 mb-1">Low</div>
          <div className="text-red-500 font-medium">
            ${latestPrice.low.toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-900 rounded p-3">
          <div className="text-gray-500 mb-1">Volume</div>
          <div className="text-white font-medium">
            {latestPrice.volume.toLocaleString('en-US', { 
              maximumFractionDigits: 0 
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
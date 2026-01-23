'use client';

import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useChartData } from '../../hooks/useChartData';
import { KLineChart } from './KLineChart';
import { ChartToolbar } from './ChartToolbar';
import { Sidebar } from '../dashboard/Sidebar';
import { ChartConfig } from '../../types/layout.types';
import { Plus_Jakarta_Sans } from 'next/font/google';

interface ChartInstanceProps {
  config: ChartConfig;
  socket: Socket | null;
  connected: boolean;
  onUpdateChart: (chartId: string, updates: Partial<Pick<ChartConfig, 'symbol' | 'interval'>>) => void;
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

export function ChartInstance({ config, socket, connected, onUpdateChart }: ChartInstanceProps) {
  const { candles, latestPrice, loading } = useChartData(socket, config.symbol, config.interval);
  const [selectedTool, setSelectedTool] = useState('cursor');

  useEffect(() => {
    if (socket && connected) {
      console.log(`[${config.id}] Subscribing to ${config.symbol}:${config.interval}`);
      socket.emit('subscribe', { symbols: [config.symbol], interval: config.interval });

      return () => {
        console.log(`[${config.id}] Unsubscribing from ${config.symbol}:${config.interval}`);
        socket.emit('unsubscribe', { symbols: [config.symbol], interval: config.interval });
      };
    }
  }, [socket, connected, config.symbol, config.interval, config.id]);

  const handleSymbolChange = (newSymbol: string) => {
    onUpdateChart(config.id, { symbol: newSymbol });
  };

  const handleTimeframeChange = (newInterval: string) => {
    onUpdateChart(config.id, { interval: newInterval });
  };

  const handleToolSelect = (tool: string) => {
    console.log(`[${config.id}] Selected tool:`, tool);
    setSelectedTool(tool);
    // TODO: Implement tool functionality for chart
  };

  return (
    <div className={`w-full h-full flex bg-white border border-gray-200 rounded-lg overflow-hidden relative ${pjs.className}`}>
      {/* Sidebar */}
      <Sidebar onToolSelect={handleToolSelect} />

      {/* Chart Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Reuse ChartToolbar */}
        <ChartToolbar
          symbol={config.symbol}
          timeframe={config.interval}
          onSymbolChange={handleSymbolChange}
          onTimeframeChange={handleTimeframeChange}
        />

        {/* Chart Area */}
        <div className="flex-1 min-h-0 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-sm text-gray-500">Loading...</div>
            </div>
          ) : candles.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-sm text-gray-400">No data</div>
            </div>
          ) : (
            <KLineChart candles={candles} symbol={config.symbol} />
          )}
        </div>

        {/* Connection Status - Small indicator in bottom right */}
        <div className="absolute bottom-2 right-2 z-40">
          <div className={`w-2 h-2 rounded-full ${
            connected ? 'bg-green-500' : 'bg-red-500'
          }`} />
        </div>
      </div>
    </div>
  );
}
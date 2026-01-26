'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { useMultiChart } from '../../src/hooks/useMultiChart';
import { Header } from '../../src/components/dashboard/Header';
import { MultiChartContainer } from '../../src/components/chart/MultiChartContainer';
import { LayoutVisualSelector } from '../../src/components/chart/LayoutVisualSelector';
import { IconLayout2, IconChartDots2, IconSettings, IconRuler } from '@tabler/icons-react';
import { Plus_Jakarta_Sans } from 'next/font/google';

const WS_URL = 'http://localhost:3002/prices';

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

export default function MultiChartPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { socket, status, error } = useWebSocket(WS_URL);
  const { layout, changeLayout, updateChart, setChartCount, getAvailableLayouts } = useMultiChart();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  const availableLayouts = getAvailableLayouts();

  return (
    <div className={`h-screen flex flex-col bg-white ${pjs.className}`}>
      <Header status={status} />
      
      {/* Dashboard Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4 px-30">
        <div className="flex items-center gap-4">
          {/* Icon */}
          <IconLayout2 size={40} stroke={2} className="text-black flex-shrink-0" />

          {/* Text block */}
          <div className="flex flex-col justify-center">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              Multi Chart Dashboard
            </h1>
            <p className="text-[12px] text-gray-600">
              Monitor multiple cryptocurrency pairs simultaneously
            </p>
          </div>
        </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-lg">
            <IconChartDots2 size={15} stroke={2} className="text-black" />
            <span className="text-[12px] text-black">Currently showing:</span>
            <span className="text-[12px] font-bold text-black">{layout.charts.length} chart(s)</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6 px-30">
          {/* Number of Charts */}
          <div className="flex items-center gap-3">
            <IconSettings size={15} stroke={2} className="text-black" />
            <span className="text-[12px] font-medium text-gray-700">Number of Charts:</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map(num => (
                <button
                  key={num}
                  onClick={() => setChartCount(num)}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded-lg transition-all ${
                    layout.charts.length === num
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Layout Selector */}
          {availableLayouts.length > 1 && (
            <>
              <div className="w-px h-8 bg-gray-300" />
              <div className="flex items-center gap-3">
                <IconRuler size={15} stroke={2} className="text-black" />
                <span className="text-[12px] font-medium text-gray-700">Layout:</span>
                <LayoutVisualSelector
                  availableLayouts={availableLayouts}
                  currentLayout={layout.type}
                  onLayoutChange={changeLayout}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error/Warning Messages */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}
      
      {!status.connected && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 text-yellow-700 text-sm">
          ⏳ Connecting to WebSocket...
        </div>
      )}
      
      {/* Main Chart Area */}
      <div className="flex-1 p-2 bg-gray-50 overflow-hidden">
        <MultiChartContainer
          layout={layout}
          socket={socket}
          connected={status.connected}
          onUpdateChart={updateChart}
        />
      </div>
    </div>
  );
}
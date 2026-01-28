// app/dashboard/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { useChartData } from '../../src/hooks/useChartData';
import { Header } from '../../src/components/dashboard/Header';
import { Sidebar } from '../../src/components/dashboard/Sidebar';
import { RightSidebar, RightPanelType } from '../../src/components/dashboard/RightSidebar';
import { SentimentPanel } from '../../src/components/dashboard/SentimentPanel';
import { PredictionPanel } from '../../src/components/dashboard/PredictionPanel';
import { ChartToolbar } from '../../src/components/chart/ChartToolbar';
import { InfoBar } from '../../src/components/chart/InfoBar';
import { KLineChart } from '../../src/components/chart/KLineChart';

const WS_URL = 'http://localhost:3002/prices';

export default function DashboardPage() {
  const router = useRouter();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1s'); // Default to 1s
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanelType>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  const { socket, status, error, subscribe, unsubscribe } = useWebSocket(WS_URL);
  const { candles, latestPrice, loading } = useChartData(socket, symbol, timeframe);

  // Subscribe/Unsubscribe khi symbol hoặc timeframe thay đổi
  useEffect(() => {
    if (socket && status.connected) {
      console.log('🔔 Subscribing to', symbol, 'with interval', timeframe);
      subscribe([symbol], timeframe);
      
      return () => {
        console.log('🔕 Unsubscribing from', symbol, timeframe);
        unsubscribe([symbol], timeframe);
      };
    }
  }, [socket, status.connected, symbol, timeframe]);

  const handleSymbolChange = (newSymbol: string) => {
    console.log('🔄 Changing symbol from', symbol, 'to', newSymbol);
    setSymbol(newSymbol);
  };

  const handleTimeframeChange = (newTimeframe: string) => {
    console.log('🔄 Changing timeframe from', timeframe, 'to', newTimeframe);
    setTimeframe(newTimeframe);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <Header status={status} />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        {/* Main content area - min-w-0 allows flex item to shrink below content size */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChartToolbar 
            symbol={symbol}
            timeframe={timeframe}
            onSymbolChange={handleSymbolChange}
            onTimeframeChange={handleTimeframeChange}
          />
          
          <InfoBar latestPrice={latestPrice} />
          
          {/* Connection Status */}
          {!status.connected && (
            <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-yellow-700 text-sm">
              ⚠️ Connecting to WebSocket...
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-red-600 text-sm">
              ⚠️ {error}
            </div>
          )}
          
          {/* Debug Info */}
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-blue-600 text-xs">
            Connected: {status.connected ? '✅' : '❌'} | 
            Symbol: {symbol} | 
            Interval: {timeframe} | 
            Candles: {candles.length} | 
            Loading: {loading ? '⏳' : '✅'}
          </div>
          
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-2">📊</div>
                <div>Loading chart data for {symbol}...</div>
                <div className="text-sm mt-2">
                  Interval: {timeframe}
                </div>
                <div className="text-xs mt-2 text-gray-400">
                  Waiting for historical data from collector service
                </div>
              </div>
            </div>
          ) : candles.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-2">📭</div>
                <div>No chart data available</div>
                <div className="text-sm mt-2">
                  Symbol: {symbol} | Interval: {timeframe}
                </div>
              </div>
            </div>
          ) : (
            <KLineChart candles={candles} symbol={symbol} />
          )}
        </div>

        {/* Right Side Panel */}
        {activeRightPanel === 'sentiment' && (
          <SentimentPanel 
            symbol={symbol} 
            onClose={() => setActiveRightPanel(null)} 
          />
        )}
        {activeRightPanel === 'prediction' && (
          <PredictionPanel 
            symbol={symbol}
            interval="1h"  // Use 1h interval for ML prediction
            currentPrice={latestPrice} 
            onClose={() => setActiveRightPanel(null)} 
          />
        )}

        {/* Right Sidebar with icons */}
        <RightSidebar 
          activePanel={activeRightPanel} 
          onPanelChange={setActiveRightPanel} 
        />
      </div>
    </div>
  );
}
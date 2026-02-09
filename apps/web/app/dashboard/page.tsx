// app/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { useChartData } from '../../src/hooks/useChartData';
import { useDrawingManager } from '../../src/hooks/useDrawingManager';
import { useChartSettings } from '../../src/hooks/useChartSettings';
import { Header } from '../../src/components/page/Header';
import { Sidebar } from '../../src/components/toolbars/LeftSidebar';
import { RightSidebar, RightPanelType } from '../../src/components/page/RightSidebar';
import { SentimentPanel } from '../../src/components/page/SentimentPanel';
import { PredictionPanel } from '../../src/components/page/PredictionPanel';
import { ChatbotPanel } from '../../src/components/page/ChatbotPanel';
import { ChartToolbar } from '../../src/components/toolbars/ChartToolbar';
import { InfoBar } from '../../src/components/toolbars/InfoBar';
import { KLineChart } from '../../src/components/chart-tools/KLineChart';
import { IndicatorManager } from '../../src/components/chart-tools/IndicatorManager';
import { DrawingLayer } from '../../src/components/chart-tools/DrawingLayer';
import { FreeDrawingCanvas } from '../../src/components/chart-tools/FreeDrawingCanvas';
import { SimplePriceLevelLayer } from '../../src/components/chart-tools/SimplePriceLevelLayer';
import { FibonacciRetracementLayer } from '../../src/components/chart-tools/FibonacciRetracementLayer';
import { ChartHeader } from '../../src/components/toolbars/ChartHeader';
import { SubscribeButton } from '../../src/components/chart-tools/SubscribeButton';

const WS_URL = process.env.NEXT_PUBLIC_PRICE_WS_URL || 'http://localhost/prices';

export default function DashboardPage() {
  const router = useRouter();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1m');
  const [chartType, setChartType] = useState('candle_solid');
  const [selectedTimezone, setSelectedTimezone] = useState('Asia/Ho_Chi_Minh');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanelType>(null);
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const chartInstanceRef = useRef<any>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [volPaneId, setVolPaneId] = useState<string | null>(null);

  // Check VIP status from sessionStorage
  const isVip = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const userData = sessionStorage.getItem('user');
      if (!userData) return false;
      const user = JSON.parse(userData);
      return user?.role === 'vip' || user?.role === 'admin' || user?.vipStatus === 'ACTIVE';
    } catch {
      return false;
    }
  }, [isAuthenticated]);

  const { settings, updateSettings } = useChartSettings();

  const {
    state: drawingState,
    setActiveTool,
    toggleMagnetMode,
    toggleLockDrawings,
    toggleDrawingsVisibility,
    addDrawing,
    addFreeDrawing,
    clearAllDrawings,
    setTempDrawing,
    snapToPrice,
    addPriceLevelPoint,
    clearPriceLevels,
    setFibonacciHigh,
    setFibonacciLow,
    clearFibonacci,
  } = useDrawingManager(chartInstanceRef.current);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) {
      router.push('/auth');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  const { socket, status, error, subscribe, unsubscribe } = useWebSocket(WS_URL);
  const { candles, latestPrice, loading } = useChartData(socket, symbol, timeframe);

  useEffect(() => {
    if (socket && status.connected) {
      subscribe([symbol], timeframe);
      return () => unsubscribe([symbol], timeframe);
    }
  }, [socket, status.connected, symbol, timeframe]);

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
        <Sidebar
          activeTool={drawingState.activeTool}
          magnetMode={drawingState.magnetMode}
          drawingsLocked={drawingState.drawingsLocked}
          drawingsVisible={drawingState.drawingsVisible}
          onToolSelect={setActiveTool}
          onToggleMagnet={toggleMagnetMode}
          onToggleLock={toggleLockDrawings}
          onToggleVisibility={toggleDrawingsVisibility}
          onClearAll={clearAllDrawings}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center">
            <div className="flex-1">
              <ChartHeader symbol={symbol} showChartNumber={false} onSymbolChange={setSymbol} />
            </div>
            <div className="pr-2">
              <SubscribeButton symbol={symbol} />
            </div>
          </div>

          <ChartToolbar
            symbol={symbol}
            timeframe={timeframe}
            chartType={chartType}
            chartContainerRef={chartContainerRef}
            settings={settings}
            selectedTimezone={selectedTimezone}
            onSymbolChange={setSymbol}
            onTimeframeChange={setTimeframe}
            onTimezoneChange={setSelectedTimezone}
            onChartTypeChange={setChartType}
            onSettingsChange={updateSettings}
            onIndicatorClick={() => setShowIndicatorModal(true)}
          />

          <InfoBar latestPrice={latestPrice} />

          {loading ? (
            <div className="flex min-h-screen items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="mb-2 flex justify-center">
                  <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                </div>
                <div>Loading chart data...</div>
              </div>
            </div>
          ) : (
            <div ref={chartContainerRef} className="flex-1 relative">
              <KLineChart
                candles={candles}
                symbol={symbol}
                chartType={chartType}
                settings={settings}
                timezone={selectedTimezone}
                ref={chartInstanceRef}
                onVolPaneCreated={setVolPaneId}
                isLocked={drawingState.drawingsLocked}
              />
              <DrawingLayer
                chartInstance={chartInstanceRef.current}
                drawings={drawingState.drawings}
                tempDrawing={drawingState.tempDrawing}
                priceLevels={undefined}
              />
              <FreeDrawingCanvas
                activeTool={drawingState.activeTool}
                drawings={drawingState.freeDrawings}
                onDrawingComplete={addFreeDrawing}
                drawingsVisible={drawingState.drawingsVisible}
              />
              <SimplePriceLevelLayer
                activeTool={drawingState.activeTool}
                levels={drawingState.priceLevels || []}
                onAddLevel={addPriceLevelPoint}
                chartInstance={chartInstanceRef.current}
                drawingsVisible={drawingState.drawingsVisible}
              />
              <FibonacciRetracementLayer
                activeTool={drawingState.activeTool}
                highPoint={drawingState.fibonacciHigh || null}
                lowPoint={drawingState.fibonacciLow || null}
                onSetHighPoint={setFibonacciHigh}
                onSetLowPoint={setFibonacciLow}
                chartInstance={chartInstanceRef.current}
                drawingsVisible={drawingState.drawingsVisible}
              />
            </div>
          )}
        </div>

        {/* 🔥 RIGHT PANELS - Updated with Chatbot */}
        {activeRightPanel === 'sentiment' && (
          isVip ? (
            <SentimentPanel symbol={symbol} onClose={() => setActiveRightPanel(null)} />
          ) : (
            <div className="w-[400px] border-l border-gray-200 bg-white flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800">Sentiment Analysis</h3>
                <button
                  onClick={() => setActiveRightPanel(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-gray-800 mb-2">VIP Feature</h4>
                <p className="text-sm text-gray-500 mb-6">
                  Sentiment Analysis is exclusively available for VIP members. Upgrade to VIP to unlock real-time market sentiment insights.
                </p>
                <button
                  onClick={() => router.push('/vip-register')}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-semibold text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-md hover:shadow-lg"
                >
                  Upgrade to VIP
                </button>
              </div>
            </div>
          )
        )}
        {activeRightPanel === 'prediction' && (
          isVip ? (
            <PredictionPanel 
              symbol={symbol} 
              interval="1h" 
              currentPrice={latestPrice} 
              onClose={() => setActiveRightPanel(null)} 
            />
          ) : (
            <div className="w-[400px] border-l border-gray-200 bg-white flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800">ML Prediction</h3>
                <button
                  onClick={() => setActiveRightPanel(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-gray-800 mb-2">VIP Feature</h4>
                <p className="text-sm text-gray-500 mb-6">
                  ML Prediction is exclusively available for VIP members. Upgrade to VIP to unlock AI-powered price predictions.
                </p>
                <button
                  onClick={() => router.push('/vip-register')}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-semibold text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-md hover:shadow-lg"
                >
                  Upgrade to VIP
                </button>
              </div>
            </div>
          )
        )}
        {activeRightPanel === 'chatbot' && (
          <ChatbotPanel
            symbol={symbol}
            currentPrice={latestPrice?.close}
            onClose={() => setActiveRightPanel(null)}
          />
        )}
        
        <RightSidebar activePanel={activeRightPanel} onPanelChange={setActiveRightPanel} isVip={isVip} />
      </div>

      <IndicatorManager
        isOpen={showIndicatorModal}
        onClose={() => setShowIndicatorModal(false)}
        chartInstance={chartInstanceRef.current}
        volPaneId={volPaneId}
        symbol={symbol}
        timeframe={timeframe}
      />
    </div>
  );
}
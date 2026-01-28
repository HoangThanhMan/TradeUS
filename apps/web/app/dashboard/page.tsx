// app/dashboard/page.tsx (Updated)
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { useChartData } from '../../src/hooks/useChartData';
import { useDrawingManager } from '../../src/hooks/useDrawingManager';
import { Header } from '../../src/components/dashboard/Header';
import { Sidebar } from '../../src/components/dashboard/Sidebar';
import { RightSidebar, RightPanelType } from '../../src/components/dashboard/RightSidebar';
import { SentimentPanel } from '../../src/components/dashboard/SentimentPanel';
import { PredictionPanel } from '../../src/components/dashboard/PredictionPanel';
import { ChartToolbar } from '../../src/components/chart/ChartToolbar';
import { InfoBar } from '../../src/components/chart/InfoBar';
import { KLineChart } from '../../src/components/chart/KLineChart';
import { IndicatorManager } from '../../src/components/chart/IndicatorManager';
import { DrawingLayer } from '../../src/components/chart/DrawingLayer';
import { FreeDrawingCanvas } from '../../src/components/chart/FreeDrawingCanvas';
import { SimplePriceLevelLayer } from '../../src/components/chart/SimplePriceLevelLayer';
import { FibonacciRetracementLayer } from '../../src/components/chart/FibonacciRetracementLayer';

const WS_URL = 'http://localhost:3002/prices';

export default function DashboardPage() {
  const router = useRouter();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1m');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanelType>(null);
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const chartInstanceRef = useRef<any>(null);
  const [volPaneId, setVolPaneId] = useState<string | null>(null);

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
    const token = localStorage.getItem('token');
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
        
        {/* Main content area - min-w-0 allows flex item to shrink below content size */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChartToolbar 
            symbol={symbol}
            timeframe={timeframe}
            onSymbolChange={setSymbol}
            onTimeframeChange={setTimeframe}
            onIndicatorClick={() => setShowIndicatorModal(true)}
          />
          
          <InfoBar latestPrice={latestPrice} />
          
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-2">📊</div>
                <div>Loading chart data...</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative">
              {/* 🔥 UPDATED: Added isLocked prop */}
              <KLineChart 
                candles={candles} 
                symbol={symbol}
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
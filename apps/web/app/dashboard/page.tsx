// app/dashboard/page.tsx (UPDATED)
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { useChartData } from '../../src/hooks/useChartData';
import { useDrawingManager } from '../../src/hooks/useDrawingManager';
import { Header } from '../../src/components/page/Header';
import { Sidebar } from '../../src/components/toolbars/LeftSidebar';
import { ChartToolbar } from '../../src/components/toolbars/ChartToolbar';
import { InfoBar } from '../../src/components/toolbars/InfoBar';
import { KLineChart } from '../../src/components/chart-tools/KLineChart';
import { IndicatorManager } from '../../src/components/chart-tools/IndicatorManager';
import { DrawingLayer } from '../../src/components/chart-tools/DrawingLayer';
import { FreeDrawingCanvas } from '../../src/components/chart-tools/FreeDrawingCanvas';
import { SimplePriceLevelLayer } from '../../src/components/chart-tools/SimplePriceLevelLayer';
import { FibonacciRetracementLayer } from '../../src/components/chart-tools/FibonacciRetracementLayer';
import { ChartHeader } from '../../src/components/toolbars/ChartHeader';

const WS_URL = 'http://localhost:3002/prices';

export default function DashboardPage() {
  const router = useRouter();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1m');
  const [chartType, setChartType] = useState('candle_solid');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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

  const { socket, status, error, subscribe, unsubscribe } =
    useWebSocket(WS_URL);
  const { candles, latestPrice, loading } = useChartData(
    socket,
    symbol,
    timeframe,
  );

  useEffect(() => {
    if (socket && status.connected) {
      subscribe([symbol], timeframe);
      return () => unsubscribe([symbol], timeframe);
    }
  }, [socket, status.connected, symbol, timeframe]);

  const handleChartTypeChange = (newType: string) => {
    console.log('🎨 Changing chart type to:', newType);
    setChartType(newType);
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

        <div className="flex-1 flex flex-col">
          {/* 🔥 UPDATED: Pass onSymbolChange handler */}
          <ChartHeader
            symbol={symbol}
            showChartNumber={false}
            onSymbolChange={setSymbol}
          />

          <ChartToolbar
            symbol={symbol}
            timeframe={timeframe}
            chartType={chartType}
            onSymbolChange={setSymbol}
            onTimeframeChange={setTimeframe}
            onChartTypeChange={handleChartTypeChange}
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
            <div className="flex-1 relative">
              <KLineChart
                candles={candles}
                symbol={symbol}
                chartType={chartType}
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

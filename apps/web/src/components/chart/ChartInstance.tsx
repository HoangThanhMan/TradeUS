// src/components/chart/ChartInstance.tsx (Updated)
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useChartData } from '../../hooks/useChartData';
import { useDrawingManager } from '../../hooks/useDrawingManager';
import { KLineChart } from './KLineChart';
import { ChartToolbar } from './ChartToolbar';
import { InfoBar } from './InfoBar';
import { Sidebar } from '../dashboard/Sidebar';
import { IndicatorManager } from './IndicatorManager';
import { DrawingLayer } from './DrawingLayer';
import { FreeDrawingCanvas } from './FreeDrawingCanvas';
import { SimplePriceLevelLayer } from './SimplePriceLevelLayer';
import { FibonacciRetracementLayer } from './FibonacciRetracementLayer';
import { ChartConfig } from '../../types/layout.types';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { ChartHeader } from './ChartHeader';

interface ChartInstanceProps {
  config: ChartConfig;
  socket: Socket | null;
  connected: boolean;
  onUpdateChart: (
    chartId: string,
    updates: Partial<Pick<ChartConfig, 'symbol' | 'interval'>>,
  ) => void;
  chartNumber?: number;
}

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export function ChartInstance({
  config,
  socket,
  connected,
  onUpdateChart,
  chartNumber = 1,
}: ChartInstanceProps) {
  const { candles, latestPrice, loading } = useChartData(
    socket,
    config.symbol,
    config.interval,
  );
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
    if (socket && connected) {
      console.log(
        `[${config.id}] Subscribing to ${config.symbol}:${config.interval}`,
      );
      socket.emit('subscribe', {
        symbols: [config.symbol],
        interval: config.interval,
      });

      return () => {
        console.log(
          `[${config.id}] Unsubscribing from ${config.symbol}:${config.interval}`,
        );
        socket.emit('unsubscribe', {
          symbols: [config.symbol],
          interval: config.interval,
        });
      };
    }
  }, [socket, connected, config.symbol, config.interval, config.id]);

  const handleSymbolChange = (newSymbol: string) => {
    onUpdateChart(config.id, { symbol: newSymbol });
  };

  const handleTimeframeChange = (newInterval: string) => {
    onUpdateChart(config.id, { interval: newInterval });
  };

  const handleIndicatorClick = () => {
    console.log(`[${config.id}] Opening Indicator Manager`);
    setShowIndicatorModal(true);
  };

  return (
    <div
      className={`w-full h-full flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden relative ${pjs.className}`}
    >
      <ChartHeader symbol={config.symbol} chartNumber={chartNumber} />
      <div className="flex-1 flex min-h-0">
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
          <ChartToolbar
            symbol={config.symbol}
            timeframe={config.interval}
            onSymbolChange={handleSymbolChange}
            onTimeframeChange={handleTimeframeChange}
            onIndicatorClick={handleIndicatorClick}
          />

          <InfoBar latestPrice={latestPrice} />

          <div className="flex-1 min-h-0 relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white">
                <div className="text-sm text-gray-500">
                  Loading chart data...
                </div>
              </div>
            ) : candles.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white">
                <div className="text-sm text-gray-400">No data available</div>
              </div>
            ) : (
              <>
                {/* 🔥 UPDATED: Added isLocked prop */}
                <KLineChart
                  candles={candles}
                  symbol={config.symbol}
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
              </>
            )}
          </div>

          <div className="absolute bottom-2 right-2 z-40">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
          </div>
        </div>
      </div>

      <IndicatorManager
        isOpen={showIndicatorModal}
        onClose={() => setShowIndicatorModal(false)}
        chartInstance={chartInstanceRef.current}
        volPaneId={volPaneId}
        symbol={config.symbol}
        timeframe={config.interval}
      />
    </div>
  );
}

// src/components/chart/ChartInstance.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useChartData } from '../../../src/hooks/useChartData';
import { useDrawingManager } from '../../../src/hooks/useDrawingManager';
import {
  applySettings,
  DEFAULT_CHART_SETTINGS,
  ChartSettings,
} from '../../../src/hooks/useChartSettings';
import { KLineChart } from '../../../src/components/chart-tools/KLineChart';
import { ChartToolbar } from '../../../src/components/toolbars/ChartToolbar';
import { InfoBar } from '../../../src/components/toolbars/InfoBar';
import { Sidebar } from '../../../src/components/toolbars/LeftSidebar';
import { IndicatorManager } from '../../../src/components/chart-tools/IndicatorManager';
import { DrawingLayer } from '../../../src/components/chart-tools/DrawingLayer';
import { FreeDrawingCanvas } from '../../../src/components/chart-tools/FreeDrawingCanvas';
import { SimplePriceLevelLayer } from '../../../src/components/chart-tools/SimplePriceLevelLayer';
import { FibonacciRetracementLayer } from '../../../src/components/chart-tools/FibonacciRetracementLayer';
import { ChartConfig } from '../../../src/types/layout.types';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { ChartHeader } from '../../../src/components/toolbars/ChartHeader';

interface ChartInstanceProps {
  config: ChartConfig;
  socket: Socket | null;
  connected: boolean;
  onUpdateChart: (
    chartId: string,
    updates: Partial<Pick<ChartConfig, 'symbol' | 'interval' | 'settings'>>,
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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [volPaneId, setVolPaneId] = useState<string | null>(null);
  const [chartType, setChartType] = useState('candle_solid');

  // Local settings state initialized from config or defaults
  const [localSettings, setLocalSettings] = useState<ChartSettings>(
    config.settings || DEFAULT_CHART_SETTINGS,
  );

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

  // Apply settings to chart instance whenever they change
  useEffect(() => {
    if (chartInstanceRef.current && localSettings) {
      applySettings(chartInstanceRef.current, localSettings);
    }
  }, [localSettings]);

  // Sync settings changes back to parent
  const handleSettingsChange = (newSettings: ChartSettings) => {
    setLocalSettings(newSettings);
    onUpdateChart(config.id, { settings: newSettings });
  };

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
      ref={chartContainerRef}
      className={`w-full h-full flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden relative ${pjs.className}`}
    >
      {/* Chart Header with Symbol Selector */}
      <ChartHeader
        symbol={config.symbol}
        chartNumber={chartNumber}
        showChartNumber={true}
        onSymbolChange={handleSymbolChange}
      />

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
          {/* 🔥 INTEGRATED: Full ChartToolbar with all features */}
          <ChartToolbar
            symbol={config.symbol}
            timeframe={config.interval}
            chartType={chartType}
            chartContainerRef={chartContainerRef}
            settings={localSettings}
            onSymbolChange={handleSymbolChange}
            onTimeframeChange={handleTimeframeChange}
            onChartTypeChange={setChartType}
            onSettingsChange={handleSettingsChange}
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
                <KLineChart
                  candles={candles}
                  symbol={config.symbol}
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

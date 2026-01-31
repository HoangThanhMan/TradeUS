// src/components/chart/TimeframeChartInstance.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useChartData } from '../../../src/hooks/useChartData';
import { useDrawingManager } from '../../../src/hooks/useDrawingManager';
import { applySettings, DEFAULT_CHART_SETTINGS, ChartSettings } from '../../../src/hooks/useChartSettings';
import { KLineChart } from '../../../src/components/chart-tools/KLineChart';
import { Sidebar } from '../../../src/components/toolbars/LeftSidebar';
import { ChartToolbar } from '../../../src/components/toolbars/ChartToolbar';
import { InfoBar } from '../../../src/components/toolbars/InfoBar';
import { IndicatorManager } from '../../../src/components/chart-tools/IndicatorManager';
import { DrawingLayer } from '../../../src/components/chart-tools/DrawingLayer';
import { FreeDrawingCanvas } from '../../../src/components/chart-tools/FreeDrawingCanvas';
import { SimplePriceLevelLayer } from '../../../src/components/chart-tools/SimplePriceLevelLayer';
import { FibonacciRetracementLayer } from '../../../src/components/chart-tools/FibonacciRetracementLayer';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { SYMBOL_META } from '../../../src/constants/symbols';

interface TimeframeChartInstanceProps {
  symbol: string;
  interval: string;
  socket: Socket | null;
  connected: boolean;
  chartNumber: number;
  onTimeframeChange?: (newTimeframe: string) => void;
  settings?: ChartSettings; // 🔥 NEW: Accept settings from parent
  onSettingsChange?: (newSettings: ChartSettings) => void; // 🔥 NEW: Settings change handler
}

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export function TimeframeChartInstance({
  symbol,
  interval,
  socket,
  connected,
  chartNumber,
  onTimeframeChange,
  settings: initialSettings,
  onSettingsChange,
}: TimeframeChartInstanceProps) {
  const { candles, latestPrice, loading } = useChartData(
    socket,
    symbol,
    interval,
  );
  const chartInstanceRef = useRef<any>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null); // 🔥 NEW: For fullscreen/screenshot
  const [volPaneId, setVolPaneId] = useState<string | null>(null);
  const [showIndicatorModal, setShowIndicatorModal] = useState(false);
  const [chartType, setChartType] = useState('candle_solid');

  // 🔥 NEW: Local settings state
  const [localSettings, setLocalSettings] = useState<ChartSettings>(
    initialSettings || DEFAULT_CHART_SETTINGS
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

  // 🔥 NEW: Apply settings to chart instance
  useEffect(() => {
    if (chartInstanceRef.current && localSettings) {
      applySettings(chartInstanceRef.current, localSettings);
    }
  }, [localSettings]);

  // 🔥 NEW: Settings change handler
  const handleSettingsChange = (newSettings: ChartSettings) => {
    setLocalSettings(newSettings);
    if (onSettingsChange) {
      onSettingsChange(newSettings);
    }
  };

  useEffect(() => {
    if (socket && connected) {
      console.log(
        `[Timeframe ${interval}] Subscribing to ${symbol}:${interval}`,
      );
      socket.emit('subscribe', {
        symbols: [symbol],
        interval: interval,
      });

      return () => {
        console.log(
          `[Timeframe ${interval}] Unsubscribing from ${symbol}:${interval}`,
        );
        socket.emit('unsubscribe', {
          symbols: [symbol],
          interval: interval,
        });
      };
    }
  }, [socket, connected, symbol, interval]);

  // Helper function to format timeframe display
  const formatTimeframe = (interval: string): string => {
    const mapping: Record<string, string> = {
      '1s': '1 Second',
      '1m': '1 Minute',
      '5m': '5 Minutes',
      '15m': '15 Minutes',
      '30m': '30 Minutes',
      '1h': '1 Hour',
      '2h': '2 Hours',
      '4h': '4 Hours',
      '6h': '6 Hours',
      '12h': '12 Hours',
      '1d': 'Daily',
      '3d': '3 Days',
      '1w': 'Weekly',
      '1M': 'Monthly',
    };
    return mapping[interval] || interval.toUpperCase();
  };

  // Helper function to get badge color and text based on interval
  const getChartBadge = (
    interval: string,
    chartNumber: number,
  ): { color: string; text: string } => {
    // Get badge text from interval
    const getBadgeText = (interval: string): string => {
      const mapping: Record<string, string> = {
        '1s': '1S',
        '1m': '1M',
        '5m': '5M',
        '15m': '15M',
        '30m': '30M',
        '1h': '1H',
        '2h': '2H',
        '4h': '4H',
        '6h': '6H',
        '12h': '12H',
        '1d': '1D',
        '3d': '3D',
        '1w': '1W',
        '1M': '1MO',
      };
      return mapping[interval] || interval.toUpperCase();
    };

    // Get badge color based on chart number
    const colors = [
      'bg-green-500', // Chart 1
      'bg-blue-600', // Chart 2
      'bg-orange-500', // Chart 3
      'bg-purple-600', // Chart 4
    ];
    const color = colors[(chartNumber - 1) % colors.length] || 'bg-gray-500';

    return {
      color,
      text: getBadgeText(interval),
    };
  };

  const baseSymbol = symbol.replace('USDT', '');
  const chartBadge = getChartBadge(interval, chartNumber);

  // Symbol change handler (no-op, controlled by parent)
  const handleSymbolChange = (newSymbol: string) => {
    // Symbol is controlled by parent component
  };

  // Timeframe change handler
  const handleTimeframeChange = (newInterval: string) => {
    if (onTimeframeChange) {
      onTimeframeChange(newInterval);
    }
  };

  const handleIndicatorClick = () => {
    console.log(`[Chart ${chartNumber}] Opening Indicator Manager`);
    setShowIndicatorModal(true);
  };

  return (
    <div
      ref={chartContainerRef} // 🔥 NEW: Attach ref for fullscreen/screenshot
      className={`w-full h-full flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden relative ${pjs.className}`}
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex flex-col gap-0.5">
          {/* Symbol and Timeframe */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-900">{symbol}</span>
            <span className="text-xs text-gray-500">-</span>
            <span className="text-xs text-gray-600 font-semibold font-medium">
              {formatTimeframe(interval)}
            </span>
          </div>

          {/* Subtitle with meta info */}
          {(() => {
            const meta = SYMBOL_META[baseSymbol];
            return meta ? (
              <div className="text-[10px] text-gray-500">
                {meta.name} • {meta.category}
              </div>
            ) : null;
          })()}
        </div>

        {/* Badge */}
        <div
          className={`${chartBadge.color} text-white px-2.5 py-1 rounded text-[10px] font-bold tracking-wide`}
        >
          {chartBadge.text}
        </div>
      </div>

      {/* Main Content with Sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
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

        {/* Chart Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 🔥 UPDATED: Chart Toolbar with full feature integration */}
          <ChartToolbar
            symbol={symbol}
            timeframe={interval}
            chartType={chartType}
            chartContainerRef={chartContainerRef} // 🔥 NEW: Pass ref for fullscreen/screenshot
            settings={localSettings} // 🔥 NEW: Pass settings
            onSymbolChange={handleSymbolChange}
            onTimeframeChange={handleTimeframeChange}
            onChartTypeChange={setChartType}
            onSettingsChange={handleSettingsChange} // 🔥 NEW: Pass settings handler
            onIndicatorClick={handleIndicatorClick}
          />

          {/* Info Bar */}
          <InfoBar latestPrice={latestPrice} />

          {/* Chart */}
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
              </>
            )}
          </div>

          {/* Connection Status Indicator */}
          <div className="absolute bottom-2 right-2 z-40">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Indicator Manager Modal */}
      <IndicatorManager
        isOpen={showIndicatorModal}
        onClose={() => setShowIndicatorModal(false)}
        chartInstance={chartInstanceRef.current}
        volPaneId={volPaneId}
        symbol={symbol}
        timeframe={interval}
      />
    </div>
  );
}
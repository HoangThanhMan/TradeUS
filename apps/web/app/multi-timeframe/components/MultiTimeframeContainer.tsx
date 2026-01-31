// src/components/chart/MultiTimeframeContainer.tsx
'use client';

import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { TimeframeChartInstance } from './TimeframeChartInstance';
import {
  DEFAULT_CHART_SETTINGS,
  ChartSettings,
} from '../../../src/hooks/useChartSettings';
import { Plus_Jakarta_Sans } from 'next/font/google';

interface MultiTimeframeContainerProps {
  symbol: string;
  timeframes: string[];
  socket: Socket | null;
  connected: boolean;
}

interface ChartState {
  timeframe: string;
  settings: ChartSettings;
}

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export function MultiTimeframeContainer({
  symbol,
  timeframes: initialTimeframes,
  socket,
  connected,
}: MultiTimeframeContainerProps) {
  // 🔥 NEW: State to manage both timeframes and settings for each chart
  const [chartStates, setChartStates] = useState<ChartState[]>(
    initialTimeframes.map((timeframe) => ({
      timeframe,
      settings: { ...DEFAULT_CHART_SETTINGS }, // Clone default settings for each chart
    })),
  );

  // 🔥 NEW: Handler to update a specific chart's timeframe
  const handleTimeframeChange = (chartIndex: number, newTimeframe: string) => {
    setChartStates((prev) => {
      const updated = [...prev];
      updated[chartIndex] = {
        ...updated[chartIndex],
        timeframe: newTimeframe,
      };
      return updated;
    });
  };

  // 🔥 NEW: Handler to update a specific chart's settings
  const handleSettingsChange = (
    chartIndex: number,
    newSettings: ChartSettings,
  ) => {
    setChartStates((prev) => {
      const updated = [...prev];
      updated[chartIndex] = {
        ...updated[chartIndex],
        settings: newSettings,
      };
      return updated;
    });
  };

  // Create a 2x2 grid
  return (
    <div
      className={`w-full h-full grid grid-cols-2 grid-rows-2 gap-2 ${pjs.className}`}
    >
      {chartStates.map((chartState, index) => (
        <TimeframeChartInstance
          key={`${symbol}-${index}`}
          symbol={symbol}
          interval={chartState.timeframe}
          socket={socket}
          connected={connected}
          chartNumber={index + 1}
          settings={chartState.settings} 
          onTimeframeChange={(newTimeframe) =>
            handleTimeframeChange(index, newTimeframe)
          }
          onSettingsChange={(newSettings) =>
            handleSettingsChange(index, newSettings)
          } // 🔥 NEW: Pass settings handler
        />
      ))}
    </div>
  );
}

// src/components/chart/MultiTimeframeContainer.tsx
'use client';

import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { TimeframeChartInstance } from './TimeframeChartInstance';
import { Plus_Jakarta_Sans } from 'next/font/google';

interface MultiTimeframeContainerProps {
  symbol: string;
  timeframes: string[];
  socket: Socket | null;
  connected: boolean;
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
  // State to manage individual timeframes for each chart
  const [chartTimeframes, setChartTimeframes] =
    useState<string[]>(initialTimeframes);

  // Handler to update a specific chart's timeframe
  const handleTimeframeChange = (chartIndex: number, newTimeframe: string) => {
    setChartTimeframes((prev) => {
      const updated = [...prev];
      updated[chartIndex] = newTimeframe;
      return updated;
    });
  };

  // Create a 2x2 grid
  return (
    <div
      className={`w-full h-full grid grid-cols-2 grid-rows-2 gap-2 ${pjs.className}`}
    >
      {chartTimeframes.map((timeframe, index) => (
        <TimeframeChartInstance
          key={`${symbol}-${index}`}
          symbol={symbol}
          interval={timeframe}
          socket={socket}
          connected={connected}
          chartNumber={index + 1}
          onTimeframeChange={(newTimeframe) =>
            handleTimeframeChange(index, newTimeframe)
          }
        />
      ))}
    </div>
  );
}

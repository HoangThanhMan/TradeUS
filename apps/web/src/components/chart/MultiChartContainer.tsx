'use client';

import React from 'react';
import { Socket } from 'socket.io-client';
import { LayoutConfig } from '../../types/layout.types';
import { ChartInstance } from './ChartInstance';

interface MultiChartContainerProps {
  layout: LayoutConfig;
  socket: Socket | null;
  connected: boolean;
  onUpdateChart: (chartId: string, updates: any) => void;
}

export function MultiChartContainer({ layout, socket, connected, onUpdateChart }: MultiChartContainerProps) {
  return (
    <div 
      className="w-full h-full"
      style={{
        display: 'grid',
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gap: '12px',
      }}
    >
      {layout.charts.map((chartConfig) => (
        <div 
          key={chartConfig.id}
          style={{
            gridRow: `${chartConfig.position.row + 1} / span ${chartConfig.position.rowSpan}`,
            gridColumn: `${chartConfig.position.col + 1} / span ${chartConfig.position.colSpan}`,
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <ChartInstance
            config={chartConfig}
            socket={socket}
            connected={connected}
            onUpdateChart={onUpdateChart}
          />
        </div>
      ))}
    </div>
  );
}
'use client';

import { useState, useCallback } from 'react';
import { ChartConfig, LayoutConfig, LayoutType, LAYOUT_PRESETS, LAYOUT_OPTIONS_BY_COUNT } from '../types/layout.types';

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];

export function useMultiChart() {
  const [layout, setLayout] = useState<LayoutConfig>({
    ...LAYOUT_PRESETS['1x1'],
    charts: [{
      id: 'chart-1',
      symbol: 'BTCUSDT',
      interval: '1m',
      position: { row: 0, col: 0, rowSpan: 1, colSpan: 1 }
    }]
  });

  const changeLayout = useCallback((layoutType: LayoutType) => {
    const preset = LAYOUT_PRESETS[layoutType];
    const charts: ChartConfig[] = [];
    
    if (layoutType === '1x1') {
      // 1 chart
      charts.push({
        id: 'chart-1',
        symbol: layout.charts[0]?.symbol || 'BTCUSDT',
        interval: layout.charts[0]?.interval || '1m',
        position: { row: 0, col: 0, rowSpan: 1, colSpan: 1 }
      });
    } 
    else if (layoutType === '1x2') {
      // 2 charts: left and right
      for (let col = 0; col < 2; col++) {
        charts.push({
          id: `chart-${col + 1}`,
          symbol: layout.charts[col]?.symbol || DEFAULT_SYMBOLS[col],
          interval: layout.charts[col]?.interval || '1m',
          position: { row: 0, col, rowSpan: 1, colSpan: 1 }
        });
      }
    } 
    else if (layoutType === '2x1') {
      // 2 charts: top and bottom
      for (let row = 0; row < 2; row++) {
        charts.push({
          id: `chart-${row + 1}`,
          symbol: layout.charts[row]?.symbol || DEFAULT_SYMBOLS[row],
          interval: layout.charts[row]?.interval || '1m',
          position: { row, col: 0, rowSpan: 1, colSpan: 1 }
        });
      }
    } 
    else if (layoutType === '2top-1bottom') {
      // 3 charts: 2 on top, 1 on bottom (spanning full width)
      // Top row: 2 charts
      for (let col = 0; col < 2; col++) {
        charts.push({
          id: `chart-${col + 1}`,
          symbol: layout.charts[col]?.symbol || DEFAULT_SYMBOLS[col],
          interval: layout.charts[col]?.interval || '1m',
          position: { row: 0, col, rowSpan: 1, colSpan: 1 }
        });
      }
      // Bottom row: 1 chart spanning both columns
      charts.push({
        id: 'chart-3',
        symbol: layout.charts[2]?.symbol || DEFAULT_SYMBOLS[2],
        interval: layout.charts[2]?.interval || '1m',
        position: { row: 1, col: 0, rowSpan: 1, colSpan: 2 }
      });
    } 
    else if (layoutType === '1top-2bottom') {
      // 3 charts: 1 on top (spanning full width), 2 on bottom
      // Top row: 1 chart spanning both columns
      charts.push({
        id: 'chart-1',
        symbol: layout.charts[0]?.symbol || DEFAULT_SYMBOLS[0],
        interval: layout.charts[0]?.interval || '1m',
        position: { row: 0, col: 0, rowSpan: 1, colSpan: 2 }
      });
      // Bottom row: 2 charts
      for (let col = 0; col < 2; col++) {
        charts.push({
          id: `chart-${col + 2}`,
          symbol: layout.charts[col + 1]?.symbol || DEFAULT_SYMBOLS[col + 1],
          interval: layout.charts[col + 1]?.interval || '1m',
          position: { row: 1, col, rowSpan: 1, colSpan: 1 }
        });
      }
    } 
    else if (layoutType === '2x2') {
      // 4 charts: 2x2 grid
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const index = row * 2 + col;
          charts.push({
            id: `chart-${index + 1}`,
            symbol: layout.charts[index]?.symbol || DEFAULT_SYMBOLS[index],
            interval: layout.charts[index]?.interval || '1m',
            position: { row, col, rowSpan: 1, colSpan: 1 }
          });
        }
      }
    }

    setLayout({
      ...preset,
      charts
    });
  }, [layout.charts]);

  const updateChart = useCallback((chartId: string, updates: Partial<Pick<ChartConfig, 'symbol' | 'interval'>>) => {
    setLayout(prev => ({
      ...prev,
      charts: prev.charts.map(chart =>
        chart.id === chartId ? { ...chart, ...updates } : chart
      )
    }));
  }, []);

  const setChartCount = useCallback((count: number) => {
    // Get first available layout for this count
    const availableLayouts = LAYOUT_OPTIONS_BY_COUNT[count];
    if (availableLayouts && availableLayouts.length > 0) {
      changeLayout(availableLayouts[0]);
    }
  }, [changeLayout]);

  const getAvailableLayouts = useCallback(() => {
    return LAYOUT_OPTIONS_BY_COUNT[layout.charts.length] || [];
  }, [layout.charts.length]);

  return {
    layout,
    changeLayout,
    updateChart,
    setChartCount,
    getAvailableLayouts,
  };
}   
// src/hooks/useMultiChart.ts
'use client';

import { useState, useCallback } from 'react';
import {
  LayoutType,
  LayoutConfig,
  ChartConfig,
  DEFAULT_SYMBOLS,
  LAYOUT_PRESETS,
  LAYOUT_OPTIONS_BY_COUNT,
} from '../types/layout.types';
import { DEFAULT_CHART_SETTINGS, ChartSettings } from './useChartSettings';

function createChartConfig(
  index: number,
  layoutType: LayoutType,
  existingChart?: ChartConfig,
): ChartConfig {
  const positions: Record<LayoutType, ChartConfig['position'][]> = {
    '1x1': [{ row: 0, col: 0, rowSpan: 1, colSpan: 1 }],
    '1x2': [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { row: 0, col: 1, rowSpan: 1, colSpan: 1 },
    ],
    '2x1': [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1 },
    ],
    '2top-1bottom': [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { row: 0, col: 1, rowSpan: 1, colSpan: 1 },
      { row: 1, col: 0, rowSpan: 1, colSpan: 2 },
    ],
    '1top-2bottom': [
      { row: 0, col: 0, rowSpan: 1, colSpan: 2 },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    ],
    '2x2': [
      { row: 0, col: 0, rowSpan: 1, colSpan: 1 },
      { row: 0, col: 1, rowSpan: 1, colSpan: 1 },
      { row: 1, col: 0, rowSpan: 1, colSpan: 1 },
      { row: 1, col: 1, rowSpan: 1, colSpan: 1 },
    ],
  };

  return {
    id: existingChart?.id || `chart-${index + 1}`,
    symbol: existingChart?.symbol || DEFAULT_SYMBOLS[index] || 'BTCUSDT',
    interval: existingChart?.interval || '1m',
    position: positions[layoutType][index],
    settings: existingChart?.settings || { ...DEFAULT_CHART_SETTINGS }, // 🔥 Clone default settings
  };
}

function createLayout(
  type: LayoutType,
  chartCount: number,
  existingCharts?: ChartConfig[],
): LayoutConfig {
  const preset = LAYOUT_PRESETS[type];
  const charts = Array.from({ length: chartCount }, (_, i) =>
    createChartConfig(i, type, existingCharts?.[i]),
  );

  return {
    ...preset,
    charts,
  };
}

export function useMultiChart() {
  const [layout, setLayout] = useState<LayoutConfig>(() =>
    createLayout('1x1', 1),
  );

  const changeLayout = useCallback((newType: LayoutType) => {
    setLayout((prev) => createLayout(newType, prev.charts.length, prev.charts));
  }, []);

  const setChartCount = useCallback((count: number) => {
    setLayout((prev) => {
      // Get first available layout for this count
      const availableLayouts = LAYOUT_OPTIONS_BY_COUNT[count];
      if (!availableLayouts || availableLayouts.length === 0) {
        return prev;
      }

      // Prefer current layout type if it's available for the new count
      const newType = availableLayouts.includes(prev.type)
        ? prev.type
        : availableLayouts[0];

      return createLayout(newType, count, prev.charts);
    });
  }, []);

  const updateChart = useCallback(
    (
      chartId: string,
      updates: Partial<Pick<ChartConfig, 'symbol' | 'interval' | 'settings'>>,
    ) => {
      setLayout((prev) => ({
        ...prev,
        charts: prev.charts.map((chart) =>
          chart.id === chartId
            ? {
                ...chart,
                ...updates,
                // 🔥 Ensure settings are properly merged
                settings: updates.settings
                  ? { ...chart.settings, ...updates.settings }
                  : chart.settings,
              }
            : chart,
        ),
      }));
    },
    [],
  );

  const getAvailableLayouts = useCallback((): LayoutType[] => {
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

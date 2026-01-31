// src/hooks/useChartSettings.ts
'use client';

import { useState, useCallback } from 'react';

export interface ChartSettings {
  showGrid: boolean;
  showCrosshair: boolean;
  showPriceMark: boolean;
  candleUpColor: string;
  candleDownColor: string;
  barSpace: number;
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  showGrid: true,
  showCrosshair: true,
  showPriceMark: true,
  candleUpColor: '#0ecb81',
  candleDownColor: '#f6465d',
  barSpace: 12,
};

/**
 * Apply full settings object onto a klinecharts instance.
 * Call this after init or whenever settings change.
 */
export function applySettings(chartInstance: any, s: ChartSettings) {
  if (!chartInstance) return;

  try {
    chartInstance.setStyles({
      grid: {
        horizontal: { show: s.showGrid },
        vertical: { show: s.showGrid },
      },
      crosshair: {
        horizontal: { show: s.showCrosshair },
        vertical: { show: s.showCrosshair },
      },
      candle: {
        priceMark: { show: s.showPriceMark },
        bar: {
          upColor: s.candleUpColor,
          downColor: s.candleDownColor,
          upBorderColor: s.candleUpColor,
          downBorderColor: s.candleDownColor,
          upWickColor: s.candleUpColor,
          downWickColor: s.candleDownColor,
        },
      },
    });

    chartInstance.setBarSpace(s.barSpace);
  } catch (e) {
    console.warn('applySettings error:', e);
  }
}

export function useChartSettings() {
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);

  const updateSettings = useCallback((next: ChartSettings) => {
    setSettings(next);
  }, []);

  return { settings, updateSettings };
}
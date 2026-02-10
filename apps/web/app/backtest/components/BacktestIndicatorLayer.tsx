// app/backtest/components/BacktestIndicatorLayer.tsx - DYNAMIC RENDERING
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  StrategyCondition,
  IndicatorType,
} from '../../../src/types/backtest.types';

interface Props {
  chartInstance: any;
  conditions: StrategyCondition[];
  indicators: Map<string, number[]>;
  candles: Array<{ time: number; close: number }>;
}

interface IndicatorLine {
  key: string;
  values: number[];
  color: string;
  label: string;
}

export function BacktestIndicatorLayer({
  chartInstance,
  conditions,
  indicators,
  candles,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const rafIdRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);

  // 🔥 Memoize indicator lines extraction
  const indicatorLines = useCallback((): IndicatorLine[] => {
    const linesMap = new Map<string, IndicatorLine>();

    conditions.forEach((condition) => {
      // Process indicator1
      if (shouldRenderIndicator(condition.indicator1)) {
        const key = getIndicatorKey(
          condition.indicator1,
          condition.indicator1Params,
        );
        const values = indicators.get(key);

        if (values && !linesMap.has(key)) {
          linesMap.set(key, {
            key,
            values,
            color: condition.indicator1Color || '#F97316',
            label: getIndicatorLabel(
              condition.indicator1,
              condition.indicator1Params,
            ),
          });
        }
      } else if (
        condition.indicator1 === 'RSI' ||
        condition.indicator1 === 'MACD' ||
        condition.indicator1 === 'MACD_Signal'
      ) {
        console.warn(
          `⚠️ ${condition.indicator1} is an oscillator and needs a separate pane. It will not be shown on the price chart.`,
        );
      }

      // Process indicator2
      if (
        typeof condition.indicator2 === 'string' &&
        shouldRenderIndicator(condition.indicator2)
      ) {
        const key = getIndicatorKey(
          condition.indicator2,
          condition.indicator2Params,
        );
        const values = indicators.get(key);

        if (values && !linesMap.has(key)) {
          linesMap.set(key, {
            key,
            values,
            color: condition.indicator2Color || '#3B82F6',
            label: getIndicatorLabel(
              condition.indicator2,
              condition.indicator2Params,
            ),
          });
        }
      } else if (
        typeof condition.indicator2 === 'string' &&
        (condition.indicator2 === 'RSI' ||
          condition.indicator2 === 'MACD' ||
          condition.indicator2 === 'MACD_Signal')
      ) {
        console.warn(
          `⚠️ ${condition.indicator2} is an oscillator and needs a separate pane. It will not be shown on the price chart.`,
        );
      }
    });

    return Array.from(linesMap.values());
  }, [conditions, indicators]);

  const shouldRenderIndicator = (indicator: IndicatorType): boolean => {
    // Only render price-based indicators on main pane
    // RSI, MACD need separate panes
    return (
      indicator === 'SMA' ||
      indicator === 'EMA' ||
      indicator === 'BB_Upper' ||
      indicator === 'BB_Middle' ||
      indicator === 'BB_Lower'
    );
  };

  const getIndicatorKey = (
    indicator: IndicatorType,
    params?: number[],
  ): string => {
    if (!params || params.length === 0) {
      return indicator;
    }
    return `${indicator}_${params[0]}`;
  };

  const getIndicatorLabel = (
    indicator: IndicatorType,
    params?: number[],
  ): string => {
    if (!params || params.length === 0) {
      return indicator;
    }
    return `${indicator}(${params[0]})`;
  };

  // 🔥 Convert timestamp to X coordinate
  const timestampToX = useCallback(
    (timestamp: number): number | null => {
      if (!chartInstance) return null;
      try {
        if (typeof chartInstance.convertToPixel === 'function') {
          const result = chartInstance.convertToPixel(
            { timestamp },
            { paneId: 'candle_pane' },
          );
          if (result && typeof result.x === 'number') {
            return result.x;
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    },
    [chartInstance],
  );

  // 🔥 Convert price to Y coordinate
  const priceToY = useCallback(
    (price: number): number | null => {
      if (!chartInstance) return null;
      try {
        if (typeof chartInstance.convertToPixel === 'function') {
          const result = chartInstance.convertToPixel(
            { value: price },
            { paneId: 'candle_pane' },
          );
          if (result && typeof result.y === 'number') {
            return result.y;
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    },
    [chartInstance],
  );

  // 🔥 Draw single indicator line
  const drawIndicatorLine = useCallback(
    (ctx: CanvasRenderingContext2D, line: IndicatorLine) => {
      if (!chartInstance || line.values.length === 0 || candles.length === 0) {
        return;
      }

      ctx.beginPath();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);

      let isFirstPoint = true;
      let pointsDrawn = 0;

      for (let i = 0; i < Math.min(line.values.length, candles.length); i++) {
        const value = line.values[i];
        if (isNaN(value) || value === null || value === undefined) continue;

        const timestamp = candles[i].time;
        const x = timestampToX(timestamp);
        const y = priceToY(value);

        if (x === null || y === null) continue;

        if (isFirstPoint) {
          ctx.moveTo(x, y);
          isFirstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
        pointsDrawn++;
      }

      if (pointsDrawn > 0) {
        ctx.stroke();
      }
    },
    [chartInstance, candles, timestampToX, priceToY],
  );

  // 🔥 Main draw function
  const draw = useCallback(() => {
    if (isDrawingRef.current) return;
    if (!canvasRef.current || !chartInstance || candles.length === 0) return;

    isDrawingRef.current = true;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      isDrawingRef.current = false;
      return;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all indicator lines
    const lines = indicatorLines();
    lines.forEach((line) => {
      drawIndicatorLine(ctx, line);
    });

    isDrawingRef.current = false;
  }, [chartInstance, candles, indicatorLines, drawIndicatorLine]);

  // 🔥 Schedule draw using requestAnimationFrame for smooth updates
  const scheduleDraw = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      draw();
      rafIdRef.current = null;
    });
  }, [draw]);

  // 🔥 Update dimensions
  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    }
  }, []);

  // 🔥 Setup resize observer
  useEffect(() => {
    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [updateDimensions]);

  // 🔥 Update canvas size when dimensions change
  useEffect(() => {
    if (canvasRef.current && dimensions.width > 0 && dimensions.height > 0) {
      canvasRef.current.width = dimensions.width;
      canvasRef.current.height = dimensions.height;
      scheduleDraw();
    }
  }, [dimensions, scheduleDraw]);

  // 🔥 Listen to chart events (scroll, zoom, pan)
  useEffect(() => {
    if (!chartInstance) return;

    try {
      // Subscribe to all chart update events
      const handleChartUpdate = () => {
        scheduleDraw();
      };

      chartInstance.subscribeAction('onScroll', handleChartUpdate);
      chartInstance.subscribeAction('onZoom', handleChartUpdate);
      chartInstance.subscribeAction('onVisibleRangeChange', handleChartUpdate);
      chartInstance.subscribeAction('onCrosshairChange', handleChartUpdate);
      chartInstance.subscribeAction('onPaneDrag', handleChartUpdate);

      // Initial draw
      scheduleDraw();

      return () => {
        try {
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
          }
          chartInstance.unsubscribeAction('onScroll', handleChartUpdate);
          chartInstance.unsubscribeAction('onZoom', handleChartUpdate);
          chartInstance.unsubscribeAction(
            'onVisibleRangeChange',
            handleChartUpdate,
          );
          chartInstance.unsubscribeAction(
            'onCrosshairChange',
            handleChartUpdate,
          );
          chartInstance.unsubscribeAction('onPaneDrag', handleChartUpdate);
        } catch (e) {
          console.warn('Failed to unsubscribe chart events:', e);
        }
      };
    } catch (e) {
      console.warn('Failed to subscribe to chart events:', e);
    }
  }, [chartInstance, scheduleDraw]);

  // 🔥 Redraw when data changes
  useEffect(() => {
    scheduleDraw();
  }, [conditions, indicators, candles, scheduleDraw]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 90 }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

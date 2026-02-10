// app/backtest/components/BacktestAILayer.tsx - SHARP AND CLEAR RENDERING
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AIPrediction } from '../../../src/types/backtest.types';
import { Plus_Jakarta_Sans } from 'next/font/google';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

interface Props {
  chartInstance: any;
  aiPredictions: AIPrediction[];
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  showPredictions: boolean;
}

export function BacktestAILayer({
  chartInstance,
  aiPredictions,
  candles,
  showPredictions,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const lastUpdateTimeRef = useRef<number>(0); // 🔥 Throttle updates

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

  // 🔥 Memoize candle lookup for better performance
  const candleTimestampMap = React.useMemo(() => {
    const map = new Map<number, (typeof candles)[0]>();
    candles.forEach((candle) => {
      map.set(candle.time, candle);
    });
    return map;
  }, [candles]);

  const findCandleAtTimestamp = useCallback(
    (timestamp: number) => {
      if (!candles || candles.length === 0) return null;

      // 🔥 Try exact match first (faster)
      const exactMatch = candleTimestampMap.get(timestamp);
      if (exactMatch) return exactMatch;

      // Fallback to closest candle
      let closestCandle = candles[0];
      let minDiff = Math.abs(candles[0].time - timestamp);

      for (const candle of candles) {
        const diff = Math.abs(candle.time - timestamp);
        if (diff < minDiff) {
          minDiff = diff;
          closestCandle = candle;
        }
      }

      return closestCandle;
    },
    [candles, candleTimestampMap],
  );

  // 🔥 OPTIMIZED: Throttled schedule update (max 60 FPS)
  const scheduleUpdate = useCallback(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

    // Throttle to ~60 FPS (16.67ms)
    if (timeSinceLastUpdate < 16) {
      return; // Skip this update
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      lastUpdateTimeRef.current = Date.now();
      setRenderKey((prev) => prev + 1);
      rafIdRef.current = null;
    });
  }, []);

  // 🔥 Listen to chart events for smooth updates
  useEffect(() => {
    if (!chartInstance) return;

    try {
      const events = [
        'onScroll',
        'onZoom',
        'onVisibleRangeChange',
        'onCrosshairChange',
        'onPaneDrag',
      ];

      events.forEach((event) => {
        chartInstance.subscribeAction(event, scheduleUpdate);
      });

      // Initial render
      scheduleUpdate();

      return () => {
        try {
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
          }
          events.forEach((event) => {
            chartInstance.unsubscribeAction(event, scheduleUpdate);
          });
        } catch (e) {
          console.warn('Failed to unsubscribe chart events:', e);
        }
      };
    } catch (e) {
      console.warn('Failed to subscribe to chart events:', e);
    }
  }, [chartInstance, scheduleUpdate]);

  // Re-render when data changes
  useEffect(() => {
    scheduleUpdate();
  }, [aiPredictions, showPredictions, scheduleUpdate]);

  // 🔥 Render AI predictions as DOM elements (like Arrow Layer)
  const renderPredictions = useCallback(() => {
    if (!showPredictions || !chartInstance || aiPredictions.length === 0) {
      return null;
    }

    return aiPredictions.map((prediction, index) => {
      const candle = findCandleAtTimestamp(prediction.timestamp);
      if (!candle) return null;

      const x = timestampToX(prediction.timestamp);
      const baseY = priceToY(candle.high);

      if (x === null || baseY === null) return null;

      // Position AI dot ABOVE the candle
      const y = baseY - 50; // Reduced from 70

      // Calculate price change percentage
      const priceChangePercent =
        ((prediction.predictedPrice - candle.close) / candle.close) * 100;

      // 🔥 SMALLER sizes - reduced by 30%
      let color = '#6B7280';
      let size = 7; // Was 10
      let borderWidth = 1.5; // Was 2
      let label = 'N';

      if (prediction.direction === 'UP') {
        label = 'U';
        if (prediction.confidence > 0.7) {
          color = '#22C55E';
          size = 8; // Was 12
          borderWidth = 2; // Was 3
        } else if (prediction.confidence > 0.5) {
          color = '#86EFAC';
          size = 7.5; // Was 11
          borderWidth = 1.5; // Was 2
        } else {
          color = '#BBF7D0';
          size = 7; // Was 10
          borderWidth = 1; // Was 1
        }
      } else if (prediction.direction === 'DOWN') {
        label = 'D';
        if (prediction.confidence > 0.7) {
          color = '#EF4444';
          size = 8; // Was 12
          borderWidth = 2; // Was 3
        } else if (prediction.confidence > 0.5) {
          color = '#FCA5A5';
          size = 7.5; // Was 11
          borderWidth = 1.5; // Was 2
        } else {
          color = '#FECACA';
          size = 7; // Was 10
          borderWidth = 1; // Was 1
        }
      }

      return (
        <div
          key={`ai-${prediction.timestamp}-${index}-${renderKey}`}
          className="absolute pointer-events-none"
          style={{
            left: `${x}px`,
            top: `${y}px`,
            transform: 'translate(-50%, -50%)',
            transition: 'none',
            willChange: 'transform', // 🔥 Performance hint
          }}
        >
          {/* AI Dot Circle - SMALLER */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
            style={{
              width: `${size * 2}px`,
              height: `${size * 2}px`,
              backgroundColor: color,
              border: `${borderWidth}px solid #FFFFFF`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)', // Lighter shadow
            }}
          >
            <span
              className={`text-white font-bold ${pjs.className}`}
              style={{ fontSize: '8px' }} // Reduced from 10px
            >
              {label}
            </span>
          </div>

          {/* Info Box - SMALLER */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 ${pjs.className}`}
            style={{
              top: `${size + 6}px`, // Reduced gap
            }}
          >
            <div
              className="px-1.5 py-0.5 rounded shadow-sm" // Reduced padding
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: `1px solid ${color}`, // Thinner border
                minWidth: '40px', // Smaller width
              }}
            >
              {/* Price Change */}
              <div
                className="text-center font-bold"
                style={{
                  fontSize: '8px', // Reduced from 9px
                  color: priceChangePercent >= 0 ? '#22C55E' : '#EF4444',
                  lineHeight: '1.2',
                }}
              >
                {priceChangePercent >= 0 ? '+' : ''}
                {priceChangePercent.toFixed(1)}%
              </div>

              {/* Confidence */}
              <div
                className="text-center font-bold"
                style={{
                  fontSize: '7px', // Reduced from 8px
                  color: '#6B7280',
                  lineHeight: '1.2',
                }}
              >
                {(prediction.confidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      );
    });
  }, [
    chartInstance,
    aiPredictions,
    showPredictions,
    timestampToX,
    priceToY,
    findCandleAtTimestamp,
    renderKey,
  ]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 85,
        // 🔥 GPU acceleration hints
        willChange: 'transform',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
    >
      {renderPredictions()}

      {/* AI Count Badge */}
      {/* {showPredictions && aiPredictions.length > 0 && (
        <div
          className={`absolute top-2 right-2 bg-purple-600 text-white px-2 py-1 rounded opacity-90 pointer-events-none shadow-md ${pjs.className}`}
          style={{
            fontSize: '11px',
            fontWeight: 700,
            // 🔥 GPU acceleration for badge
            transform: 'translateZ(0)',
          }}
        >
          AI: {aiPredictions.length} predictions
        </div>
      )} */}
    </div>
  );
}

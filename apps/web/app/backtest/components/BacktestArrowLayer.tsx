// src/components/chart/BacktestArrowLayer.tsx - SMALLER LABELS
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export interface ArrowSignal {
  timestamp: number;
  price: number;
  type: 'BUY' | 'SELL';
  exitReason?: string;
  candleLow?: number;
  candleHigh?: number;
}

interface BacktestArrowLayerProps {
  buySignals: ArrowSignal[];
  sellSignals: ArrowSignal[];
  chartInstance: any;
  drawingsVisible: boolean;
}

export function BacktestArrowLayer({
  buySignals,
  sellSignals,
  chartInstance,
  drawingsVisible,
}: BacktestArrowLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const rafIdRef = useRef<number | null>(null);
  const [renderKey, setRenderKey] = useState(0);

  // 🔥 Optimized dimension update
  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    }
  }, []);

  // 🔥 Schedule re-render using RAF
  const scheduleUpdate = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      setRenderKey((prev) => prev + 1);
      rafIdRef.current = null;
    });
  }, []);

  // Setup resize observer
  useEffect(() => {
    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [updateDimensions]);

  // 🔥 Listen to ALL chart events for smooth updates
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

  const ARROW_OFFSET = 15;
  const LABEL_OFFSET = 6; // Reduced from 8

  const renderArrows = useCallback(() => {
    if (!drawingsVisible || !chartInstance) return null;

    const allSignals: Array<{
      signal: ArrowSignal;
      isBuy: boolean;
    }> = [
      ...buySignals.map((s) => ({ signal: s, isBuy: true })),
      ...sellSignals.map((s) => ({ signal: s, isBuy: false })),
    ];

    return allSignals.map((item, index) => {
      const { signal, isBuy } = item;
      const x = timestampToX(signal.timestamp);

      const exitReason = signal.exitReason;
      const isTakeProfit = exitReason === 'take_profit' || exitReason === 'tp';
      const isStopLoss = exitReason === 'stop_loss' || exitReason === 'sl';
      const isStrategyExit = exitReason === 'strategy';

      let referencePrice: number;

      // Xác định referencePrice
      if (isBuy) {
        // Tín hiệu BUY: đặt mũi tên ở dưới nến
        referencePrice =
          signal.candleLow !== undefined
            ? signal.candleLow
            : signal.price * 0.99;
      } else {
        // Tất cả SELL/EXIT: đặt mũi tên ở trên nến
        referencePrice =
          signal.candleHigh !== undefined
            ? signal.candleHigh
            : signal.price * 1.01;
      }

      const y = priceToY(referencePrice);

      if (x === null || y === null) return null;

      // Determine arrow configuration
      let arrowConfig = {
        pointsUp: true,
        arrowY: 0,
        labelY: 0,
        arrowColor: '',
        textColor: '',
        label: '',
      };

      if (isBuy) {
        // BUY arrow: points up, below candle
        arrowConfig = {
          pointsUp: true,
          arrowY: y + ARROW_OFFSET,
          labelY: y + ARROW_OFFSET + LABEL_OFFSET + 16, // Reduced from 20
          arrowColor: '#22C55E',
          textColor: '#16A34A',
          label: 'BUY',
        };
      } else if (isTakeProfit) {
        // TP: giữ nguyên màu xanh lá đậm
        arrowConfig = {
          pointsUp: false,
          arrowY: y - ARROW_OFFSET - 10,
          labelY: y - ARROW_OFFSET - LABEL_OFFSET - 8, // Reduced from 10
          arrowColor: '#10B981',
          textColor: '#059669',
          label: 'TP',
        };
      } else if (isStopLoss) {
        // SL: giữ nguyên màu đỏ đậm
        const slReferencePrice =
          signal.candleLow !== undefined
            ? signal.candleLow
            : signal.price * 0.99;
        const slY = priceToY(slReferencePrice);

        if (slY === null) return null;

        arrowConfig = {
          pointsUp: true,
          arrowY: slY + ARROW_OFFSET,
          labelY: slY + ARROW_OFFSET + LABEL_OFFSET + 16, // Reduced from 20
          arrowColor: '#DC2626',
          textColor: '#991B1B',
          label: 'SL',
        };
      } else if (isStrategyExit) {
        // EXIT strategy -> SELL màu đỏ
        arrowConfig = {
          pointsUp: false,
          arrowY: y - ARROW_OFFSET - 10,
          labelY: y - ARROW_OFFSET - LABEL_OFFSET - 8, // Reduced from 10
          arrowColor: '#EF4444',
          textColor: '#DC2626',
          label: 'SELL',
        };
      } else {
        // SELL thông thường
        arrowConfig = {
          pointsUp: false,
          arrowY: y - ARROW_OFFSET,
          labelY: y - ARROW_OFFSET - LABEL_OFFSET - 16, // Reduced from 20
          arrowColor: '#EF4444',
          textColor: '#DC2626',
          label: 'SELL',
        };
      }

      return (
        <div
          key={`${signal.timestamp}-${index}-${renderKey}`}
          className="absolute pointer-events-none"
          style={{
            left: `${x}px`,
            top: `${arrowConfig.arrowY}px`,
            transform: 'translate(-50%, -50%)',
            transition: 'none',
          }}
        >
          {/* Arrow Triangle - SMALLER */}
          <svg
            width="12" // Reduced from 16
            height="12" // Reduced from 16
            viewBox="0 0 12 12" // Reduced from 16
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: arrowConfig.pointsUp ? '-6px' : '0px', // Adjusted from -8px
            }}
          >
            {arrowConfig.pointsUp ? (
              <polygon
                points="6,0 0,12 12,12" // Adjusted from 8,0 0,16 16,16
                fill={arrowConfig.arrowColor}
                stroke={arrowConfig.arrowColor}
                strokeWidth="1"
              />
            ) : (
              <polygon
                points="0,0 12,0 6,12" // Adjusted from 0,0 16,0 8,16
                fill={arrowConfig.arrowColor}
                stroke={arrowConfig.arrowColor}
                strokeWidth="1"
              />
            )}
          </svg>

          {/* Label - SMALLER */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap ${pjs.className}`}
            style={{
              top: arrowConfig.pointsUp ? '12px' : '-28px', // Adjusted from 16px/-36px
            }}
          >
            <div
              className="px-1.5 py-0.5 rounded text-[8px] font-bold shadow-sm" // Reduced padding and font
              style={{
                backgroundColor: '#F3F4F6',
                color: arrowConfig.textColor,
                border: `1px solid ${arrowConfig.arrowColor}`,
              }}
            >
              {arrowConfig.label}
            </div>
          </div>
        </div>
      );
    });
  }, [
    drawingsVisible,
    chartInstance,
    buySignals,
    sellSignals,
    timestampToX,
    priceToY,
    renderKey,
  ]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 100 }}
    >
      {renderArrows()}
    </div>
  );
}

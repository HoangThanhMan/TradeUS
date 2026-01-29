// src/components/chart/BacktestArrowLayer.tsx
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
  exitReason?: string; // 'take_profit' | 'stop_loss' | 'strategy' | undefined
  candleLow?: number; // Thêm low của cây nến
  candleHigh?: number; // Thêm high của cây nến
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
  const [, forceUpdate] = useState(0);
  const rafIdRef = useRef<number | null>(null);
  const isUpdatingRef = useRef(false);

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    }
  }, []);

  // Smooth update using RAF
  const scheduleUpdate = useCallback(() => {
    if (isUpdatingRef.current) return;

    isUpdatingRef.current = true;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      forceUpdate((prev) => prev + 1);
      isUpdatingRef.current = false;
      rafIdRef.current = null;
    });
  }, []);

  useEffect(() => {
    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [updateDimensions]);

  // Listen to chart pan/zoom events with smooth updates
  useEffect(() => {
    if (!chartInstance) return;

    try {
      // Subscribe to chart pan and zoom events
      chartInstance.subscribeAction('onScroll', scheduleUpdate);
      chartInstance.subscribeAction('onZoom', scheduleUpdate);
      chartInstance.subscribeAction('onVisibleRangeChange', scheduleUpdate);

      return () => {
        try {
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
          }
          chartInstance.unsubscribeAction('onScroll', scheduleUpdate);
          chartInstance.unsubscribeAction('onZoom', scheduleUpdate);
          chartInstance.unsubscribeAction(
            'onVisibleRangeChange',
            scheduleUpdate,
          );
        } catch (e) {
          console.warn('Failed to unsubscribe chart events:', e);
        }
      };
    } catch (e) {
      console.warn('Failed to subscribe to chart events:', e);
    }
  }, [chartInstance, scheduleUpdate]);

  // Convert price to Y coordinate
  const priceToY = (price: number): number | null => {
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
      console.warn('convertToPixel failed:', e);
      return null;
    }
  };

  // Convert timestamp to X coordinate
  const timestampToX = (timestamp: number): number | null => {
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
      console.warn('convertToPixel failed:', e);
      return null;
    }
  };

  // Calculate arrow offset from candle
  const ARROW_OFFSET = 15; // pixels from candle high/low
  const LABEL_OFFSET = 8; // pixels from arrow

  const renderArrows = () => {
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

      // XÁC ĐỊNH LOẠI SIGNAL VÀ CÁCH XỬ LÝ
      const exitReason = signal.exitReason;
      const isTakeProfit = exitReason === 'take_profit' || exitReason === 'tp';
      const isStopLoss = exitReason === 'stop_loss' || exitReason === 'sl';
      const isStrategyExit = exitReason === 'strategy';

      let referencePrice: number;

      if (isBuy) {
        // BUY: dùng candleLow
        if (signal.candleLow !== undefined) {
          referencePrice = signal.candleLow;
        } else {
          referencePrice = signal.price * 0.99;
        }
      } else {
        // TẤT CẢ CÁC LOẠI SELL đều dùng candleHigh
        // Bao gồm: TP, SL, STRATEGY EXIT, default SELL
        if (signal.candleHigh !== undefined) {
          referencePrice = signal.candleHigh;
        } else {
          referencePrice = signal.price * 1.01;
        }
      }

      const y = priceToY(referencePrice);

      if (x === null || y === null) return null;

      // Xác định arrow config
      let arrowConfig = {
        pointsUp: true,
        arrowY: 0,
        labelY: 0,
        arrowColor: '',
        textColor: '',
        label: '',
      };

      if (isBuy) {
        // BUY: Arrow UP từ dưới lên
        arrowConfig = {
          pointsUp: true,
          arrowY: y + ARROW_OFFSET,
          labelY: y + ARROW_OFFSET + LABEL_OFFSET + 20,
          arrowColor: '#22C55E',
          textColor: '#16A34A',
          label: 'BUY',
        };
      } else if (isTakeProfit) {
        // TAKE PROFIT: Arrow DOWN từ trên xuống
        arrowConfig = {
          pointsUp: false,
          arrowY: y - ARROW_OFFSET - 10,
          labelY: y - ARROW_OFFSET - LABEL_OFFSET - 10,
          arrowColor: '#10B981',
          textColor: '#059669',
          label: 'TP',
        };
      } else if (isStopLoss) {
        // STOP LOSS: Arrow UP từ dưới lên (như BUY)
        // Vị trí: dùng candleLow vì SL là stop loss ở phía dưới
        const slReferencePrice =
          signal.candleLow !== undefined
            ? signal.candleLow
            : signal.price * 0.99;
        const slY = priceToY(slReferencePrice);

        if (slY === null) return null;

        arrowConfig = {
          pointsUp: true,
          arrowY: slY + ARROW_OFFSET,
          labelY: slY + ARROW_OFFSET + LABEL_OFFSET + 20,
          arrowColor: '#DC2626',
          textColor: '#991B1B',
          label: 'SL',
        };
      } else if (isStrategyExit) {
        // STRATEGY EXIT: Arrow UP từ dưới lên (như BUY)
        // Vị trí: dùng candleLow vì strategy exit thường ở dưới
        const exitReferencePrice =
          signal.candleLow !== undefined
            ? signal.candleLow
            : signal.price * 0.99;
        const exitY = priceToY(exitReferencePrice);

        if (exitY === null) return null;

        arrowConfig = {
          pointsUp: false,
          arrowY: exitY - ARROW_OFFSET - 10,
          labelY: exitY - ARROW_OFFSET - LABEL_OFFSET - 10,
          arrowColor: '#F97316',
          textColor: '#EA580C',
          label: 'EXIT',
        };
      } else {
        // Default SELL: Arrow DOWN từ trên xuống
        arrowConfig = {
          pointsUp: false,
          arrowY: y - ARROW_OFFSET,
          labelY: y - ARROW_OFFSET - LABEL_OFFSET - 20,
          arrowColor: '#EF4444',
          textColor: '#DC2626',
          label: 'SELL',
        };
      }

      return (
        <div
          key={`${signal.timestamp}-${index}`}
          className="absolute pointer-events-none transition-all duration-75 ease-out"
          style={{
            left: `${x}px`,
            top: `${arrowConfig.arrowY}px`,
            transform: 'translate(-50%, -50%)',
            willChange: 'left, top',
          }}
        >
          {/* Arrow Triangle */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: arrowConfig.pointsUp ? '-8px' : '0px',
            }}
          >
            {arrowConfig.pointsUp ? (
              <polygon
                points="8,0 0,16 16,16"
                fill={arrowConfig.arrowColor}
                stroke={arrowConfig.arrowColor}
                strokeWidth="1"
              />
            ) : (
              <polygon
                points="0,0 16,0 8,16"
                fill={arrowConfig.arrowColor}
                stroke={arrowConfig.arrowColor}
                strokeWidth="1"
              />
            )}
          </svg>

          {/* Label */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap ${pjs.className}`}
            style={{
              top: arrowConfig.pointsUp
                ? '16px' // Below arrow
                : '-36px', // Above arrow
            }}
          >
            <div
              className="px-2 py-1 rounded text-[10px] font-bold shadow-md"
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
  };

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

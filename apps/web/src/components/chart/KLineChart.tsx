// src/components/chart/KLineChart.tsx
'use client';

import React, {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { init, dispose } from 'klinecharts';
import type {
  CandleType,
  LineType,
  TooltipShowRule,
  TooltipShowType,
  YAxisPosition,
  YAxisType,
} from 'klinecharts';

interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

interface KLineChartProps {
  candles: CandlestickData[];
  symbol: string;
  onVolPaneCreated?: (paneId: string) => void;
  isLocked?: boolean; // 🔥 NEW: Lock prop
}

export const KLineChart = forwardRef<any, KLineChartProps>(function KLineChart(
  { candles, symbol, onVolPaneCreated, isLocked = false },
  ref,
) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const [chartReady, setChartReady] = useState(false);
  const [volVisible, setVolVisible] = useState(true);
  const [showVolSettings, setShowVolSettings] = useState(false);
  const [volPaneId, setVolPaneId] = useState<string | null>(null);
  
  // 🔥 Track data when locked
  const lastDataCountRef = useRef<number>(0);

  useImperativeHandle(ref, () => chartInstance.current, [
    chartInstance.current,
  ]);

  // 🔥 Effect to handle lock state changes
  useEffect(() => {
    if (!chartInstance.current) return;

    console.log('🔒 Lock state changed:', isLocked);
    
    if (isLocked) {
      // When locking: save current data count to prevent new candles from showing
      lastDataCountRef.current = chartInstance.current.getDataList()?.length || 0;
      console.log('💾 Locked at', lastDataCountRef.current, 'candles');
    } else {
      // When unlocking: reset so all data shows
      lastDataCountRef.current = 0;
      console.log('🔓 Unlocked - will show all data');
    }
    
    // Disable/enable scroll and zoom based on lock state
    chartInstance.current.setZoomEnabled(!isLocked);
    chartInstance.current.setScrollEnabled(!isLocked);
  }, [isLocked]);

  useEffect(() => {
    if (!chartRef.current) return;

    console.log('📈 Initializing KLineChart for', symbol);

    if (chartInstance.current) {
      try {
        dispose(chartRef.current);
        chartInstance.current = null;
      } catch (e) {
        console.warn('Could not dispose previous chart:', e);
      }
    }

    try {
      chartInstance.current = init(chartRef.current, {
        styles: {
          candle: {
            type: 'candle_solid' as CandleType,
            bar: {
              upColor: '#0ecb81',
              downColor: '#f6465d',
              upBorderColor: '#0ecb81',
              downBorderColor: '#f6465d',
              upWickColor: '#0ecb81',
              downWickColor: '#f6465d',
              noChangeColor: '#888888',
            },
            priceMark: {
              show: true,
              high: {
                show: true,
                color: '#0ecb81',
              },
              low: {
                show: true,
                color: '#f6465d',
              },
            },
            tooltip: {
              showRule: 'always' as TooltipShowRule,
              showType: 'standard' as TooltipShowType,
              text: {
                size: 12,
                color: '#666666',
              },
            },
          },
          indicator: {
            tooltip: {
              showRule: 'always' as TooltipShowRule,
              showType: 'standard' as TooltipShowType,
              text: {
                size: 12,
                color: '#666666',
              },
            },
            bars: [
              {
                upColor: 'rgba(14, 203, 129, 0.5)',
                downColor: 'rgba(246, 70, 93, 0.5)',
              },
            ],
          },
          grid: {
            horizontal: {
              show: true,
              size: 1,
              color: '#e5e7eb',
              style: 'solid' as LineType,
            },
            vertical: {
              show: false,
            },
          },
          crosshair: {
            horizontal: {
              show: true,
              line: {
                color: '#9ca3af',
                style: 'dashed' as LineType,
              },
              text: {
                show: true,
                color: '#ffffff',
                backgroundColor: '#6b7280',
              },
            },
            vertical: {
              show: true,
              line: {
                color: '#9ca3af',
                style: 'dashed' as LineType,
              },
              text: {
                show: true,
                color: '#ffffff',
                backgroundColor: '#6b7280',
              },
            },
          },
          xAxis: {
            show: true,
            axisLine: {
              show: true,
              color: '#e5e7eb',
            },
            tickLine: {
              show: true,
              color: '#e5e7eb',
            },
            tickText: {
              show: true,
              color: '#6b7280',
              size: 11,
            },
          },
          yAxis: {
            show: true,
            type: 'normal' as YAxisType,
            position: 'right' as YAxisPosition,
            inside: false,
            reverse: false,
            axisLine: {
              show: true,
              color: '#e5e7eb',
            },
            tickLine: {
              show: true,
              color: '#e5e7eb',
            },
            tickText: {
              show: true,
              color: '#6b7280',
              size: 11,
            },
          },
        },
        locale: 'en-US',
      });

      // 🔥 Set initial lock state
      chartInstance.current.setZoomEnabled(!isLocked);
      chartInstance.current.setScrollEnabled(!isLocked);
      chartInstance.current.setBarSpace(12);

      // Create main pane with MA indicators
      chartInstance.current.createIndicator('MA', false, {
        id: 'candle_pane',
      });

      // Create volume pane and save its ID
      const volPane = chartInstance.current.createIndicator('VOL', false, {
        height: 0,
        minHeight: 60,
        maxHeight: 200,
        dragEnabled: false,
      });

      setVolPaneId(volPane);
      onVolPaneCreated?.(volPane);

      setTimeout(() => {
        if (chartInstance.current) {
          chartInstance.current.setPaneOptions({
            id: volPane,
            height: 100,
          });
          chartInstance.current.resize();
        }
      }, 10);
      
      setChartReady(true);
      console.log('✅ Chart instance created successfully');
    } catch (error) {
      console.error('❌ Failed to initialize chart:', error);
    }

    return () => {
      console.log('🧹 Cleaning up chart for', symbol);
      if (chartInstance.current) {
        try {
          if (chartRef.current) {
            dispose(chartRef.current);
          }
          chartInstance.current = null;
          setChartReady(false);
        } catch (error) {
          console.error('Error disposing chart:', error);
        }
      }
    };
  }, [symbol, onVolPaneCreated]);

  useEffect(() => {
    if (chartInstance.current && candles.length > 0) {
      const recentCandles = candles.slice(-1000);

      const formattedData = recentCandles
        .filter((c) => c && c.time && !isNaN(c.open) && !isNaN(c.close))
        .map((c) => ({
          timestamp: c.time,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume || 0),
        }));

      if (formattedData.length === 0) {
        console.error('❌ No valid formatted data!');
        return;
      }

      try {
        const currentDataCount = formattedData.length;
        const lockedDataCount = lastDataCountRef.current;

        // 🔥 When locked: only show candles that existed when we locked
        if (isLocked && lockedDataCount > 0 && currentDataCount > lockedDataCount) {
          console.log('🔒 Chart locked - showing only', lockedDataCount, 'candles (ignoring', currentDataCount - lockedDataCount, 'new candles)');
          
          // Only show the locked number of candles
          const lockedData = formattedData.slice(0, lockedDataCount);
          chartInstance.current.applyNewData(lockedData);
        } else {
          // Normal update when not locked
          console.log('📊 Updating chart with', formattedData.length, 'candles');
          chartInstance.current.applyNewData(formattedData);
        }

        setTimeout(() => {
          if (chartInstance.current) {
            chartInstance.current.resize();
          }
        }, 100);
      } catch (error) {
        console.error('❌ Error updating chart:', error);
      }
    }
  }, [candles, isLocked]);

  useEffect(() => {
    if (!chartRef.current || !chartInstance.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [chartReady]);

  const toggleVolume = () => {
    if (chartInstance.current && volPaneId) {
      const newVisibility = !volVisible;
      chartInstance.current.overrideIndicator({
        name: 'VOL',
        paneId: volPaneId,
        visible: newVisibility,
      });
      setVolVisible(newVisibility);
    }
  };

  const removeVolume = () => {
    if (chartInstance.current && volPaneId) {
      chartInstance.current.removeIndicator(volPaneId);
      setVolPaneId(null);
      setVolVisible(false);
      setShowVolSettings(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white relative overflow-hidden">
      {/* 🔥 NEW: Lock indicator */}
      {isLocked && (
        <div className="absolute top-2 right-2 z-40 bg-yellow-100 border border-yellow-400 text-yellow-800 px-2 py-1 rounded-md flex items-center gap-1 text-xs">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <span>Chart Locked</span>
        </div>
      )}

      {chartReady && volPaneId && (
        <div className="absolute bottom-1 left-0 right-0 z-30 mr-10 flex items-center justify-end px-2 py-0.5 gap-0.5">
          {volVisible ? (
            <>
              <button
                onClick={() => setShowVolSettings(!showVolSettings)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Volume Settings"
              >
                <svg
                  className="w-3.5 h-3.5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>

              <button
                onClick={removeVolume}
                className="p-1 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
                title="Remove Volume"
              >
                <svg
                  className="w-3.5 h-3.5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </>
          ) : (
            <div className="text-xs text-gray-400">Volume hidden</div>
          )}
        </div>
      )}

      {chartReady && !volPaneId && (
        <div className="absolute bottom-1 left-0 right-0 z-30 mr-10 flex items-center justify-end px-2 py-0.5 gap-0.5">
          <button
            onClick={() => {
              if (chartInstance.current) {
                const volPane = chartInstance.current.createIndicator(
                  'VOL',
                  false,
                  {
                    height: 100,
                    minHeight: 60,
                    maxHeight: 2000,
                    dragEnabled: false,
                  },
                );
                setVolPaneId(volPane);
                onVolPaneCreated?.(volPane);
                setVolVisible(true);
              }
            }}
            className="p-1 hover:bg-green-50 hover:text-green-600 rounded transition-colors"
            title="Add Volume"
          >
            <svg
              className="w-3.5 h-3.5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>
      )}

      {showVolSettings && (
        <div className="absolute bottom-10 left-2 z-30 bg-white border border-gray-300 rounded shadow-lg p-3 min-w-[200px]">
          <div className="text-sm font-semibold mb-2 text-gray-700">
            Volume Settings
          </div>
          <div className="text-xs text-gray-500 space-y-1">
            <div>Period 1: 5</div>
            <div>Period 2: 10</div>
            <div>Period 3: 20</div>
            <div className="pt-2 border-t border-gray-200 mt-2">
              <div>Height: 80px</div>
            </div>
          </div>
          <button
            onClick={() => setShowVolSettings(false)}
            className="mt-3 w-full px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs transition-colors"
          >
            Close
          </button>
        </div>
      )}

      {!chartReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-20">
          <div className="text-center">
            <div className="text-gray-600 mb-2">Initializing chart...</div>
            <div className="flex gap-1 justify-center">
              <div
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              ></div>
              <div
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              ></div>
              <div
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {chartReady && candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="text-4xl mb-3">📊</div>
            <div className="text-gray-500">Waiting for candle data...</div>
          </div>
        </div>
      )}

      <div
        ref={chartRef}
        className="w-full h-full"
        style={{
          visibility: chartReady ? 'visible' : 'hidden',
          minHeight: 0,
        }}
      />
    </div>
  );
});

export default KLineChart;

// 🔥 UPDATE ChartInstance.tsx - Add isLocked prop to KLineChart
// In ChartInstance component, change:
// <KLineChart 
//   candles={candles} 
//   symbol={config.symbol}
//   ref={chartInstanceRef}
//   onVolPaneCreated={setVolPaneId}
//   isLocked={drawingState.drawingsLocked} // 🔥 ADD THIS
// />

// 🔥 UPDATE dashboard/page.tsx - Add isLocked prop to KLineChart
// In DashboardPage component, change:
// <KLineChart 
//   candles={candles} 
//   symbol={symbol}
//   ref={chartInstanceRef} 
//   onVolPaneCreated={setVolPaneId}
//   isLocked={drawingState.drawingsLocked} // 🔥 ADD THIS
// />
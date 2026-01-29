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
  chartType?: string;
  onVolPaneCreated?: (paneId: string) => void;
  isLocked?: boolean;
}

export const KLineChart = forwardRef<any, KLineChartProps>(function KLineChart(
  {
    candles,
    symbol,
    chartType = 'candle_solid',
    onVolPaneCreated,
    isLocked = false,
  },
  ref,
) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const [chartReady, setChartReady] = useState(false);
  const [volVisible, setVolVisible] = useState(true);
  const [showVolSettings, setShowVolSettings] = useState(false);
  const [volPaneId, setVolPaneId] = useState<string | null>(null);

  const lastDataCountRef = useRef<number>(0);

  useImperativeHandle(ref, () => chartInstance.current, [
    chartInstance.current,
  ]);

  // 🔥 FIXED: Effect to update chart type with proper line chart handling
  useEffect(() => {
    if (!chartInstance.current || !chartReady) return;

    console.log('🎨 Updating chart type to:', chartType);

    try {
      if (chartType === 'area') {
        // 🔥 Line chart style (like Binance)
        chartInstance.current.setStyles({
          candle: {
            type: 'area' as CandleType,
            area: {
              lineSize: 2,
              lineColor: '#F0B90B', // Yellow like Binance
              value: 'close',
              backgroundColor: 'transparent', // No fill, just line
              smooth: true,
            },
            priceMark: {
              show: false, // Hide high/low marks for line chart
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
        });
      } else if (chartType === 'ohlc') {
        // OHLC bars
        chartInstance.current.setStyles({
          candle: {
            type: 'ohlc' as CandleType,
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
        });
      } else if (chartType === 'area_binance') {
        // Hollow candles
        chartInstance.current.setStyles({
          candle: {
            type: 'area',
            area: {
              value: 'close',
              smooth: true,
              lineSize: 2,
              lineColor: '#F0B90B',
              backgroundColor: 'rgba(240, 185, 11, 0.18)',
            },
            priceMark: { show: false },
            tooltip: {
              showRule: 'always' as TooltipShowRule,
              showType: 'standard' as TooltipShowType,
              text: {
                size: 12,
                color: '#666666',
              },
            },
          },
        });
      } else {
        // Default: candle_solid
        chartInstance.current.setStyles({
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
        });
      }
    } catch (error) {
      console.error('❌ Error updating chart type:', error);
    }
  }, [chartType, chartReady]);

  useEffect(() => {
    if (!chartInstance.current) return;

    console.log('🔒 Lock state changed:', isLocked);

    if (isLocked) {
      lastDataCountRef.current =
        chartInstance.current.getDataList()?.length || 0;
      console.log('💾 Locked at', lastDataCountRef.current, 'candles');
    } else {
      lastDataCountRef.current = 0;
      console.log('🔓 Unlocked - will show all data');
    }

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
            type: chartType as CandleType,
            bar: {
              upColor: '#0ecb81',
              downColor: '#f6465d',
              upBorderColor: '#0ecb81',
              downBorderColor: '#f6465d',
              upWickColor: '#0ecb81',
              downWickColor: '#f6465d',
              noChangeColor: '#888888',
            },
            area: {
              lineSize: 2,
              lineColor: '#F0B90B',
              value: 'close',
              backgroundColor: 'transparent',
              smooth: true,
            },
            priceMark: {
              show: chartType !== 'area', // Hide for line chart
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
              show: true,
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

  // Handle resize when container size changes (e.g., when panel opens/closes)
  useEffect(() => {
    if (!chartRef.current || !chartInstance.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (chartInstance.current && entries[0]) {
        // Debounce resize to avoid too many calls
        requestAnimationFrame(() => {
          try {
            chartInstance.current.resize();
            console.log('📐 Chart resized to fit container');
          } catch (e) {
            console.warn('Could not resize chart:', e);
          }
        });
      }
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [chartReady]);

  useEffect(() => {
    if (chartInstance.current && candles.length > 0) {
      const recentCandles = candles.slice(-1000);

      const formattedData = recentCandles
        .filter((c) => {
          if (!c || !c.time) return false;

          const o = Number(c.open);
          const h = Number(c.high);
          const l = Number(c.low);
          const cl = Number(c.close);

          if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(cl)) return false;
          if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(cl))
            return false;
          if (o <= 0 || h <= 0 || l <= 0 || cl <= 0) return false;

          return true;
        })
        .map((c) => {
          let o = Number(c.open);
          let h = Number(c.high);
          let l = Number(c.low);
          let cl = Number(c.close);
          let v = Math.max(0, Number(c.volume || 0));

          const maxOC = Math.max(o, cl);
          const minOC = Math.min(o, cl);

          if (h < maxOC) {
            h = maxOC;
          }
          if (l > minOC) {
            l = minOC;
          }

          const priceRange = h - l;
          const avgPrice = (o + cl) / 2;
          const MIN_BODY_RATIO = 0.0000012;
          const minBodySize = avgPrice * MIN_BODY_RATIO;
          const currentBodySize = Math.abs(cl - o);

          if (currentBodySize < minBodySize) {
            if (cl >= o) {
              cl = o + minBodySize;
            } else {
              cl = o - minBodySize;
            }
            h = Math.max(h, cl);
            l = Math.min(l, cl);
          }

          if (priceRange > avgPrice * 1.0) {
            console.warn('🔧 Extreme range detected - capping:', {
              time: new Date(c.time).toISOString(),
              oldRange: priceRange.toFixed(2),
              percent: ((priceRange / avgPrice) * 100).toFixed(1) + '%',
            });

            const cappedRange = avgPrice * 0.2;
            h = Math.min(h, avgPrice + cappedRange);
            l = Math.max(l, avgPrice - cappedRange);

            h = Math.max(h, maxOC);
            l = Math.min(l, minOC);
          }

          return {
            timestamp: c.time,
            open: o,
            high: h,
            low: l,
            close: cl,
            volume: v,
          };
        });

      if (formattedData.length === 0) {
        console.error('❌ No valid formatted data!');
        return;
      }

      try {
        const currentDataCount = formattedData.length;
        const lockedDataCount = lastDataCountRef.current;

        if (
          isLocked &&
          lockedDataCount > 0 &&
          currentDataCount > lockedDataCount
        ) {
          console.log(
            '🔒 Chart locked - showing only',
            lockedDataCount,
            'candles',
          );
          const lockedData = formattedData.slice(0, lockedDataCount);
          chartInstance.current.applyNewData(lockedData);
        } else {
          console.log(
            '📊 Updating chart with',
            formattedData.length,
            'candles',
          );
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
      {/* Status bar */}
      <div className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur px-3 py-1.5 rounded shadow-sm text-xs flex items-center gap-3 border border-gray-200">
        {isLocked && (
          <span className="flex items-center gap-1 text-yellow-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Locked
          </span>
        )}
        <span className={`flex items-center gap-1.5 ${candles.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
          <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
          Live
        </span>
        <span className="text-gray-600">
          {candles.length} candles
        </span>
      </div>

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

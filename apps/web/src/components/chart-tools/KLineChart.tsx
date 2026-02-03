// src/components/chart-tools/KLineChart.tsx
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
import {
  ChartSettings,
  applySettings,
  DEFAULT_CHART_SETTINGS,
} from '../../hooks/useChartSettings';

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
  settings?: ChartSettings;
  timezone?: string;
  onVolPaneCreated?: (paneId: string) => void;
  isLocked?: boolean;
}

export const KLineChart = forwardRef<any, KLineChartProps>(function KLineChart(
  {
    candles,
    symbol,
    chartType = 'candle_solid',
    settings = DEFAULT_CHART_SETTINGS,
    timezone = 'Asia/Ho_Chi_Minh',
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

  // ── Apply settings whenever they change ──
  useEffect(() => {
    if (!chartInstance.current || !chartReady) return;
    applySettings(chartInstance.current, settings);
  }, [settings, chartReady]);

  // ── Apply timezone when it changes
  useEffect(() => {
    if (!chartInstance.current || !chartReady) return;
    try {
      chartInstance.current.setTimezone(timezone);
    } catch (e) {
      console.error('Error setting timezone:', e);
    }
  }, [timezone, chartReady]);

  // ── Chart type change ──
  useEffect(() => {
    if (!chartInstance.current || !chartReady) return;
    try {
      if (chartType === 'area') {
        chartInstance.current.setStyles({
          candle: {
            type: 'area' as CandleType,
            area: {
              lineSize: 2,
              lineColor: '#F0B90B',
              value: 'close',
              backgroundColor: 'transparent',
              smooth: true,
            },
            priceMark: { show: false },
            tooltip: {
              showRule: 'always' as TooltipShowRule,
              showType: 'standard' as TooltipShowType,
              text: { size: 12, color: '#666666' },
            },
          },
        });
      } else if (chartType === 'ohlc') {
        chartInstance.current.setStyles({
          candle: {
            type: 'ohlc' as CandleType,
            bar: {
              upColor: settings.candleUpColor,
              downColor: settings.candleDownColor,
              upBorderColor: settings.candleUpColor,
              downBorderColor: settings.candleDownColor,
              upWickColor: settings.candleUpColor,
              downWickColor: settings.candleDownColor,
              noChangeColor: '#888888',
            },
            priceMark: {
              show: settings.showPriceMark,
              high: { show: true, color: settings.candleUpColor },
              low: { show: true, color: settings.candleDownColor },
            },
            tooltip: {
              showRule: 'always' as TooltipShowRule,
              showType: 'standard' as TooltipShowType,
              text: { size: 12, color: '#666666' },
            },
          },
        });
      } else if (chartType === 'area_binance') {
        chartInstance.current.setStyles({
          candle: {
            type: 'area' as CandleType,
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
              text: { size: 12, color: '#666666' },
            },
          },
        });
      } else {
        // candle_solid — re-apply current settings colours
        chartInstance.current.setStyles({
          candle: {
            type: 'candle_solid' as CandleType,
            bar: {
              upColor: settings.candleUpColor,
              downColor: settings.candleDownColor,
              upBorderColor: settings.candleUpColor,
              downBorderColor: settings.candleDownColor,
              upWickColor: settings.candleUpColor,
              downWickColor: settings.candleDownColor,
              noChangeColor: '#888888',
            },
            priceMark: {
              show: settings.showPriceMark,
              high: { show: true, color: settings.candleUpColor },
              low: { show: true, color: settings.candleDownColor },
            },
            tooltip: {
              showRule: 'always' as TooltipShowRule,
              showType: 'standard' as TooltipShowType,
              text: { size: 12, color: '#666666' },
            },
          },
        });
      }
    } catch (e) {
      console.error('❌ Error updating chart type:', e);
    }
  }, [chartType, chartReady, settings]);

  // ── Lock state ──
  useEffect(() => {
    if (!chartInstance.current) return;
    if (isLocked) {
      lastDataCountRef.current =
        chartInstance.current.getDataList()?.length || 0;
    } else {
      lastDataCountRef.current = 0;
    }
    chartInstance.current.setZoomEnabled(!isLocked);
    chartInstance.current.setScrollEnabled(!isLocked);
  }, [isLocked]);

  // ── Init chart ──
  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstance.current) {
      try {
        dispose(chartRef.current);
        chartInstance.current = null;
      } catch (e) {
        /* ignore */
      }
    }

    try {
      chartInstance.current = init(chartRef.current, {
        styles: {
          candle: {
            type: chartType as CandleType,
            bar: {
              upColor: settings.candleUpColor,
              downColor: settings.candleDownColor,
              upBorderColor: settings.candleUpColor,
              downBorderColor: settings.candleDownColor,
              upWickColor: settings.candleUpColor,
              downWickColor: settings.candleDownColor,
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
              show: chartType !== 'area' && settings.showPriceMark,
              high: { show: true, color: settings.candleUpColor },
              low: { show: true, color: settings.candleDownColor },
            },
            tooltip: {
              showRule: 'always' as TooltipShowRule,
              showType: 'standard' as TooltipShowType,
              text: { size: 12, color: '#666666' },
            },
          },
          indicator: {
            tooltip: {
              showRule: 'always' as TooltipShowRule,
              showType: 'standard' as TooltipShowType,
              text: { size: 12, color: '#666666' },
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
              show: settings.showGrid,
              size: 1,
              color: '#e5e7eb',
              style: 'solid' as LineType,
            },
            vertical: { show: settings.showGrid },
          },
          crosshair: {
            horizontal: {
              show: settings.showCrosshair,
              line: { color: '#9ca3af', style: 'dashed' as LineType },
              text: {
                show: true,
                color: '#ffffff',
                backgroundColor: '#6b7280',
              },
            },
            vertical: {
              show: settings.showCrosshair,
              line: { color: '#9ca3af', style: 'dashed' as LineType },
              text: {
                show: true,
                color: '#ffffff',
                backgroundColor: '#6b7280',
              },
            },
          },
          xAxis: {
            show: true,
            axisLine: { show: true, color: '#e5e7eb' },
            tickLine: { show: true, color: '#e5e7eb' },
            tickText: { show: true, color: '#6b7280', size: 11 },
          },
          yAxis: {
            show: true,
            type: 'normal' as YAxisType,
            position: 'right' as YAxisPosition,
            inside: false,
            reverse: false,
            axisLine: { show: true, color: '#e5e7eb' },
            tickLine: { show: true, color: '#e5e7eb' },
            tickText: { show: true, color: '#6b7280', size: 11 },
          },
        },
        locale: 'en-US',
        timezone: timezone,
      });

      chartInstance.current.setZoomEnabled(!isLocked);
      chartInstance.current.setScrollEnabled(!isLocked);
      chartInstance.current.setBarSpace(settings.barSpace);

      chartInstance.current.createIndicator('MA', false, { id: 'candle_pane' });

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
          chartInstance.current.setPaneOptions({ id: volPane, height: 100 });
          chartInstance.current.resize();
        }
      }, 10);

      setChartReady(true);
    } catch (error) {
      console.error('❌ Failed to initialize chart:', error);
    }

    return () => {
      if (chartInstance.current) {
        try {
          if (chartRef.current) dispose(chartRef.current);
          chartInstance.current = null;
          setChartReady(false);
        } catch (e) {
          /* ignore */
        }
      }
    };
  }, [symbol, onVolPaneCreated, timezone]);

  // ── Resize observer ──
  useEffect(() => {
    if (!chartRef.current || !chartInstance.current) return;
    const obs = new ResizeObserver(() => {
      if (chartInstance.current) {
        requestAnimationFrame(() => {
          try {
            chartInstance.current.resize();
          } catch (e) {
            /* ignore */
          }
        });
      }
    });
    obs.observe(chartRef.current);
    return () => obs.disconnect();
  }, [chartReady]);

  // ── Update data ──
  useEffect(() => {
    if (!chartInstance.current || candles.length === 0) return;

    const formatted = candles
      .slice(-1000)
      .filter((c) => {
        if (!c || !c.time) return false;
        const vals = [
          Number(c.open),
          Number(c.high),
          Number(c.low),
          Number(c.close),
        ];
        return vals.every((v) => !isNaN(v) && isFinite(v) && v > 0);
      })
      .map((c) => {
        let o = Number(c.open),
          h = Number(c.high),
          l = Number(c.low),
          cl = Number(c.close);
        const v = Math.max(0, Number(c.volume || 0));
        const maxOC = Math.max(o, cl),
          minOC = Math.min(o, cl);
        if (h < maxOC) h = maxOC;
        if (l > minOC) l = minOC;

        const avg = (o + cl) / 2;
        if (Math.abs(cl - o) < avg * 0.000001) {
          cl = cl >= o ? o + avg * 0.000001 : o - avg * 0.000001;
          h = Math.max(h, cl);
          l = Math.min(l, cl);
        }
        if (h - l > avg * 1.0) {
          const cap = avg * 0.2;
          h = Math.min(h, avg + cap);
          l = Math.max(l, avg - cap);
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

    if (formatted.length === 0) return;

    try {
      if (
        isLocked &&
        lastDataCountRef.current > 0 &&
        formatted.length > lastDataCountRef.current
      ) {
        chartInstance.current.applyNewData(
          formatted.slice(0, lastDataCountRef.current),
        );
      } else {
        chartInstance.current.applyNewData(formatted);
      }
      setTimeout(() => {
        if (chartInstance.current) chartInstance.current.resize();
      }, 100);
    } catch (e) {
      console.error('❌ Error updating chart:', e);
    }
  }, [candles, isLocked]);

  // ── Volume controls ──
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
      {/* Status badge */}
      <div className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur px-3 py-1.5 rounded shadow-sm text-xs flex items-center gap-3 border border-gray-200">
        {isLocked && (
          <span className="flex items-center gap-1 text-yellow-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            Locked
          </span>
        )}
        <span
          className={`flex items-center gap-1.5 ${candles.length > 0 ? 'text-green-600' : 'text-gray-400'}`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          Live
        </span>
        <span className="text-gray-600">{candles.length} candles</span>
      </div>

      {/* Vol controls */}
      {chartReady && volPaneId && (
        <div className="absolute bottom-1 left-0 right-0 z-30 mr-10 flex items-center justify-end px-2 py-0.5 gap-0.5">
          {volVisible ? (
            <>
              <button
                onClick={() => setShowVolSettings(!showVolSettings)}
                className="p-1 hover:bg-gray-100 rounded"
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
                className="p-1 hover:bg-red-50 hover:text-red-600 rounded"
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
        <div className="absolute bottom-1 left-0 right-0 z-30 mr-10 flex items-center justify-end px-2 py-0.5">
          <button
            onClick={() => {
              if (chartInstance.current) {
                const vp = chartInstance.current.createIndicator('VOL', false, {
                  height: 100,
                  minHeight: 60,
                  maxHeight: 2000,
                  dragEnabled: false,
                });
                setVolPaneId(vp);
                onVolPaneCreated?.(vp);
                setVolVisible(true);
              }
            }}
            className="p-1 hover:bg-green-50 hover:text-green-600 rounded"
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
            className="mt-3 w-full px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
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
              />
              <div
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <div
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
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
        style={{ visibility: chartReady ? 'visible' : 'hidden', minHeight: 0 }}
      />
    </div>
  );
});

export default KLineChart;

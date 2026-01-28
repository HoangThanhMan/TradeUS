// src/components/chart/KLineChart.tsx

import React, { useRef, useEffect, useState } from 'react';
import { init, dispose } from 'klinecharts';
import type { CandleType, LineType, TooltipShowRule, TooltipShowType, YAxisPosition, YAxisType } from 'klinecharts';

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
}

export function KLineChart({ candles, symbol }: KLineChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    if (!chartRef.current) return;

    console.log('📈 Initializing KLineChart for', symbol);

    // Clear any existing chart first
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
            },
          },
          yAxis: {
            show: true,
            type: 'normal' as YAxisType,
            position: 'right' as YAxisPosition,
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
            },
          },
        },
        locale: 'en-US',
      });

      // Set zoom and scroll
      chartInstance.current.setZoomEnabled(true);
      chartInstance.current.setScrollEnabled(true);
      chartInstance.current.setBarSpace(8);

      // Create main pane with MA indicators
      chartInstance.current.createIndicator('MA', false, { 
        id: 'candle_pane',
        styles: {
          lines: [
            { 
              color: '#f0b90b',
              size: 1,
            }, // MA7 - yellow
            { 
              color: '#e056fd',
              size: 1,
            }, // MA25 - purple  
            { 
              color: '#2196f3',
              size: 1,
            }, // MA99 - blue
          ],
        },
      });

      // Create volume pane below
      chartInstance.current.createIndicator('VOL', false, {
        height: 120, // Tăng chiều cao volume pane
        minHeight: 100,
        dragEnabled: true,
      });
      
      setChartReady(true);
      console.log('✅ Chart instance created with volume pane');
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
  }, [symbol]);

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
      console.log('📊 Updating chart with', candles.length, 'candles');

      // Validate and transform data
      const formattedData = candles
        .filter(c => c && c.time && !isNaN(c.open) && !isNaN(c.close))
        .map(c => ({
          timestamp: c.time,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume || 0),
        }));

      console.log('📊 Formatted data sample:', {
        first: formattedData[0],
        last: formattedData[formattedData.length - 1],
        count: formattedData.length
      });

      if (formattedData.length === 0) {
        console.error('❌ No valid formatted data!');
        return;
      }

      try {
        console.log('✅ Applying chart data...');
        chartInstance.current.applyNewData(formattedData);
        console.log('✅ Chart data applied successfully');
        
        // Force chart resize to ensure it displays
        // setTimeout(() => {
        //   if (chartInstance.current) {
        //     chartInstance.current.resize();
        //   }
        // }, 100);
      } catch (error) {
        console.error('❌ Error updating chart:', error);
      }
    }
  }, [candles]);

  return (
    <div 
      className="flex-1 bg-white relative flex flex-col overflow-hidden min-w-0" 
      style={{ minHeight: '600px' }}
      key={`chart-${symbol}`}
    >
      {/* Status bar */}
      <div className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur px-3 py-1.5 rounded shadow-sm text-xs flex items-center gap-3 border border-gray-200">
        <span className={`flex items-center gap-1.5 ${candles.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
          <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
          Live
        </span>
        <span className="text-gray-600">
          {candles.length} candles
        </span>
      </div>

      {!chartReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-20">
          <div className="text-center">
            <div className="text-gray-600 mb-2">Initializing chart...</div>
            <div className="flex gap-1 justify-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
        className="flex-1 w-full"
        style={{ 
          minHeight: '100%',
          visibility: chartReady ? 'visible' : 'hidden'
        }}
      />
    </div>
  );
}

export default KLineChart;
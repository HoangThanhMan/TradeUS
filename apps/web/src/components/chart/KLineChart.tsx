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
  const [volVisible, setVolVisible] = useState(true);
  const [showVolSettings, setShowVolSettings] = useState(false);
  const volPaneId = useRef<string | null>(null);

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

      // Set zoom and scroll
      chartInstance.current.setZoomEnabled(true);
      chartInstance.current.setScrollEnabled(true);
      chartInstance.current.setBarSpace(10);

      // Create main pane with MA indicators
      chartInstance.current.createIndicator('MA', false, { 
        id: 'candle_pane',
      });

      // Create volume pane and save its ID
      const volPane = chartInstance.current.createIndicator('VOL', false, {
        height: 80,
        minHeight: 60,
        maxHeight: 120,
        dragEnabled: false,
      });
      
      volPaneId.current = volPane;
      
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
  }, [symbol]);

  useEffect(() => {
    if (chartInstance.current && candles.length > 0) {
      console.log('📊 Updating chart with', candles.length, 'candles');

      // Calculate price range
      const allPrices = candles.flatMap(c => [c.open, c.close, c.high, c.low]);
      const maxPrice = Math.max(...allPrices);
      const minPrice = Math.min(...allPrices);
      const priceRange = maxPrice - minPrice;
      
      // Threshold: 0.2% of visible range
      const threshold = priceRange * 0.002;

      const formattedData = candles
        .filter(c => c && c.time && !isNaN(c.open) && !isNaN(c.close))
        .map(c => {
          const open = Number(c.open);
          const close = Number(c.close);
          const high = Number(c.high);
          const low = Number(c.low);
          
          const bodySize = Math.abs(close - open);
          
          let adjustedClose = close;
          
          // ONLY adjust if candle is smaller than threshold
          if (bodySize < threshold) {
            const avgPrice = (open + close) / 2;
            // Use 0.15% minimum height - balance between visibility and accuracy
            const minHeight = avgPrice * 0.0000024;
            
            if (close >= open) {
              // Bullish
              adjustedClose = open + minHeight;
            } else {
              // Bearish
              adjustedClose = open - minHeight;
            }
          }

          return {
            timestamp: c.time,
            open,
            high: Math.max(high, open, adjustedClose),
            low: Math.min(low, open, adjustedClose),
            close: adjustedClose,
            volume: Number(c.volume || 0),
          };
        });

      if (formattedData.length === 0) {
        console.error('❌ No valid formatted data!');
        return;
      }

      try {
        chartInstance.current.applyNewData(formattedData);
        
        setTimeout(() => {
          if (chartInstance.current) {
            chartInstance.current.resize();
          }
        }, 100);
      } catch (error) {
        console.error('❌ Error updating chart:', error);
      }
    }
  }, [candles]);

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

  // Toggle Volume visibility
  const toggleVolume = () => {
    if (chartInstance.current && volPaneId.current) {
      const newVisibility = !volVisible;
      chartInstance.current.overrideIndicator({
        name: 'VOL',
        paneId: volPaneId.current,
        visible: newVisibility
      });
      setVolVisible(newVisibility);
    }
  };

  // Remove Volume pane
  const removeVolume = () => {
    if (chartInstance.current && volPaneId.current) {
      chartInstance.current.removeIndicator(volPaneId.current);
      volPaneId.current = null;
      setVolVisible(false);
      setShowVolSettings(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white relative overflow-hidden">
      {/* Volume Control Toolbar - positioned on volume pane */}
      {chartReady && (
        <div className="absolute bottom-[-2px] left-0 right-0 z-30 mr-10 flex items-center justify-end px-2 gap-0.5">
          {volPaneId.current && volVisible ? (
            <>             
              {/* Settings button */}
              <button
                onClick={() => setShowVolSettings(!showVolSettings)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Volume Settings"
              >
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* Close button */}
              <button
                onClick={removeVolume}
                className="p-1 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
                title="Remove Volume"
              >
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : (
            <>
              {/* Add Volume button - appears when Volume is removed */}
              <button
                onClick={() => {
                  if (chartInstance.current) {
                    const volPane = chartInstance.current.createIndicator('VOL', false, {
                      height: 80,
                      minHeight: 60,
                      maxHeight: 120,
                      dragEnabled: false,
                    });
                    volPaneId.current = volPane;
                    setVolVisible(true);
                  }
                }}
                className="p-1 hover:bg-green-50 hover:text-green-600 rounded transition-colors">
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* Volume Settings Panel */}
      {showVolSettings && (
        <div className="absolute bottom-10 left-2 z-30 bg-white border border-gray-300 rounded shadow-lg p-3 min-w-[200px]">
          <div className="text-sm font-semibold mb-2 text-gray-700">Volume Settings</div>
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
        className="w-full h-full"
        style={{ 
          visibility: chartReady ? 'visible' : 'hidden',
          minHeight: 0,
        }}
      />
    </div>
  );
}

export default KLineChart;
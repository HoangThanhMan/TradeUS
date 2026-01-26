'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Plus_Jakarta_Sans } from 'next/font/google';

interface IndicatorConfig {
  id: string;
  name: string;
  displayName: string;
  category: 'main' | 'sub';
  enabled: boolean;
}

interface IndicatorManagerProps {
  isOpen: boolean;
  onClose: () => void;
  chartInstance: any;
  volPaneId: string | null;
  symbol: string;
  timeframe: string;
  onIndicatorToggle?: (indicatorId: string, enabled: boolean) => void;
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

const AVAILABLE_INDICATORS: IndicatorConfig[] = [
  // Main Indicators
  {
    id: 'MA',
    name: 'MA',
    displayName: 'MA (Moving Average)',
    category: 'main',
    enabled: true,
  },
  {
    id: 'EMA',
    name: 'EMA',
    displayName: 'EMA (Exponential Moving Average)',
    category: 'main',
    enabled: false,
  },
  {
    id: 'SMA',
    name: 'SMA',
    displayName: 'SMA (Simple Moving Average)',
    category: 'main',
    enabled: false,
  },
  {
    id: 'BOLL',
    name: 'BOLL',
    displayName: 'BOLL (Bollinger Bands)',
    category: 'main',
    enabled: false,
  },
  {
    id: 'SAR',
    name: 'SAR',
    displayName: 'SAR (Stop and Reverse)',
    category: 'main',
    enabled: false,
  },
  {
    id: 'BBI',
    name: 'BBI',
    displayName: 'BBI (Bull And Bear Index)',
    category: 'main',
    enabled: false,
  },

  // Sub Indicators
  {
    id: 'VOL',
    name: 'VOL',
    displayName: 'VOL (Volume)',
    category: 'sub',
    enabled: true,
  },
  {
    id: 'MACD',
    name: 'MACD',
    displayName: 'MACD',
    category: 'sub',
    enabled: false,
  },
  {
    id: 'RSI',
    name: 'RSI',
    displayName: 'RSI',
    category: 'sub',
    enabled: false,
  },
  {
    id: 'KDJ',
    name: 'KDJ',
    displayName: 'KDJ',
    category: 'sub',
    enabled: false,
  },
];

export function IndicatorManager({
  isOpen,
  onClose,
  chartInstance,
  volPaneId,
  symbol,
  timeframe,
  onIndicatorToggle,
}: IndicatorManagerProps) {
  const [indicators, setIndicators] =
    useState<IndicatorConfig[]>(AVAILABLE_INDICATORS);
  const [activePane, setActivePane] = useState<Record<string, string>>({});
  const isFirstMount = useRef(true);
  const lastTimeframe = useRef(timeframe);
  const lastSymbol = useRef(symbol);

  // Reset về MA khi đổi symbol hoặc timeframe
  useEffect(() => {
    if (lastTimeframe.current !== timeframe || lastSymbol.current !== symbol) {
      console.log(`🔄 Timeframe/Symbol changed, resetting to MA`);
      
      // Reset state về MA default
      setIndicators(AVAILABLE_INDICATORS.map(ind => ({
        ...ind,
        enabled: ind.id === 'MA' || ind.id === 'VOL'
      })));
      
      // Reset active panes (chỉ giữ VOL nếu có)
      setActivePane(volPaneId ? { VOL: volPaneId } : {});
      
      lastTimeframe.current = timeframe;
      lastSymbol.current = symbol;
    }
  }, [timeframe, symbol, volPaneId]);

  // Chỉ sync từ chart lần đầu tiên
  useEffect(() => {
    if (!chartInstance || !isFirstMount.current) return;

    const mainIndicators =
      chartInstance.getIndicatorsByPaneId?.('candle_pane') || [];
    const enabledMain = mainIndicators.map((i: any) => i.name);

    setIndicators(prev => prev.map((ind) => {
      if (ind.category === 'main') {
        // Nếu chart có indicator thì dùng từ chart, không thì dùng default
        return {
          ...ind,
          enabled: enabledMain.length > 0 
            ? enabledMain.includes(ind.name)
            : ind.enabled, // Giữ nguyên default (MA = true)
        };
      }
      return ind;
    }));

    isFirstMount.current = false;
  }, [chartInstance]);

  // Sync VOL từ bên ngoài
  useEffect(() => {
    if (volPaneId) {
      setActivePane(prev => ({ ...prev, VOL: volPaneId }));
      setIndicators(prev => 
        prev.map(ind => 
          ind.id === 'VOL' ? { ...ind, enabled: true } : ind
        )
      );
    } else {
      setActivePane(prev => {
        const newState = { ...prev };
        delete newState.VOL;
        return newState;
      });
      setIndicators(prev => 
        prev.map(ind => 
          ind.id === 'VOL' ? { ...ind, enabled: false } : ind
        )
      );
    }
  }, [volPaneId]);

  // Toggle Main Indicator (Radio behavior)
  const toggleMainIndicator = (indicatorId: string) => {
    if (!chartInstance) return;

    const indicator = indicators.find((ind) => ind.id === indicatorId);
    if (!indicator || indicator.enabled) return;

    try {
      // Remove tất cả main indicators khác
      const currentMain = indicators.find(
        (ind) => ind.category === 'main' && ind.enabled,
      );
      if (currentMain && currentMain.id !== indicatorId) {
        chartInstance.removeIndicator('candle_pane', currentMain.name);
        console.log(`❌ Removed ${currentMain.name}`);
      }

      // Add indicator mới
      chartInstance.createIndicator(indicator.name, false, {
        id: 'candle_pane',
      });
      console.log(`✅ Added ${indicator.name}`);

      // Update state
      setIndicators((prev) =>
        prev.map((ind) => {
          if (ind.category === 'main') {
            return { ...ind, enabled: ind.id === indicatorId };
          }
          return ind;
        }),
      );

      onIndicatorToggle?.(indicatorId, true);
    } catch (error) {
      console.error(`Error toggling ${indicator.name}:`, error);
    }
  };

  // Toggle Sub Indicator (Checkbox behavior)
  const toggleSubIndicator = (indicatorId: string) => {
    if (!chartInstance) return;

    const indicator = indicators.find((ind) => ind.id === indicatorId);
    if (!indicator) return;

    const newEnabled = !indicator.enabled;

    try {
      if (newEnabled) {
        const paneId = chartInstance.createIndicator(indicator.name, false, {
          height: 100,
          minHeight: 60,
          dragEnabled: true,
        });
        setActivePane((prev) => ({ ...prev, [indicatorId]: paneId }));
        console.log(`✅ Added ${indicator.name} to sub pane`);
      } else {
        const paneId = activePane[indicatorId];
        if (paneId) {
          chartInstance.removeIndicator(paneId);
          setActivePane((prev) => {
            const newState = { ...prev };
            delete newState[indicatorId];
            return newState;
          });
          console.log(`❌ Removed ${indicator.name}`);
        }
      }

      setIndicators((prev) =>
        prev.map((ind) =>
          ind.id === indicatorId ? { ...ind, enabled: newEnabled } : ind,
        ),
      );

      onIndicatorToggle?.(indicatorId, newEnabled);
    } catch (error) {
      console.error(`Error toggling ${indicator.name}:`, error);
    }
  };

  if (!isOpen) return null;

  const mainIndicators = indicators.filter((ind) => ind.category === 'main');
  const subIndicators = indicators.filter((ind) => ind.category === 'sub');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/5 backdrop-blur-[0.75px] z-40" onClick={onClose} />

      {/* Modal */}
      <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md ${pjs.className}`}>
        <div className="bg-white rounded-lg shadow-2xl border border-gray-300">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Indicator</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 max-h-[500px] overflow-y-auto">
            {/* Main Indicators - RADIO */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Main Indicator
              </h3>
              <div>
                {mainIndicators.map((indicator) => (
                  <label
                    key={indicator.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="main-indicator"
                      checked={indicator.enabled}
                      onChange={() => toggleMainIndicator(indicator.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      {indicator.displayName}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Sub Indicators - CHECKBOX */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Sub Indicator
              </h3>
              <div>
                {subIndicators.map((indicator) => (
                  <label
                    key={indicator.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={indicator.enabled}
                      onChange={() => toggleSubIndicator(indicator.id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      {indicator.displayName}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
// app/backtest/components/StrategyBuilder.tsx - FIXED: Accept conditions from parent
'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  StrategyCondition,
  IndicatorType,
  ConditionAction,
  INDICATOR_METADATA,
  DEFAULT_STRATEGY_CONDITION,
} from '../../../src/types/backtest.types';
import { Plus_Jakarta_Sans } from 'next/font/google';

const INDICATORS: { value: IndicatorType; label: string }[] = [
  { value: 'SMA', label: 'SMA' },
  { value: 'EMA', label: 'EMA' },
  { value: 'Price', label: 'Price' },
  { value: 'RSI', label: 'RSI' },
  { value: 'MACD', label: 'MACD' },
  { value: 'MACD_Signal', label: 'MACD_Signal' },
  { value: 'BB_Upper', label: 'BB_Upper' },
  { value: 'BB_Lower', label: 'BB_Lower' },
  { value: 'BB_Middle', label: 'BB_Middle' },
  { value: 'Volume', label: 'Volume' },
  { value: 'Value', label: 'Value' },
];

const ACTIONS: { value: ConditionAction; label: string }[] = [
  { value: 'cross_above', label: 'Cross Above' },
  { value: 'cross_below', label: 'Cross Below' },
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
  { value: 'equals', label: 'Equals' },
];

const COLOR_PALETTE = [
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EAB308', name: 'Yellow' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#8B5CF6', name: 'Violet' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#EF4444', name: 'Red' },
  { hex: '#06B6D4', name: 'Cyan' },
  { hex: '#84CC16', name: 'Lime' },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#14B8A6', name: 'Teal' },
  { hex: '#F59E0B', name: 'Amber' },
];

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

interface ColorPickerPopupProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

// 🔥 NEW: Props interface
interface StrategyBuilderProps {
  conditions: StrategyCondition[];
  onConditionsChange: (conditions: StrategyCondition[]) => void;
}

function ColorPickerPopup({
  selectedColor,
  onColorChange,
  onClose,
  position,
}: ColorPickerPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className="fixed bg-white rounded-lg shadow-2xl border-2 border-gray-300 p-4 z-50"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <div className="grid grid-cols-6 gap-2 mb-3">
        {COLOR_PALETTE.map((color) => (
          <button
            key={color.hex}
            type="button"
            onClick={() => {
              onColorChange(color.hex);
              onClose();
            }}
            className={`w-10 h-10 rounded-md border-2 transition-all hover:scale-110 ${
              selectedColor === color.hex
                ? 'border-gray-900 scale-110 ring-2 ring-gray-400'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            style={{ backgroundColor: color.hex }}
            title={color.name}
          />
        ))}
      </div>

      <div className="border-t border-gray-200 pt-3">
        <label className="block text-xs font-semibold text-gray-600 mb-2">
          Custom Color:
        </label>
        <input
          type="color"
          value={selectedColor}
          onChange={(e) => {
            onColorChange(e.target.value);
          }}
          className="w-full h-10 rounded-md border-2 border-gray-300 cursor-pointer"
        />
      </div>

      <div className="mt-3 text-xs text-gray-500 text-center">
        Selected:{' '}
        {COLOR_PALETTE.find((c) => c.hex === selectedColor)?.name ||
          selectedColor}
      </div>
    </div>
  );
}

// 🔥 UPDATED: Use props instead of internal state
// 🔥 UPDATED: Use props instead of internal state
export function StrategyBuilder({
  conditions,
  onConditionsChange,
}: StrategyBuilderProps) {
  const [colorPickerState, setColorPickerState] = useState<{
    isOpen: boolean;
    conditionId: string | null;
    indicatorSide: 'indicator1' | 'indicator2' | null;
    position: { top: number; left: number };
  }>({
    isOpen: false,
    conditionId: null,
    indicatorSide: null,
    position: { top: 0, left: 0 },
  });

  const [indicatorColors, setIndicatorColors] = useState<Map<string, string>>(
    new Map(),
  );

  const getIndicatorKey = (type: IndicatorType, params?: number[]): string => {
    if (type === 'Price' || type === 'Volume' || type === 'Value') {
      return type;
    }
    const paramsStr = params ? params.join(',') : '';
    return `${type}(${paramsStr})`;
  };

  // 🔥 NEW: Function to get random color from palette
  const getRandomColor = (excludeColors: string[] = []): string => {
    // Filter out excluded colors
    const availableColors = COLOR_PALETTE.filter(
      (color) => !excludeColors.includes(color.hex),
    );

    // If all colors are excluded, reset
    if (availableColors.length === 0) {
      return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]
        .hex;
    }

    return availableColors[Math.floor(Math.random() * availableColors.length)]
      .hex;
  };

  // 🔥 NEW: Function to get two distinct random colors
  const getTwoDistinctRandomColors = (): { color1: string; color2: string } => {
    const color1 = getRandomColor();

    // Get second color that's different from first
    let color2 = getRandomColor([color1]);

    // Make sure they are distinct (if by chance same, get another)
    if (color2 === color1) {
      color2 = getRandomColor([color1]);
    }

    return { color1, color2 };
  };

  // 🔥 NEW: Initialize indicator colors from conditions when component mounts
  useEffect(() => {
    if (conditions.length === 0) return;

    const newIndicatorColors = new Map<string, string>();
    const usedColors: string[] = [];

    // First, collect all existing colors from conditions
    conditions.forEach((condition) => {
      // Indicator 1
      const ind1Key = getIndicatorKey(
        condition.indicator1,
        condition.indicator1Params,
      );
      if (condition.indicator1Color && !newIndicatorColors.has(ind1Key)) {
        newIndicatorColors.set(ind1Key, condition.indicator1Color);
        usedColors.push(condition.indicator1Color);
      }

      // Indicator 2
      if (typeof condition.indicator2 === 'string') {
        const ind2Key = getIndicatorKey(
          condition.indicator2,
          condition.indicator2Params,
        );
        if (condition.indicator2Color && !newIndicatorColors.has(ind2Key)) {
          newIndicatorColors.set(ind2Key, condition.indicator2Color);
          usedColors.push(condition.indicator2Color);
        }
      }
    });

    // Then assign colors to indicators without colors
    conditions.forEach((condition) => {
      const ind1Key = getIndicatorKey(
        condition.indicator1,
        condition.indicator1Params,
      );
      if (!newIndicatorColors.has(ind1Key)) {
        const color = getRandomColor(usedColors);
        newIndicatorColors.set(ind1Key, color);
        usedColors.push(color);
      }

      if (typeof condition.indicator2 === 'string') {
        const ind2Key = getIndicatorKey(
          condition.indicator2,
          condition.indicator2Params,
        );
        if (!newIndicatorColors.has(ind2Key)) {
          const color = getRandomColor(usedColors);
          newIndicatorColors.set(ind2Key, color);
          usedColors.push(color);
        }
      }
    });

    setIndicatorColors(newIndicatorColors);
  }, [conditions]);

  const syncIndicatorColor = (indicatorKey: string, newColor: string) => {
    setIndicatorColors((prev) => {
      const updated = new Map(prev);
      updated.set(indicatorKey, newColor);
      return updated;
    });

    // 🔥 UPDATED: Use onConditionsChange callback
    onConditionsChange(
      conditions.map((condition) => {
        let updated = { ...condition };

        const ind1Key = getIndicatorKey(
          condition.indicator1,
          condition.indicator1Params,
        );
        if (ind1Key === indicatorKey) {
          updated.indicator1Color = newColor;
        }

        if (typeof condition.indicator2 === 'string') {
          const ind2Key = getIndicatorKey(
            condition.indicator2,
            condition.indicator2Params,
          );
          if (ind2Key === indicatorKey) {
            updated.indicator2Color = newColor;
          }
        }

        return updated;
      }),
    );
  };

  const getIndicatorColor = (
    type: IndicatorType | number, // Allow number
    params?: number[],
  ): string => {
    // Nếu type là number (giá trị tĩnh), không có màu
    if (typeof type === 'number') {
      return '#6B7280'; // Màu xám cho giá trị tĩnh
    }

    const key = getIndicatorKey(type, params);
    const colorFromMap = indicatorColors.get(key);

    // If no color in map, get a random one and save it
    if (!colorFromMap) {
      const usedColors = Array.from(indicatorColors.values());
      const newColor = getRandomColor(usedColors);

      setIndicatorColors((prev) => {
        const updated = new Map(prev);
        updated.set(key, newColor);
        return updated;
      });

      return newColor;
    }

    return colorFromMap;
  };

  const addCondition = () => {
    // 🔥 Get two distinct random colors
    const { color1, color2 } = getTwoDistinctRandomColors();

    const newCondition: StrategyCondition = {
      ...DEFAULT_STRATEGY_CONDITION,
      id: Date.now().toString(),
      logic: 'AND',
      indicator1Color: color1,
      indicator2Color: color2,
    };

    // Save colors to map
    const ind1Key = getIndicatorKey(
      newCondition.indicator1,
      newCondition.indicator1Params,
    );

    // 🔥 FIX: Check if indicator2 is a string (IndicatorType) before calling getIndicatorKey
    let ind2Key: string | undefined;
    if (typeof newCondition.indicator2 === 'string') {
      ind2Key = getIndicatorKey(
        newCondition.indicator2,
        newCondition.indicator2Params,
      );
    }

    setIndicatorColors((prev) => {
      const updated = new Map(prev);
      updated.set(ind1Key, color1);
      if (ind2Key) {
        updated.set(ind2Key, color2);
      }
      return updated;
    });

    onConditionsChange([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    if (conditions.length > 1) {
      // 🔥 UPDATED: Use onConditionsChange callback
      onConditionsChange(conditions.filter((c) => c.id !== id));
    }
  };

  const updateCondition = (id: string, updates: Partial<StrategyCondition>) => {
    onConditionsChange(
      conditions.map((c) => {
        if (c.id === id) {
          const updated = { ...c, ...updates };

          // Nếu indicator2 đổi từ number sang string hoặc ngược lại
          if (updates.indicator2 !== undefined) {
            // Xử lý indicator2Color nếu cần
            if (typeof updates.indicator2 === 'number') {
              // Nếu là number, không cần indicator2Color
              delete updated.indicator2Color;
            }
          }

          return updated;
        }
        return c;
      }),
    );
  };

  const handleColorButtonClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    conditionId: string,
    indicatorSide: 'indicator1' | 'indicator2',
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setColorPickerState({
      isOpen: true,
      conditionId,
      indicatorSide,
      position: {
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX,
      },
    });
  };

  const handleColorChange = (color: string) => {
    if (!colorPickerState.conditionId || !colorPickerState.indicatorSide)
      return;

    const condition = conditions.find(
      (c) => c.id === colorPickerState.conditionId,
    );
    if (!condition) return;

    if (colorPickerState.indicatorSide === 'indicator1') {
      const indicatorKey = getIndicatorKey(
        condition.indicator1,
        condition.indicator1Params,
      );
      syncIndicatorColor(indicatorKey, color);
    } else {
      if (typeof condition.indicator2 === 'string') {
        const indicatorKey = getIndicatorKey(
          condition.indicator2,
          condition.indicator2Params,
        );
        syncIndicatorColor(indicatorKey, color);
      }
    }
  };

  return (
    <div className={`space-y-4 ${pjs.className}`}>
      {conditions.map((condition, index) => {
        const ind1Color = getIndicatorColor(
          condition.indicator1,
          condition.indicator1Params,
        );
        const ind2Color =
          typeof condition.indicator2 === 'string'
            ? getIndicatorColor(
                condition.indicator2,
                condition.indicator2Params,
              )
            : undefined;

        return (
          <div
            key={condition.id}
            className="bg-white border border-gray-300 rounded-lg p-5"
          >
            <div className="grid grid-cols-12 gap-3 items-center">
              {/* Indicator 1 */}
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Indicator 1
                </label>
                <select
                  value={condition.indicator1}
                  onChange={(e) => {
                    const indicator = e.target.value as IndicatorType;
                    const meta = INDICATOR_METADATA[indicator];
                    updateCondition(condition.id, {
                      indicator1: indicator,
                      indicator1Params: meta.requiresParams
                        ? meta.defaultParams
                        : undefined,
                    });
                  }}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                >
                  {INDICATORS.map((ind) => (
                    <option key={ind.value} value={ind.value}>
                      {ind.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Indicator 1 Period */}
              <div className="col-span-1">
                {INDICATOR_METADATA[condition.indicator1]?.requiresParams && (
                  <>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      Period
                    </label>
                    <input
                      type="number"
                      value={condition.indicator1Params?.[0] || 20}
                      onChange={(e) =>
                        updateCondition(condition.id, {
                          indicator1Params: [Number(e.target.value)],
                        })
                      }
                      className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                    />
                  </>
                )}
              </div>

              {/* Indicator 1 Color */}
              <div className="col-span-1">
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Color
                </label>
                <button
                  type="button"
                  onClick={(e) =>
                    handleColorButtonClick(e, condition.id, 'indicator1')
                  }
                  className="w-full h-10 rounded border-2 border-gray-300 hover:border-gray-400 transition-all relative group"
                  style={{ backgroundColor: ind1Color }}
                  title={`Click to change color`}
                >
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 drop-shadow-lg">
                      🎨
                    </span>
                  </div>
                </button>
              </div>

              {/* Action */}
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Action
                </label>
                <select
                  value={condition.action}
                  onChange={(e) =>
                    updateCondition(condition.id, {
                      action: e.target.value as ConditionAction,
                    })
                  }
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                >
                  {ACTIONS.map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Indicator 2 */}
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Indicator 2
                </label>
                <select
                  value={condition.indicator2}
                  onChange={(e) => {
                    const indicator = e.target.value as IndicatorType;
                    const meta = INDICATOR_METADATA[indicator];
                    updateCondition(condition.id, {
                      indicator2: indicator,
                      indicator2Params: meta.requiresParams
                        ? meta.defaultParams
                        : undefined,
                    });
                  }}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                >
                  {INDICATORS.map((ind) => (
                    <option key={ind.value} value={ind.value}>
                      {ind.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Indicator 2 Period */}
              <div className="col-span-1">
                {typeof condition.indicator2 === 'string' &&
                  INDICATOR_METADATA[condition.indicator2]?.requiresParams && (
                    <>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Period
                      </label>
                      <input
                        type="number"
                        value={condition.indicator2Params?.[0] || 20}
                        onChange={(e) =>
                          updateCondition(condition.id, {
                            indicator2Params: [Number(e.target.value)],
                          })
                        }
                        className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                      />
                    </>
                  )}
              </div>

              {/* Indicator 2 Color */}
              <div className="col-span-1">
                {typeof condition.indicator2 === 'string' && (
                  <>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      Color
                    </label>
                    <button
                      type="button"
                      onClick={(e) =>
                        handleColorButtonClick(e, condition.id, 'indicator2')
                      }
                      className="w-full h-10 rounded border-2 border-gray-300 hover:border-gray-400 transition-all relative group"
                      style={{ backgroundColor: ind2Color }}
                      title={`Click to change color`}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 drop-shadow-lg">
                          🎨
                        </span>
                      </div>
                    </button>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="col-span-2 pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={addCondition}
                  className="px-4 py-2 text-black rounded border border-gray-500 hover:bg-gray-200 text-sm font-medium"
                >
                  +
                </button>
                {conditions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCondition(condition.id)}
                    className="px-4 py-2 bg-red-400 text-white rounded hover:bg-red-600 text-sm font-medium"
                  >
                    -
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Add Condition Button */}
      <button
        type="button"
        onClick={addCondition}
        className="w-full mb-5 py-3 border-2 border-dashed border-gray-300 rounded text-gray-600 hover:border-blue-500 hover:text-blue-500 transition-all flex items-center justify-center gap-2 font-medium"
      >
        <svg
          className="w-5 h-5"
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
        Add Condition
      </button>

      {/* Color Picker Popup */}
      {colorPickerState.isOpen && (
        <ColorPickerPopup
          selectedColor={
            colorPickerState.indicatorSide === 'indicator1'
              ? getIndicatorColor(
                  conditions.find((c) => c.id === colorPickerState.conditionId)
                    ?.indicator1 || 'SMA',
                  conditions.find((c) => c.id === colorPickerState.conditionId)
                    ?.indicator1Params,
                )
              : // Chỉ hiển thị color picker nếu indicator2 là string
                typeof conditions.find(
                    (c) => c.id === colorPickerState.conditionId,
                  )?.indicator2 === 'string'
                ? getIndicatorColor(
                    (conditions.find(
                      (c) => c.id === colorPickerState.conditionId,
                    )?.indicator2 as IndicatorType) || 'SMA',
                    conditions.find(
                      (c) => c.id === colorPickerState.conditionId,
                    )?.indicator2Params,
                  )
                : '#6B7280' // Default gray for numbers
          }
          onColorChange={handleColorChange}
          onClose={() =>
            setColorPickerState({ ...colorPickerState, isOpen: false })
          }
          position={colorPickerState.position}
        />
      )}
    </div>
  );
}

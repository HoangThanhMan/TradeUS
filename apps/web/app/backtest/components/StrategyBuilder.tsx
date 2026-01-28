// app/backtest/components/StrategyBuilder.tsx
'use client';

import React, { useState } from 'react';
import {
  StrategyCondition,
  IndicatorType,
  ConditionAction,
  INDICATOR_METADATA,
} from '../../../src/types/backtest.types';
import { Plus_Jakarta_Sans } from 'next/font/google';

// Extended indicator list matching the target UI
const INDICATORS: { value: IndicatorType; label: string }[] = [
  { value: 'SMA', label: 'SMA' },
  { value: 'EMA', label: 'EMA' },
  { value: 'Price', label: 'Price' },
  { value: 'RSI', label: 'RSI' },
  { value: 'MACD', label: 'MACD' },
  { value: 'MACD_Signal', label: 'MACD_' },
  { value: 'BB_Upper', label: 'BB_Upper' },
  { value: 'BB_Lower', label: 'BB_Lower' },
  { value: 'BB_Middle', label: 'BB_Middle' },
  { value: 'Volume', label: 'Keltner_Upper' },
  { value: 'Volume', label: 'Keltner_Lower' },
  { value: 'Volume', label: 'Channel_High' },
  { value: 'Volume', label: 'Channel_Low' },
  { value: 'Volume', label: 'Momentum' },
  { value: 'Volume', label: 'Consecutive_Up' },
  { value: 'Volume', label: 'Consecutive_Down' },
  { value: 'Volume', label: 'Inside_Bar' },
  { value: 'Volume', label: 'Outside_Bar' },
  { value: 'Value', label: 'Value' },
];

const ACTIONS: { value: ConditionAction; label: string }[] = [
  { value: 'cross_above', label: 'Cross Above' },
  { value: 'cross_below', label: 'Cross Below' },
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
  { value: 'equals', label: 'Equals' },
];

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export function StrategyBuilder() {
  const [conditions, setConditions] = useState<StrategyCondition[]>([
    {
      id: '1',
      indicator1: 'SMA',
      indicator1Params: [20],
      action: 'cross_above',
      indicator2: 'SMA',
      indicator2Params: [50],
    },
    {
      id: '2',
      indicator1: 'BB_Lower',
      indicator1Params: [20],
      action: 'above',
      indicator2: 'SMA',
      indicator2Params: [20],
      logic: 'AND',
    },
  ]);

  const addCondition = () => {
    const newCondition: StrategyCondition = {
      id: Date.now().toString(),
      indicator1: 'SMA',
      indicator1Params: [10],
      action: 'cross_above',
      indicator2: 'SMA',
      indicator2Params: [20],
      logic: 'AND',
    };
    setConditions([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((c) => c.id !== id));
    }
  };

  const updateCondition = (id: string, updates: Partial<StrategyCondition>) => {
    setConditions(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  };

  return (
    <div className={`space-y-3 ${pjs.className}`}>
      {/* Conditions List */}
      {conditions.map((condition, index) => (
        <div
          key={condition.id}
          className="bg-white border border-gray-300 rounded p-4"
        >
          <div className="grid grid-cols-12 gap-3 items-end">
            {/* Indicator 1 */}
            <div className="col-span-2">
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
                  <option key={ind.label} value={ind.value}>
                    {ind.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Indicator 1 Params */}
            <div className="col-span-1">
              {INDICATOR_METADATA[condition.indicator1]?.requiresParams && (
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
              )}
            </div>

            {/* Action */}
            <div className="col-span-2">
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
                  <option key={ind.label} value={ind.value}>
                    {ind.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Indicator 2 Params */}
            <div className="col-span-1">
              {typeof condition.indicator2 === 'string' &&
                INDICATOR_METADATA[condition.indicator2]?.requiresParams && (
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
                )}
            </div>

            {/* Color Indicators */}
            <div className="col-span-2 flex gap-2">
              <button className="w-10 h-10 bg-orange-500 rounded border-2 border-orange-600" />
              <button className="w-10 h-10 bg-yellow-400 rounded border-2 border-yellow-500" />
            </div>

            {/* Action Buttons */}
            <div className="col-span-2 flex gap-2 justify-end">
              <button
                onClick={addCondition}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm font-medium"
              >
                +
              </button>
              {conditions.length > 1 && (
                <button
                  onClick={() => removeCondition(condition.id)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm font-medium"
                >
                  -
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Add Condition Button */}
      <button
        onClick={addCondition}
        className="w-full py-3 mb-9 border-2 border-dashed border-gray-300 rounded text-gray-600 hover:border-blue-500 hover:text-blue-500 transition-all flex items-center justify-center gap-2 font-medium"
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
    </div>
  );
}

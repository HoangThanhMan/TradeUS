// app/backtest/components/BacktestConfig.tsx - WITH SPLIT PARTS INPUT
'use client';

import React, { useState } from 'react';
import { BacktestSymbolDropdown } from './BacktestSymbolDropdown';
import {
  STRATEGY_TEMPLATES,
  BacktestConfig as ConfigType,
  StrategyCondition,
  DEFAULT_STRATEGY_CONDITION,
} from '../../../src/types/backtest.types';
import { StrategyBuilder } from './StrategyBuilder';
import { Plus_Jakarta_Sans } from 'next/font/google';
import {
  IconChartLine,
  IconBolt,
  IconTarget,
  IconChartBar,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

interface Props {
  onRun: (config: ConfigType) => void;
  isRunning: boolean;
}

const INTERVALS = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '1h', label: '1 Hour' }, // ⭐ RECOMMENDED
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: 'Daily' },
];

export function BacktestConfig({ onRun, isRunning }: Props) {
  // State
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [startDate, setStartDate] = useState('10/02/2025');
  const [endDate, setEndDate] = useState('10/02/2026');
  const [capital, setCapital] = useState(10000);
  const [lots, setLots] = useState(1);
  const [stopLoss, setStopLoss] = useState(3);
  const [takeProfit, setTakeProfit] = useState(6);
  const [strategyType, setStrategyType] = useState<'template' | 'custom'>(
    'template',
  );
  const [selectedTemplate, setSelectedTemplate] = useState('ma_cross');

  // 🔥 THAY ĐỔI: Dùng state để toggle hiển thị thêm templates
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  const [splitCapital, setSplitCapital] = useState(false);
  const [splitParts, setSplitParts] = useState(2); // 🔥 NEW: Number of parts to split
  const [useAI, setUseAI] = useState(false);

  // 🔥 NEW: Track custom conditions from StrategyBuilder
  const [customConditions, setCustomConditions] = useState<StrategyCondition[]>(
    [
      {
        ...DEFAULT_STRATEGY_CONDITION,
        id: '1',
        indicator1Color: '#F97316',
        indicator2Color: '#3B82F6',
      },
    ],
  );

  // First 6 templates (shown by default)
  const defaultTemplates = STRATEGY_TEMPLATES.slice(0, 6);
  // Additional 7 templates (shown when expanded)
  const additionalTemplates = STRATEGY_TEMPLATES.slice(6);

  // All templates to display based on showAllTemplates state
  const displayedTemplates = showAllTemplates
    ? STRATEGY_TEMPLATES
    : defaultTemplates;

  const handleRun = () => {
    // 🔥 FIX: Get conditions from template OR custom
    let strategyConditions: StrategyCondition[] | undefined;
    let strategyName = 'Custom Strategy';

    if (strategyType === 'template') {
      const template = STRATEGY_TEMPLATES.find(
        (t) => t.id === selectedTemplate,
      );
      if (template) {
        // Deep clone conditions to preserve colors
        strategyConditions = template.conditions.map((c) => ({
          ...c,
          id: c.id || Date.now().toString(),
          indicator1Color: c.indicator1Color || '#F97316',
          indicator2Color: c.indicator2Color || '#3B82F6',
        }));
        strategyName = template.name;
      }
    } else {
      strategyConditions = customConditions;
    }

    const config: ConfigType = {
      symbol,
      interval,
      startDate,
      endDate,
      capital,
      lots,
      stopLoss,
      takeProfit,
      strategy: {
        type: strategyType,
        name: strategyName,
        templateId: strategyType === 'template' ? selectedTemplate : undefined,
        conditions: strategyConditions, // ✅ Pass conditions for BOTH template and custom
      },
      advancedOptions: {
        splitCapital,
        splitParts: splitCapital ? splitParts : undefined,
        useAIPrediction: useAI,
        aiModelId: null,
      },
    };

    console.log('🚀 Running backtest with config:', config);
    console.log('📋 Strategy conditions:', strategyConditions);

    onRun(config);
  };

  return (
    <div className="px-6 py-5 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Top Section - Market Configuration - 3 Groups */}
        <div className="flex gap-10 mb-6">
          {/* Group 1: Symbol & Interval */}
          <div className="flex gap-3">
            {/* Symbol */}
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">
                Symbol:
              </label>
              <BacktestSymbolDropdown
                symbol={symbol}
                onSymbolChange={setSymbol}
              />
            </div>

            {/* Interval */}
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">
                Interval:
              </label>
              <div className="flex flex-row items-center">
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="w-27 appearance-none bg-white border border-gray-300 rounded px-3 py-2 text-left text-[12.5px] text-black font-medium hover:border-gray-400 focus:outline-none focus:border-blue-500 flex items-center justify-between"
                >
                  {INTERVALS.map((int) => (
                    <option key={int.value} value={int.value}>
                      {int.label}
                    </option>
                  ))}
                </select>
                <svg
                  className={`w-4 h-4 ml-[-25] text-gray-500 transition-transform`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="h-12 w-px self-center bg-gray-200" />

          {/* Group 2: Date Range */}
          <div className={`flex gap-2 ${pjs.className}`}>
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">
                From
              </label>
              <input
                type="text"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                className={`w-30 bg-white border border-gray-300 rounded px-3 py-2 text-[12.5px] font-medium text-gray-700 focus:outline-none focus:border-blue-500 ${pjs.className}`}
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">
                To
              </label>
              <input
                type="text"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                className="w-30 bg-white border border-gray-300 rounded px-3 py-2 text-[12.5px] font-medium text-gray-700 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="h-12 w-px self-center bg-gray-300" />

          {/* Group 3: Trading Parameters */}
          <div className={`flex gap-2 ${pjs.className}`}>
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">
                LOTS
              </label>
              <input
                type="number"
                value={lots}
                onChange={(e) => setLots(Number(e.target.value))}
                className="w-20 bg-white border border-gray-300 rounded px-3 py-2 text-[12.5px] font-medium text-gray-700 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">
                SL (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value))}
                className="w-20 bg-white border border-gray-300 rounded px-3 py-2 text-[12.5px] font-medium text-gray-700 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">
                TP (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={takeProfit}
                onChange={(e) => setTakeProfit(Number(e.target.value))}
                className="w-20 bg-white border border-gray-300 rounded px-3 py-2 font-medium text-sm text-gray-700 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">
                CAPITAL
              </label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                className="w-28 bg-white border border-gray-300 rounded px-3 py-2 text-[12.5px] font-medium text-gray-700 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Strategy Section */}
        <div className="border-t border-gray-200 pt-4">
          {/* Strategy Type Tabs */}
          <div className={`flex gap-6 mb-6 ${pjs.className}`}>
            <h3 className="text-lg font-semibold text-gray-900">
              {strategyType === 'template'
                ? 'Strategy Templates'
                : 'Strategy Conditions'}
            </h3>
          </div>

          {strategyType === 'template' ? (
            <>
              {/* Strategy Templates Grid */}
              <div className="grid grid-cols-6 gap-3 mb-4">
                {displayedTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`relative p-3 rounded border text-left flex flex-col items-start transition-all ${
                      selectedTemplate === template.id
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/30'
                        : 'border-gray-300 bg-white hover:border-gray-400 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {template.category === 'trend' && (
                        <IconChartLine size={21} className="text-blue-600" />
                      )}
                      {template.category === 'momentum' && (
                        <IconBolt size={21} className="text-purple-600" />
                      )}
                      {template.category === 'volatility' && (
                        <IconTarget size={21} className="text-yellow-600" />
                      )}
                      {template.category === 'volume' && (
                        <IconChartBar size={21} className="text-green-600" />
                      )}
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          template.category === 'trend'
                            ? 'bg-blue-100 text-blue-700'
                            : template.category === 'momentum'
                              ? 'bg-purple-100 text-purple-700'
                              : template.category === 'volatility'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {template.category}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 mb-1">
                      {template.name}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {template.description}
                    </p>
                  </button>
                ))}

                {/* Show More/Less Button - Chỉ hiển thị nếu chưa hiển thị tất cả */}
                {!showAllTemplates && (
                  <button
                    onClick={() => setShowAllTemplates(true)}
                    className="p-3 rounded border-2 border-dashed border-gray-300 text-center text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-all flex flex-col items-center justify-center"
                  >
                    <IconChevronDown size={24} className="mb-1" />
                    <div className="text-xs">
                      More Templates
                      <br />({additionalTemplates.length} more)
                    </div>
                  </button>
                )}
              </div>

              {/* Show Less Button - Hiển thị khi đang show all */}
              {showAllTemplates && (
                <div className="flex justify-center mb-4">
                  <button
                    onClick={() => setShowAllTemplates(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <IconChevronUp size={16} />
                    Show Less Templates
                  </button>
                </div>
              )}
            </>
          ) : (
            // 🔥 CRITICAL: Pass conditions state to StrategyBuilder
            <StrategyBuilder
              conditions={customConditions}
              onConditionsChange={setCustomConditions}
            />
          )}

          {/* Tab Buttons - Moved to bottom */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setStrategyType('template')}
              className={`flex-1 px-4 py-2 rounded font-medium transition-all ${
                strategyType === 'template'
                  ? 'bg-yellow-400 text-gray-900'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Strategy Templates
            </button>
            <button
              onClick={() => setStrategyType('custom')}
              className={`flex-1 px-4 py-2 rounded font-medium transition-all ${
                strategyType === 'custom'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Advanced Options */}
          <div className={`mb-6 ${pjs.className}`}>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Advanced Options
            </h4>
            <div className="space-y-2">
              {/* 🔥 UPDATED: Split Capital with number input */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={splitCapital}
                    onChange={(e) => setSplitCapital(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Split capital
                </label>
                {splitCapital && (
                  <span className="text-sm text-gray-700">into</span>
                )}
                {splitCapital && (
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={splitParts}
                    onChange={(e) => setSplitParts(Number(e.target.value))}
                    className="w-16 bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:border-blue-500"
                  />
                )}
                {splitCapital && (
                  <span className="text-sm text-gray-700">parts</span>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={useAI}
                  onChange={(e) => setUseAI(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Only enter when AI predicts cross up
              </label>
            </div>
          </div>

          {/* Apply Strategy Button */}
          <div className="flex justify-end">
            <button
              onClick={handleRun}
              disabled={isRunning}
              className={`px-8 py-2.5 text-[12px] rounded font-semibold transition-all ${
                isRunning
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-gray-800'
              }`}
            >
              {isRunning ? 'Running...' : 'Apply Strategy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

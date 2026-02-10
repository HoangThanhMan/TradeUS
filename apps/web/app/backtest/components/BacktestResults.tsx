// app/backtest/components/BacktestResults.tsx - UPDATED AI LEGEND
'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  BacktestResult,
  AIPrediction,
} from '../../../src/types/backtest.types';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { KLineChart } from '../../../src/components/chart-tools/KLineChart';
import { BacktestArrowLayer } from './BacktestArrowLayer';
import { BacktestIndicatorLayer } from './BacktestIndicatorLayer';
import { BacktestAILayer } from './BacktestAILayer';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

interface Props {
  result: BacktestResult | null;
  isLoading: boolean;
}

export function BacktestResults({ result, isLoading }: Props) {
  const chartInstanceRef = useRef<any>(null);
  const [volPaneId, setVolPaneId] = useState<string | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [showAIPredictions, setShowAIPredictions] = useState(
    result?.config.advancedOptions.useAIPrediction || false,
  );

  const handleChartRef = useCallback((chartInstance: any) => {
    if (chartInstance) {
      chartInstanceRef.current = chartInstance;

      try {
        chartInstance.removeIndicator('candle_pane', 'MA');
        chartInstance.removeIndicator(volPaneId);
      } catch (e) {
        console.warn('Could not remove MA:', e);
      }

      setChartReady(true);
    }
  }, []);

  const aiPredictions = React.useMemo(() => {
    if (!result || !result.aiPredictions || result.aiPredictions.length === 0) {
      console.log('⚠️ No AI predictions in result:', {
        hasResult: !!result,
        hasAIPredictions: !!result?.aiPredictions,
        count: result?.aiPredictions?.length || 0,
      });
      return [];
    }

    // 🔥 Return ALL AI predictions without filtering
    console.log('📊 Total AI predictions:', result.aiPredictions.length);
    console.log('📋 Sample predictions:', result.aiPredictions.slice(0, 3));
    return result.aiPredictions;
  }, [result]);

  useEffect(() => {
    console.log('🔍 BacktestResults AI Debug:', {
      useAIPrediction: result?.config.advancedOptions.useAIPrediction,
      showAIPredictions,
      hasResult: !!result,
      aiPredictionsCount: aiPredictions.length,
      chartReady,
    });
  }, [result, showAIPredictions, aiPredictions, chartReady]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px] bg-white rounded-lg">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h3 className="text-xl text-gray-700 font-semibold mb-2">
            Running Backtest...
          </h3>
          <p className="text-gray-500 text-sm">
            Analyzing historical data and executing strategy
          </p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center min-h-[600px] bg-white rounded-lg">
        <div className="text-center">
          <h3 className="text-xl text-gray-700 font-semibold mb-2">
            No Results Yet
          </h3>
          <p className="text-gray-500 text-sm">
            Configure your strategy and run a backtest
          </p>
        </div>
      </div>
    );
  }

  const summary = result.summary;
  const isProfit = summary.totalPnL > 0;

  const chartCandles = result.chartData.candles.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    quoteVolume: c.volume * c.close,
  }));

  const buyArrows = result.chartData.buySignals.map((s) => ({
    timestamp: s.timestamp,
    price: s.price,
    type: 'BUY' as const,
    candleLow: s.candleLow,
    candleHigh: s.candleHigh,
  }));

  const sellArrows = result.chartData.sellSignals.map((s) => ({
    timestamp: s.timestamp,
    price: s.price,
    type: 'SELL' as const,
    exitReason: s.reason,
    candleLow: s.candleLow,
    candleHigh: s.candleHigh,
  }));

  const strategyConditions = result.config.strategy.conditions || [];

  const allTrades = [...result.trades].sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  const legendIndicators = (() => {
    const indicatorsMap = new Map<string, { label: string; color: string }>();

    strategyConditions.forEach((cond) => {
      if (
        cond.indicator1 === 'SMA' ||
        cond.indicator1 === 'EMA' ||
        cond.indicator1 === 'BB_Upper' ||
        cond.indicator1 === 'BB_Middle' ||
        cond.indicator1 === 'BB_Lower'
      ) {
        const period = cond.indicator1Params?.[0];
        const key = `${cond.indicator1}_${period || ''}`;
        const label = `${cond.indicator1}(${period || ''})`;
        if (!indicatorsMap.has(key)) {
          indicatorsMap.set(key, {
            label,
            color: cond.indicator1Color || '#F97316',
          });
        }
      }

      if (
        typeof cond.indicator2 === 'string' &&
        (cond.indicator2 === 'SMA' ||
          cond.indicator2 === 'EMA' ||
          cond.indicator2 === 'BB_Upper' ||
          cond.indicator2 === 'BB_Middle' ||
          cond.indicator2 === 'BB_Lower')
      ) {
        const period = cond.indicator2Params?.[0];
        const key = `${cond.indicator2}_${period || ''}`;
        const label = `${cond.indicator2}(${period || ''})`;
        if (!indicatorsMap.has(key)) {
          indicatorsMap.set(key, {
            label,
            color: cond.indicator2Color || '#3B82F6',
          });
        }
      }
    });

    return Array.from(indicatorsMap.values());
  })();

  return (
    <div className={`bg-white rounded-lg ${pjs.className}`}>
      {/* Top Section: Chart Info Bar */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Backtest Chart - {result.config.symbol} ({result.config.interval})
            </h2>
            <div className="flex items-center gap-6 mt-1 text-xs text-gray-600">
              <span>
                Period: {result.config.startDate} to {result.config.endDate}
              </span>
              <span>Candles: {chartCandles.length}</span>
              <span>Strategy: {result.config.strategy.name}</span>
              <span>Capital: ${result.config.capital.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {result.config.advancedOptions.useAIPrediction && (
              <button
                onClick={() => setShowAIPredictions(!showAIPredictions)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-bold transition-all ${
                  showAIPredictions
                    ? 'bg-purple-50 border-purple-200 text-purple-700'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full ${showAIPredictions ? 'bg-purple-500' : 'bg-gray-400'}`}
                ></div>
                <span>AI ({aiPredictions.length})</span>
              </button>
            )}

            <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-md border border-green-200">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-xs font-bold text-green-700">
                BUY: {result.chartData.buySignals.length}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-md border border-red-200">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-xs font-bold text-red-700">
                SELL: {result.chartData.sellSignals.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="bg-white p-4" style={{ height: '500px' }}>
        <div className="h-full rounded relative bg-gray-50">
          {chartCandles.length > 0 ? (
            <>
              <KLineChart
                candles={chartCandles}
                symbol={result.config.symbol}
                chartType="candle_solid"
                ref={handleChartRef}
                onVolPaneCreated={setVolPaneId}
                isLocked={false}
              />

              {chartReady && result.indicators && (
                <BacktestIndicatorLayer
                  chartInstance={chartInstanceRef.current}
                  conditions={strategyConditions}
                  indicators={result.indicators}
                  candles={result.chartData.candles}
                />
              )}

              {chartReady && result.config.advancedOptions.useAIPrediction && (
                <BacktestAILayer
                  chartInstance={chartInstanceRef.current}
                  aiPredictions={aiPredictions}
                  candles={result.chartData.candles}
                  showPredictions={showAIPredictions}
                />
              )}

              {chartReady && (
                <BacktestArrowLayer
                  buySignals={buyArrows}
                  sellSignals={sellArrows}
                  chartInstance={chartInstanceRef.current}
                  drawingsVisible={true}
                />
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3">📈</div>
                <p className="text-gray-400 text-sm">No chart data available</p>
              </div>
            </div>
          )}

          {/* 🔥 IMPROVED LEGEND WITH DETAILED AI EXPLANATION */}
          <div className="absolute bottom-[-40] left-1/2 transform -translate-x-1/2 bg-white/95 px-4 py-2.5 rounded-lg shadow-lg z-[100] border border-gray-200">
            <div className="flex items-center gap-4 text-xs">
              {/* Trade Signal Legends */}
              <div className="flex items-center gap-1.5">
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-green-500"></div>
                <span className="text-gray-700 font-semibold">BUY</span>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-red-500"></div>
                <span className="text-gray-700 font-semibold">SELL</span>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-emerald-500"></div>
                <span className="text-gray-700 font-semibold">TP</span>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-red-600"></div>
                <span className="text-gray-700 font-semibold">SL</span>
              </div>

              {/* 🔥 IMPROVED: AI Prediction Legend - Shows all types with detailed info */}
              {result.config.advancedOptions.useAIPrediction &&
                showAIPredictions && (
                  <>
                    <div className="border-l border-gray-300 h-4"></div>
                    <div className="flex items-center gap-3">

                      {/* UP Prediction */}
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="w-6 h-6 rounded-full bg-green-500 border-2 border-white shadow flex items-center justify-center">
                          <span className="text-white text-[9px] font-bold">
                            U
                          </span>
                        </div>
                        <span className="text-[8px] text-gray-700 font-semibold">
                          UP
                        </span>
                        <span className="text-[7px] text-green-600">
                          ✓ Entry
                        </span>
                      </div>

                      {/* NEUTRAL Prediction */}
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="w-6 h-6 rounded-full bg-gray-500 border-2 border-white shadow flex items-center justify-center">
                          <span className="text-white text-[9px] font-bold">
                            N
                          </span>
                        </div>
                        <span className="text-[8px] text-gray-700 font-semibold">
                          NEUTRAL
                        </span>
                        <span className="text-[7px] text-gray-600">
                          ✓ Entry
                        </span>
                      </div>

                      {/* DOWN Prediction */}
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="w-6 h-6 rounded-full bg-red-500 border-2 border-white shadow flex items-center justify-center">
                          <span className="text-white text-[9px] font-bold">
                            D
                          </span>
                        </div>
                        <span className="text-[8px] text-gray-700 font-semibold">
                          DOWN
                        </span>
                        <span className="text-[7px] text-red-600">
                          ✗ Blocked
                        </span>
                      </div>
                    </div>
                  </>
                )}

              {/* Indicator Legends */}
              {legendIndicators.length > 0 && (
                <>
                  <div className="border-l border-gray-300 h-4"></div>
                  {legendIndicators.map((ind, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <div
                        className="w-8 h-0.5 rounded"
                        style={{ backgroundColor: ind.color }}
                      ></div>
                      <span className="text-gray-700 text-[10px] font-semibold">
                        {ind.label}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Results */}
      <div className="border-t mt-8 border-gray-200 bg-gray-50 rounded-b-lg">
        <div className="p-4">
          <div className="grid grid-cols-[1fr_2fr] gap-4">
            {/* Left Column: Summary Stats */}
            <div
              className={`space-y-4 p-5 bg-white border border-gray-200 rounded-md ${pjs.className}`}
            >
              <h3
                className={`text-[16px] text-black mb-3 font-bold ${pjs.className}`}
              >
                Results
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-0.5">
                      Trades:
                    </div>
                    <div className="text-[14px] font-bold text-gray-900">
                      {summary.totalTrades}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-0.5">
                      Win Rate:
                    </div>
                    <div className="text-[14px] font-bold text-blue-600">
                      {summary.winRate.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-gray-200">
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-0.5">
                      Wins:
                    </div>
                    <div className="text-[14px] font-bold text-green-600">
                      {summary.winningTrades}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-0.5">
                      Losses:
                    </div>
                    <div className="text-[14px] font-bold text-red-600">
                      {summary.losingTrades}
                    </div>
                  </div>
                </div>

                <div
                  className={`${isProfit ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border rounded p-3`}
                >
                  <div
                    className={`text-xs ${isProfit ? 'text-green-700' : 'text-red-700'} mb-1`}
                  >
                    Total PnL:
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div
                      className={`text-[20px] font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {isProfit ? '+' : ''}
                      {summary.totalPnL.toFixed(2)} $
                    </div>
                    <div
                      className={`text-[14px] font-semibold ${isProfit ? 'text-green-600' : 'text-red-600'}`}
                    >
                      ({isProfit ? '+' : ''}
                      {summary.totalPnLPercent.toFixed(2)}%)
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Profit Factor:</span>
                      <span className="ml-1 font-semibold text-gray-900">
                        {summary.profitFactor.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Max DD:</span>
                      <span className="ml-1 font-semibold text-red-600">
                        {summary.maxDrawdown.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* 🔥 NEW: AI Stats Section */}
                {result.config.advancedOptions.useAIPrediction &&
                  aiPredictions.length > 0 && (
                    <div className="pt-3 border-t border-gray-200">
                      <div className="text-xs font-semibold text-purple-700 mb-2">
                        AI Prediction Stats:
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div className="text-center">
                          <div className="text-green-600 font-bold">
                            {
                              aiPredictions.filter((p) => p.direction === 'UP')
                                .length
                            }
                          </div>
                          <div className="text-gray-500">UP</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-600 font-bold">
                            {
                              aiPredictions.filter(
                                (p) => p.direction === 'NEUTRAL',
                              ).length
                            }
                          </div>
                          <div className="text-gray-500">NEUTRAL</div>
                        </div>
                        <div className="text-center">
                          <div className="text-red-600 font-bold">
                            {
                              aiPredictions.filter(
                                (p) => p.direction === 'DOWN',
                              ).length
                            }
                          </div>
                          <div className="text-gray-500">DOWN</div>
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] text-gray-600 text-center">
                        Blocked:{' '}
                        {
                          aiPredictions.filter((p) => p.direction === 'DOWN')
                            .length
                        }{' '}
                        entries
                      </div>
                    </div>
                  )}
              </div>
            </div>

            {/* Right Column: Trade History Table */}
            <div className="bg-white border border-gray-200 rounded-md">
              <h3
                className={`text-[16px] text-black mb-3 font-bold pt-5 pl-5 ${pjs.className}`}
              >
                Trade History (All Trades)
              </h3>
              <div className="overflow-auto px-5 max-h-[280px]">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">
                        #
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">
                        Type
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">
                        Date
                      </th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">
                        Price
                      </th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">
                        P&L
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTrades.map((trade, i) => {
                      let relatedTrade = null;
                      if (trade.type === 'SELL') {
                        relatedTrade = result.trades.find(
                          (t) =>
                            t.type === 'BUY' &&
                            t.timestamp < trade.timestamp &&
                            t.id !== trade.id,
                        );
                      }

                      let badgeClass = '';
                      let badgeText = '';

                      if (trade.type === 'BUY') {
                        badgeClass =
                          'bg-green-100 text-green-700 border border-green-200';
                        badgeText = 'BUY';
                      } else if (trade.exitReason === 'take_profit') {
                        badgeClass =
                          'bg-emerald-100 text-emerald-700 border border-emerald-200';
                        badgeText = 'TP';
                      } else if (trade.exitReason === 'stop_loss') {
                        badgeClass =
                          'bg-red-100 text-red-700 border border-red-200';
                        badgeText = 'SL';
                      } else if (trade.exitReason === 'strategy') {
                        badgeClass =
                          'bg-orange-100 text-orange-700 border border-orange-200';
                        badgeText = 'EXIT';
                      } else if (trade.exitReason === 'end_of_test') {
                        badgeClass =
                          'bg-gray-100 text-gray-600 border border-gray-200';
                        badgeText = 'END';
                      } else {
                        badgeClass =
                          'bg-red-50 text-red-600 border border-red-200';
                        badgeText = 'SELL';
                      }

                      let reasonText = '';
                      if (trade.type === 'BUY') {
                        reasonText = trade.reason || 'Entry Signal';
                      } else if (trade.exitReason === 'take_profit') {
                        reasonText = `Take Profit Hit (+${result.config.takeProfit}%)`;
                      } else if (trade.exitReason === 'stop_loss') {
                        reasonText = `Stop Loss Hit (-${result.config.stopLoss}%)`;
                      } else if (trade.exitReason === 'strategy') {
                        reasonText = 'MA Cross Exit Signal';
                      } else if (trade.exitReason === 'end_of_test') {
                        reasonText = 'End of Test Period';
                      } else {
                        reasonText = trade.reason || 'Exit Signal';
                      }

                      const showPnl =
                        trade.type === 'SELL' && trade.pnl !== undefined;

                      return (
                        <tr
                          key={`${trade.id}-${i}`}
                          className={`border-b border-gray-100 hover:bg-gray-50 ${
                            trade.type === 'BUY' ? 'bg-green-50/30' : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-gray-400 text-[10px]">
                            {i + 1}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2.5 py-1 rounded text-[10px] font-bold ${badgeClass}`}
                            >
                              {badgeText}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-600">
                            {new Date(trade.timestamp).toLocaleDateString()}
                            <div className="text-[9px] text-gray-400">
                              {new Date(trade.timestamp).toLocaleTimeString(
                                [],
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                },
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right text-gray-900">
                            ${trade.price.toFixed(2)}
                            {relatedTrade && (
                              <div className="text-[9px] text-gray-500">
                                Entry: ${relatedTrade.price.toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-semibold ${
                              showPnl && trade.pnl! > 0
                                ? 'text-green-600'
                                : showPnl && trade.pnl! <= 0
                                  ? 'text-red-600'
                                  : 'text-gray-400'
                            }`}
                          >
                            {showPnl ? (
                              <>
                                {trade.pnl! > 0 ? '+' : ''}$
                                {trade.pnl!.toFixed(2)}
                                <span className="text-[10px] ml-1">
                                  (
                                  {trade.pnlPercent && trade.pnlPercent > 0
                                    ? '+'
                                    : ''}
                                  {trade.pnlPercent?.toFixed(2)}%)
                                </span>
                              </>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-500 text-[10px]">
                            {reasonText}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

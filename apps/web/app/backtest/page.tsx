// app/backtest/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { Header } from '../../src/components/page/Header';
import { BacktestConfig as BacktestConfigComponent } from './components/BacktestConfig';
import { BacktestResults } from './components/BacktestResults';
import { BacktestResult } from '../../src/types/backtest.types';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { IconChartCovariate } from '@tabler/icons-react';
import { BacktestEngine } from '../../src/utils/backtestEngine';
import type { BacktestConfig } from '../../src/types/backtest.types';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const WS_URL = 'http://localhost:3002/prices';

export default function BacktestPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const { status } = useWebSocket(WS_URL);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  const handleRunBacktest = async (config: BacktestConfig) => {
    setIsRunning(true);
    setResult(null);

    try {
      console.log('🚀 Starting backtest with config:', config);

      // Execute backtest with real historical data
      const backtestResult =
        await BacktestEngine.executeWithHistoricalData(config);

      console.log('✅ Backtest completed:', backtestResult);
      setResult(backtestResult);
    } catch (error) {
      console.error('❌ Backtest failed:', error);

      // Show error notification
      alert(
        `Backtest failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setIsRunning(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col bg-white ${pjs.className}`}>
      <Header status={status} />

      {/* Page Header */}
      <div className="border-b border-gray-200 bg-white px-36 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconChartCovariate
              size={40}
              stroke={2}
              className="text-black flex-shrink-0"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Backtest Analysis
              </h1>
              <p className="text-xs text-gray-500">
                Advanced strategy backtesting with real historical data
              </p>
            </div>
          </div>

          {result && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${result.summary.totalPnL > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                ></div>
                <span className="text-gray-600">
                  {result.summary.totalTrades} trades
                </span>
              </div>
              <div
                className={`font-bold ${result.summary.totalPnL > 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {result.summary.totalPnL > 0 ? '+' : ''}
                {result.summary.totalPnL.toFixed(2)} USDT
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Scrollable container */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {/* Config Section */}
        <div>
          <BacktestConfigComponent
            onRun={handleRunBacktest}
            isRunning={isRunning}
          />
        </div>

        {/* Results Section */}
        <div>
          <BacktestResults result={result} isLoading={isRunning} />
        </div>
      </div>
    </div>
  );
}

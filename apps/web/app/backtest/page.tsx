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
import { VipStatus } from '@tradex/shared-types';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002/prices';
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export default function BacktestPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const { status } = useWebSocket(WS_URL);

  useEffect(() => {
    const checkVipAccess = async () => {
      const token =
        localStorage.getItem('accessToken') || localStorage.getItem('token');

      if (!token) {
        router.push('/auth');
        return;
      }

      try {
        const response = await fetch(`${API_URL}/users/profile`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }

        const user = await response.json();

        if (user.vipStatus === VipStatus.ACTIVE || user.role === 'admin') {
          setIsAuthenticated(true);
        } else {
          console.warn('User is not VIP, redirecting...');
          router.push('/vip-register');
        }
      } catch (err) {
        console.error('Error checking VIP status:', err);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('token');
        router.push('/auth');
      } finally {
        setIsLoading(false);
      }
    };

    // checkVipAccess();
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

  if (isLoading || !isAuthenticated) {
    return (
      <div
        className={`min-h-screen bg-white flex flex-col items-center justify-center ${pjs.className}`}
      >
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
        <div className="text-gray-600 font-medium">
          Verifying VIP Membership...
        </div>
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

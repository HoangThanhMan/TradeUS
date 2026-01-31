// app/multi-timeframe/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { Header } from '../../src/components/page/Header';
import { MultiTimeframeContainer } from './components/MultiTimeframeContainer';
import { SymbolDropdown } from '../../src/components/chart-tools/SymbolDropdown';
import { IconChartBar } from '@tabler/icons-react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { SYMBOL_META } from '../../src/constants/symbols';
import { VipStatus } from '@tradex/shared-types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002/prices';
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

// Get popular symbols from SYMBOL_META
const POPULAR_SYMBOLS = Object.keys(SYMBOL_META);

export default function MultiTimeframePage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const { socket, status, error } = useWebSocket(WS_URL);

  // Default timeframes configuration
  const defaultTimeframes = ['5m', '4h', '1d', '1w'];

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

  const baseSymbol = selectedSymbol.replace('USDT', '');
  const symbolMeta = SYMBOL_META[baseSymbol];

  return (
    <div className={`h-screen flex flex-col bg-white ${pjs.className}`}>
      <Header status={status} />

      {/* Compact Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex px-30 items-center justify-between">
          {/* Left: Title and Description */}
          <div className="flex items-center gap-3">
            <IconChartBar
              size={40}
              stroke={2}
              className="text-gray-700 flex-shrink-0"
            />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                Multi-Timeframe Analysis
              </h1>
              <p className="text-[11px] text-gray-600">
                Analyzing {baseSymbol}
                {symbolMeta ? ` (${symbolMeta.name})` : ''} across multiple
                timeframes
              </p>
            </div>
          </div>

          {/* Right: Symbol Selector and Popular Symbols */}
          <div className="flex items-center gap-4">
            {/* Symbol Dropdown */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg">
              <span className="text-[11px] text-gray-600 font-medium">
                Symbol:
              </span>
              <SymbolDropdown
                symbol={selectedSymbol}
                onSymbolChange={setSelectedSymbol}
              />
            </div>

            {/* Popular Symbols */}
            <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
              <span className="text-[11px] font-medium text-gray-600">
                Popular:
              </span>
              <div className="flex items-center gap-1.5">
                {POPULAR_SYMBOLS.map((base) => {
                  const fullSymbol = `${base}USDT`;
                  return (
                    <button
                      key={base}
                      onClick={() => setSelectedSymbol(fullSymbol)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-all ${
                        selectedSymbol === fullSymbol
                          ? 'bg-black text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {base}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error/Warning Messages */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-red-700 text-xs">
          ⚠️ {error}
        </div>
      )}

      {!status.connected && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 text-yellow-700 text-xs">
          ⏳ Connecting to WebSocket...
        </div>
      )}

      {/* Main Multi-Timeframe Area */}
      <div className="flex-1 p-2 bg-gray-50 overflow-hidden">
        <MultiTimeframeContainer
          symbol={selectedSymbol}
          timeframes={defaultTimeframes}
          socket={socket}
          connected={status.connected}
        />
      </div>
    </div>
  );
}

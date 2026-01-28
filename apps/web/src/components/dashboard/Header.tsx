// src/components/dashboard/Header.tsx

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import type { ConnectionStatus } from '../../types/trading.types';

type HeaderProps = {
  status: ConnectionStatus;
};

export function Header({ status }: HeaderProps) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/auth');
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-bold text-gray-900">TradeX</h1>

          <nav className="flex items-center gap-1">
            <button className="px-4 py-2 text-gray-900 bg-gray-100 rounded font-medium">
              Single Chart
            </button>
            <button className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded">
              Multi Chart
            </button>
            <button className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded">
              Multi Timeframe
            </button>
            <button className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded">
              Backtest
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* 🔌 WebSocket status */}
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                status.connected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-gray-600">
              {status.connected ? 'Live' : 'Disconnected'}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded font-medium hover:bg-red-600"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { useMultiChart } from '../../src/hooks/useMultiChart';
import { Header } from '../../src/components/page/Header';
import { MultiChartContainer } from './components/MultiChartContainer';
import { LayoutVisualSelector } from './components/LayoutVisualSelector';
import {
  IconLayout2,
  IconChartDots2,
  IconSettings,
  IconRuler,
} from '@tabler/icons-react';
import { Plus_Jakarta_Sans } from 'next/font/google';
// 1. Import Enum VIPStatus từ shared-types
import { VipStatus, UserRole } from '@tradex/shared-types';

const WS_URL = process.env.NEXT_PUBLIC_PRICE_WS_URL || 'http://localhost/prices';
// 2. Định nghĩa URL API Gateway (để fetch profile)
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export default function MultiChartPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isLoading, setIsLoading] = useState(false); // Thêm biến loading để tránh hiện giao diện khi chưa check xong
  
  const { socket, status, error } = useWebSocket(WS_URL);
  const {
    layout,
    changeLayout,
    updateChart,
    setChartCount,
    getAvailableLayouts,
  } = useMultiChart();

  useEffect(() => {
    const checkVipAccess = async () => {
      // 3. Lấy token (kiểm tra cả 'accessToken' và 'token' để chắc chắn)
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      
      if (!token) {
        router.push('/auth');
        return;
      }

      try {
        // 4. Gọi API lấy thông tin User mới nhất từ Server
        const response = await fetch(`${API_URL}/users/profile`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }

        const user = await response.json();

        // 5. Kiểm tra quyền VIP
        if (user.vipStatus === VipStatus.ACTIVE || user.role === 'admin') {
          // Nếu là VIP hoặc Admin -> Cho phép truy cập
          setIsAuthenticated(true);
        } else {
          // Nếu không phải VIP -> Đá sang trang đăng ký
          console.warn('User is not VIP, redirecting...');
          router.push('/vip-register');
        }
      } catch (err) {
        console.error('Error checking VIP status:', err);
        // Nếu lỗi token hoặc mạng -> Về trang đăng nhập
        localStorage.removeItem('accessToken');
        localStorage.removeItem('token');
        router.push('/auth');
      } finally {
        setIsLoading(false);
      }
    };

    // checkVipAccess();
  }, [router]);

  // 6. Hiển thị màn hình chờ khi đang check quyền
  if (isLoading || !isAuthenticated) {
    return (
      <div className={`min-h-screen bg-white flex flex-col items-center justify-center ${pjs.className}`}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
        <div className="text-gray-600 font-medium">Verifying VIP Membership...</div>
      </div>
    );
  }

  const availableLayouts = getAvailableLayouts();

  return (
    <div className={`h-screen flex flex-col bg-white ${pjs.className}`}>
      <Header status={status} />

      {/* Dashboard Header */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 pt-4">
        <div className="flex items-center justify-between mb-4 px-30">
          <div className="flex items-center gap-4">
            {/* Icon */}
            <IconLayout2
              size={40}
              stroke={2}
              className="text-black flex-shrink-0"
            />

            {/* Text block */}
            <div className="flex flex-col justify-center">
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                Multi Chart Dashboard
              </h1>
              <p className="text-[12px] text-gray-600">
                Monitor multiple cryptocurrency pairs simultaneously
              </p>
            </div>
          </div>
          {/* Controls */}
          <div className="flex items-center gap-6">
            {/* Number of Charts */}
            <div className="flex items-center gap-3">
              <IconSettings size={15} stroke={2} className="text-black" />
              <span className="text-[12px] font-medium text-gray-700">
                Number of Charts:
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    onClick={() => setChartCount(num)}
                    className={`px-2.5 py-1 text-[10px] font-medium rounded-lg transition-all ${
                      layout.charts.length === num
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Layout Selector */}
            {availableLayouts.length > 1 && (
              <>
                <div className="w-px h-8 bg-gray-300" />
                <div className="flex items-center gap-3">
                  <IconRuler size={15} stroke={2} className="text-black" />
                  <span className="text-[12px] font-medium text-gray-700">
                    Layout:
                  </span>
                  <LayoutVisualSelector
                    availableLayouts={availableLayouts}
                    currentLayout={layout.type}
                    onLayoutChange={changeLayout}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error/Warning Messages */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {!status.connected && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 text-yellow-700 text-sm">
          ⏳ Connecting to WebSocket...
        </div>
      )}

      {/* Main Chart Area */}
      <div className="flex-1 p-2 bg-gray-50 overflow-hidden">
        <MultiChartContainer
          layout={layout}
          socket={socket}
          connected={status.connected}
          onUpdateChart={updateChart}
        />
      </div>
    </div>
  );
}

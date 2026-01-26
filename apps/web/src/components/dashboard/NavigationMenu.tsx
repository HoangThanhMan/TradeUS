'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus_Jakarta_Sans } from 'next/font/google';

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

export function NavigationMenu() {
  const pathname = usePathname();
  
  const navItems = [
    { href: '/dashboard', label: 'Single Chart' },
    { href: '/multi-chart', label: 'Multi Chart' },
    { href: '/multi-timeframe', label: 'Multi Timeframe' },
    { href: '/backtest', label: 'Backtest' },
  ];

  return (
    <nav className={`flex items-center gap-1 p-1 rounded-full w-fit ${pjs.className}`}>
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-4 py-1.5 text-xs rounded-full transition-all ${
              isActive
                // Đã thay đổi shadow-lg thành shadow-xl để bóng đậm và sâu hơn
                ? 'bg-white text-gray-950 font-bold shadow-lg'
                : 'text-gray-800 hover:text-gray-900 font-semibold hover:bg-gray-200/50'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
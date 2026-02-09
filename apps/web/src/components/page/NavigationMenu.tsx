'use client';

import React, { useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Plus_Jakarta_Sans } from 'next/font/google';

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

interface NavigationMenuProps {
  isVip?: boolean;
}

const VIP_ONLY_ROUTES = ['/multi-chart', '/multi-timeframe', '/backtest'];

export function NavigationMenu({ isVip = false }: NavigationMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  
  const navItems = [
    { href: '/dashboard', label: 'Single Chart' },
    { href: '/multi-chart', label: 'Multi Chart' },
    { href: '/multi-timeframe', label: 'Multi Timeframe' },
    { href: '/backtest', label: 'Backtest' },
    { href: '/subscriptions', label: 'Subscriptions' },
    { href: '/alerts', label: 'Notifications' },
  ];

  const handleClick = useCallback((e: React.MouseEvent, href: string) => {
    if (!isVip && VIP_ONLY_ROUTES.includes(href)) {
      e.preventDefault();
      router.push('/vip-register');
    }
  }, [isVip, router]);

  return (
    <nav className={`flex items-center gap-1 p-1 rounded-full w-fit ${pjs.className}`}>
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const isLocked = !isVip && VIP_ONLY_ROUTES.includes(item.href);
        
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => handleClick(e, item.href)}
            className={`relative px-4 py-1.5 text-xs rounded-full transition-all flex items-center gap-1.5 ${
              isActive
                ? 'bg-white text-gray-950 font-bold shadow-lg'
                : isLocked
                  ? 'text-gray-400 font-semibold hover:bg-amber-50/50'
                  : 'text-gray-800 hover:text-gray-900 font-semibold hover:bg-gray-200/50'
            }`}
            title={isLocked ? `${item.label} (VIP Only)` : item.label}
          >
            {item.label}
            {isLocked && (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
'use client';

import React from 'react';
import { ConnectionStatus } from '../../types/trading.types';
import { NavigationMenu } from './NavigationMenu';
import { Plus_Jakarta_Sans } from 'next/font/google';

interface HeaderProps {
  status: ConnectionStatus;
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

export function Header({ status }: HeaderProps) {
  return (
    <div className="bg-gray-50/80 backdrop-blur border-b border-gray-200 shadow-md shadow-black/5">
      <div className="flex items-center justify-between px-6 py-1.5">
        {/* Left: Logo & Navigation */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="font-semibold tracking-tight">
            <span className="text-gray-900 text-2xl">Trade</span>
            <span className="bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent font-bold text-3xl">
              X
            </span>
          </div>
        </div>

        {/* Right: Status & Actions */}
        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div className="flex flex-col item-center gap-1 text-xs font-medium">
            <span
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${
                status.connected
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  status.connected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              {status.connected ? 'Connected' : 'Disconnected'}
            </span>

            {status.instanceId && (
              <span className="text-gray-400 text-[10px] pl-2">
                #{status.instanceId}
              </span>
            )}
          </div>

          {/* Navigation Tabs */}
          <NavigationMenu />

          <button
            className={`
              ${pjs.className}
              px-4 py-1.5 text-xs font-semibold rounded-full transition-all
              bg-red-500 text-white
              shadow-lg shadow-red-500/30
              hover:bg-red-600 hover:shadow-red-500/40
              active:scale-[0.98]
            `}
          >
            Admin Panel
          </button>

          <div className="mx-2 h-5 w-px bg-gray-300/70" />

          {/* User Dropdown */}
          <button className={`${pjs.className} flex items-center gap-2 text-xs font-medium text-gray-700 hover:text-gray-900`}>
            <span>Welcome,</span>
            <span className="font-bold">admin</span>
            <svg
              className="w-4 h-4"
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
          </button>
        </div>
      </div>
    </div>
  );
}

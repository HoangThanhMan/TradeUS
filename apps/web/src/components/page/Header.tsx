'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectionStatus } from '../../types/trading.types';
import { NavigationMenu } from './NavigationMenu';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { UserRole } from '@tradex/shared-types';

interface HeaderProps {
  status: ConnectionStatus;
}

interface UserData {
  username?: string;
  email?: string;
  role?: UserRole;
  vipStatus?: string;
}

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

export function Header({ status }: HeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load user from localStorage
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Failed to parse user data');
      }
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/auth');
  };

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === 'admin';
  const isVip = user?.role === UserRole.VIP || user?.role === 'vip' || user?.vipStatus === 'ACTIVE';

  return (
    <div className="bg-gray-50/80 backdrop-blur border-b border-gray-200 shadow-md shadow-black/5 relative z-[99999]">
      <div className="flex items-center justify-between px-6 py-1.5">
        {/* Left: Logo & Navigation */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="font-semibold tracking-tight cursor-pointer" onClick={() => router.push('/dashboard')}>
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

          {/* Admin Panel Button - Only for Admin */}
          {isAdmin && (
            <button
              onClick={() => router.push('/admin')}
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
          )}

          <div className="mx-2 h-5 w-px bg-gray-300/70" />

          {/* User Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className={`${pjs.className} flex items-center gap-2 text-xs font-medium text-gray-700 hover:text-gray-900`}
            >
              <span>Welcome,</span>
              <span className="font-bold">{user?.username || user?.email || 'User'}</span>
              <svg
                className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
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

            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-[9999]">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-xs text-gray-500">Signed in as</p>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {user?.email}
                  </p>
                  {user?.role && (
                    <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase ${
                      user.role === UserRole.ADMIN || user.role === 'admin'
                        ? 'bg-red-100 text-red-700'
                        : user.role === UserRole.VIP || user.role === 'vip'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {user.role}
                    </span>
                  )}
                </div>

                {/* Profile Settings Link */}
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    router.push('/profile');
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Profile Settings
                </button>
                
                {!isAdmin && user?.vipStatus !== 'ACTIVE' && (
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      router.push('/vip-register');
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-yellow-600 hover:bg-yellow-50 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Upgrade to VIP
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 font-medium"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

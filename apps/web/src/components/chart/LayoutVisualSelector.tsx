'use client';

import React from 'react';
import { LayoutType } from '../../types/layout.types';

interface LayoutVisualSelectorProps {
  availableLayouts: LayoutType[];
  currentLayout: LayoutType;
  onLayoutChange: (layout: LayoutType) => void;
}

const LAYOUT_ICONS: Record<LayoutType, { icon: React.ReactNode; label: string }> = {
  '1x1': {
    label: 'Single',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="5" width="30" height="30" rx="2" />
      </svg>
    ),
  },
  '1x2': {
    label: 'Side by Side',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="8" width="12" height="24" rx="2" />
        <rect x="23" y="8" width="12" height="24" rx="2" />
      </svg>
    ),
  },
  '2x1': {
    label: 'Top & Bottom',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="8" y="5" width="24" height="12" rx="2" />
        <rect x="8" y="23" width="24" height="12" rx="2" />
      </svg>
    ),
  },
  '2top-1bottom': {
    label: '2 Top, 1 Bottom',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="5" width="12" height="12" rx="2" />
        <rect x="23" y="5" width="12" height="12" rx="2" />
        <rect x="5" y="23" width="30" height="12" rx="2" />
      </svg>
    ),
  },
  '1top-2bottom': {
    label: '1 Top, 2 Bottom',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="5" width="30" height="12" rx="2" />
        <rect x="5" y="23" width="12" height="12" rx="2" />
        <rect x="23" y="23" width="12" height="12" rx="2" />
      </svg>
    ),
  },
  '2x2': {
    label: '2x2 Grid',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="5" y="5" width="12" height="12" rx="2" />
        <rect x="23" y="5" width="12" height="12" rx="2" />
        <rect x="5" y="23" width="12" height="12" rx="2" />
        <rect x="23" y="23" width="12" height="12" rx="2" />
      </svg>
    ),
  },
};

export function LayoutVisualSelector({ availableLayouts, currentLayout, onLayoutChange }: LayoutVisualSelectorProps) {
  if (availableLayouts.length <= 1) {
    return null; // Don't show selector if only one option
  }

  return (
    <div className="flex items-center gap-2">
      {availableLayouts.map((layoutType) => {
        const layoutInfo = LAYOUT_ICONS[layoutType];
        const isActive = currentLayout === layoutType;

        return (
          <button
            key={layoutType}
            onClick={() => onLayoutChange(layoutType)}
            className={`flex flex-row items-center gap-1 p-1 rounded-lg border-2 transition-all ${
              isActive
                ? 'border-blue-600 bg-blue-50 text-blue-600'
                : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:bg-blue-50'
            }`}
            title={layoutInfo.label}
          >
            <div
              className={`${
                isActive ? 'text-blue-600' : 'text-gray-600'
              } w-5 h-5 flex items-center justify-center`}
            >
              {layoutInfo.icon}
            </div>
            <span className="text-[10px] font-medium">{layoutInfo.label}</span>
          </button>
        );
      })}
    </div>
  );
}
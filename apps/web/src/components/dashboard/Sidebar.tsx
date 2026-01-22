// src/components/dashboard/Sidebar.tsx

'use client';

import React, { useState } from 'react';

interface SidebarProps {
  onToolSelect?: (tool: string) => void;
}

export function Sidebar({ onToolSelect }: SidebarProps) {
  const [activeTool, setActiveTool] = useState('cursor');

  const tools = [
    { id: 'cursor', icon: '↖', label: 'Cursor' },
    { id: 'crosshair', icon: '✛', label: 'Crosshair' },
    { id: 'trendline', icon: '⟋', label: 'Trend Line' },
    { id: 'horizontal', icon: '―', label: 'Horizontal Line' },
    { id: 'rectangle', icon: '▭', label: 'Rectangle' },
    { id: 'circle', icon: '○', label: 'Circle' },
    { id: 'fibonacci', icon: '⟨φ⟩', label: 'Fibonacci' },
    { id: 'text', icon: 'A', label: 'Text' },
    { id: 'measure', icon: '⟷', label: 'Measure' },
    { id: 'delete', icon: '🗑', label: 'Delete' },
  ];

  const handleToolClick = (toolId: string) => {
    setActiveTool(toolId);
    onToolSelect?.(toolId);
  };

  return (
    <div className="w-12 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-2">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => handleToolClick(tool.id)}
          className={`w-10 h-10 flex items-center justify-center rounded transition-colors ${
            activeTool === tool.id
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          title={tool.label}
        >
          <span className="text-lg">{tool.icon}</span>
        </button>
      ))}
    </div>
  );
}
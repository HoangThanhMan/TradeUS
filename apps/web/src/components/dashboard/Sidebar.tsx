// src/components/dashboard/Sidebar.tsx
'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconLine, IconCircleDot, IconChartDots3, IconChartGridDotsFilled, IconPolygon, IconMagnet, IconLockBitcoin, IconEye, IconTrash } from '@tabler/icons-react';


interface SidebarProps {
  onToolSelect?: (tool: string) => void;
}

export function Sidebar({ onToolSelect }: SidebarProps) {
  const [activeTool, setActiveTool] = useState('cursor');
  const [collapsed, setCollapsed] = useState(false);

  const tools = [
    { id: 'line', icon: IconLine, label: 'Line' },
    { id: 'lines', icon: IconChartDots3, label: 'Lines' },
    { id: 'circledot', icon: IconCircleDot, label: 'Circle' },
    { id: 'grid', icon: IconChartGridDotsFilled, label: 'Grid' },
    { id: 'polygon', icon: IconPolygon, label: 'Polygon', dividerAfter: true },

    { id: 'magnet', icon: IconMagnet, label: 'Magnet' },
    { id: 'lock', icon: IconLockBitcoin, label: 'Lock' },
    { id: 'eye', icon: IconEye, label: 'Eye', dividerAfter: true },

    { id: 'delete', icon: IconTrash, label: 'Delete' },
  ];



  const handleToolClick = (toolId: string) => {
    setActiveTool(toolId);
    onToolSelect?.(toolId);
  };

  return (
    <div
      className={`
        bg-gray-50
        border-r border-gray-300/80
        shadow-[2px_0_8px_rgba(0,0,0,0.06)]
        flex flex-col items-center
        transition-all duration-200
        ${collapsed ? 'w-6' : 'w-12'}
        flex-shrink-0
      `}
    >
      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="
          w-10 h-10 
          flex items-center justify-center
          text-gray-600
          hover:bg-gray-100
          rounded
        "
        title={collapsed ? 'Show tools' : 'Hide tools'}
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 z-[999]" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>

      <div className="w-full h-px bg-gray-300" />

      {/* Tools */}
      {!collapsed && (
        <div className="mt-2 flex flex-col items-center">
          {tools.map((tool) => {
            const Icon = tool.icon;

            return (
              <React.Fragment key={tool.id}>
                <button
                  onClick={() => handleToolClick(tool.id)}
                  className={`
                    w-10 h-10 flex items-center justify-center rounded
                    transition-colors
                    ${
                      activeTool === tool.id
                        ? 'bg-gray-300 text-black'
                        : 'text-gray-600 hover:bg-gray-100'
                    }
                  `}
                  title={tool.label}
                >
                  <Icon size={18} strokeWidth={1.75} />
                </button>

                {tool.dividerAfter && (
                  <div className="my-2 w-full h-px bg-gray-300" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

    </div>
  );
}

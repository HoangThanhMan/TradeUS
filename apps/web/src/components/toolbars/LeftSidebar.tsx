import React from 'react';
import { ChevronLeft, ChevronRight, MousePointer2 } from 'lucide-react';
import { 
  IconLine, 
  IconCircleDot, 
  IconChartDots3, 
  IconChartGridDotsFilled, 
  IconPolygon, 
  IconMagnet, 
  IconLock,
  IconLockOpen,
  IconEye, 
  IconEyeOff,
  IconTrash 
} from '@tabler/icons-react';
import { DrawingToolType } from '../../types/drawing.types';

interface SidebarProps {
  activeTool: DrawingToolType;
  magnetMode: boolean;
  drawingsLocked: boolean;
  drawingsVisible: boolean;
  onToolSelect: (tool: DrawingToolType) => void;
  onToggleMagnet: () => void;
  onToggleLock: () => void;
  onToggleVisibility: () => void;
  onClearAll: () => void;
}

export function Sidebar({
  activeTool,
  magnetMode,
  drawingsLocked,
  drawingsVisible,
  onToolSelect,
  onToggleMagnet,
  onToggleLock,
  onToggleVisibility,
  onClearAll,
}: SidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  const tools: Array<{
    id: DrawingToolType | 'magnet' | 'lock' | 'visibility' | 'delete';
    icon: any;
    label: string;
    dividerAfter?: boolean;
  }> = [
    { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
    { id: 'simpleLine', icon: IconLine, label: 'Line' },
    { id: 'circle', icon: IconCircleDot, label: 'Circle' },
    { id: 'priceLevel', icon: IconChartGridDotsFilled, label: 'Price Levels' },
    { id: 'trendLine', icon: IconChartDots3, label: 'Trend Line' },
    { id: 'fibonacciRetracement', icon: IconPolygon, label: 'Fibonacci', dividerAfter: true },
    { id: 'magnet', icon: IconMagnet, label: 'Magnet Mode' },
    { id: 'lock', icon: drawingsLocked ? IconLock : IconLockOpen, label: drawingsLocked ? 'Unlock' : 'Lock' },
    { id: 'visibility', icon: drawingsVisible ? IconEye : IconEyeOff, label: drawingsVisible ? 'Hide All' : 'Show All', dividerAfter: true },
    { id: 'delete', icon: IconTrash, label: 'Delete All' },
  ];

  const handleToolClick = (toolId: string) => {
    if (toolId === 'magnet') {
      onToggleMagnet();
    } else if (toolId === 'lock') {
      onToggleLock();
    } else if (toolId === 'visibility') {
      onToggleVisibility();
    } else if (toolId === 'delete') {
      onClearAll();
    } else {
      onToolSelect(toolId as DrawingToolType);
    }
  };

  const isActive = (toolId: string) => {
    if (toolId === 'magnet') return magnetMode;
    if (toolId === 'lock') return drawingsLocked;
    if (toolId === 'visibility') return !drawingsVisible;
    return activeTool === toolId;
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
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded"
        title={collapsed ? 'Show tools' : 'Hide tools'}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className="w-full h-px bg-gray-300" />

      {!collapsed && (
        <div className="mt-2 flex flex-col items-center gap-0.5">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <React.Fragment key={tool.id}>
                <button
                  onClick={() => handleToolClick(tool.id)}
                  className={`
                    w-10 h-10 flex items-center justify-center rounded
                    transition-colors relative
                    ${
                      isActive(tool.id)
                        ? 'text-black font-bold after:absolute after:left-0 after:top-1 after:bottom-1 after:w-0.5 after:bg-black'
                        : 'text-gray-600 hover:bg-gray-200'
                    }
                  `}
                  title={tool.label}
                >
                  <Icon size={18} strokeWidth={1.75} />
                </button>
                {tool.dividerAfter && <div className="my-1 w-8 h-px bg-gray-300" />}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
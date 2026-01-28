// src/components/chart/FibonacciRetracementLayer.tsx

import { Plus_Jakarta_Sans } from 'next/font/google';
import React, { useEffect, useState, useRef, useCallback } from 'react';

interface FibLevel {
  price: number;
  percentage: number;
  label: string;
}

interface FibonacciRetracementLayerProps {
  activeTool: string;
  highPoint: { price: number; timestamp: number } | null;
  lowPoint: { price: number; timestamp: number } | null;
  onSetHighPoint: (price: number, timestamp: number) => void;
  onSetLowPoint: (price: number, timestamp: number) => void;
  chartInstance: any;
  drawingsVisible: boolean; // 🔥 Added
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

// Fibonacci levels
const FIB_LEVELS = [
  { ratio: 0, label: '0.0%' },
  { ratio: 0.236, label: '23.6%' },
  { ratio: 0.382, label: '38.2%' },
  { ratio: 0.5, label: '50.0%' },
  { ratio: 0.618, label: '61.8%' },
  { ratio: 0.786, label: '78.6%' },
  { ratio: 1, label: '100.0%' },
];

export function FibonacciRetracementLayer({
  activeTool,
  highPoint,
  lowPoint,
  onSetHighPoint,
  onSetLowPoint,
  chartInstance,
  drawingsVisible, // 🔥 Added
}: FibonacciRetracementLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    }
  }, []);

  useEffect(() => {
    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [updateDimensions]);

  const priceToY = (price: number): number | null => {
    if (!chartInstance) return null;
    try {
      if (typeof chartInstance.convertToPixel === 'function') {
        const result = chartInstance.convertToPixel({ value: price }, { paneId: 'candle_pane' });
        if (result && typeof result.y === 'number') {
          return result.y;
        }
      }
      return null;
    } catch (e) {
      console.warn('convertToPixel failed:', e);
      return null;
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'fibonacciRetracement' || !chartInstance || !containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;

    try {
      if (typeof chartInstance.convertFromPixel === 'function') {
        const result = chartInstance.convertFromPixel({ x: 0, y }, { paneId: 'candle_pane' });
        
        if (result && typeof result.value === 'number') {
          const visibleRange = chartInstance.getVisibleRange();
          const dataList = chartInstance.getDataList();
          
          if (visibleRange && dataList && dataList.length > 0) {
            const { from, to } = visibleRange;
            const visibleData = dataList.slice(from, to + 1);
            const middleIndex = Math.floor(visibleData.length / 2);
            const timestamp = visibleData[middleIndex].timestamp || Date.now();
            
            if (!highPoint) {
              onSetHighPoint(result.value, timestamp);
            } else if (!lowPoint) {
              onSetLowPoint(result.value, timestamp);
            } else {
              onSetHighPoint(result.value, timestamp);
            }
            return;
          }
        }
      }
    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  const calculateFibLevels = (): FibLevel[] => {
    if (!highPoint || !lowPoint) {
      return [];
    }

    const high = Math.max(highPoint.price, lowPoint.price);
    const low = Math.min(highPoint.price, lowPoint.price);
    const range = high - low;

    if (range === 0) {
      return [];
    }

    return FIB_LEVELS.map(level => ({
      price: low + (range * level.ratio),
      percentage: level.ratio * 100,
      label: level.label,
    }));
  };

  const renderFibLevels = () => {
    // 🔥 Check visibility first
    if (!drawingsVisible) {
      return null;
    }

    const currentHeight = containerRef.current?.getBoundingClientRect().height || dimensions.height;
    
    if (currentHeight === 0) {
      return null;
    }

    // Show HIGH point line after first click (ONLY when tool is active)
    if (activeTool === 'fibonacciRetracement' && highPoint && !lowPoint) {
      const highY = priceToY(highPoint.price);
      if (highY === null) return null;

      return (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{ top: `${highY}px` }}
        >
          <div 
            className="w-full h-[2px] shadow-sm" 
            style={{ backgroundColor: '#95a5a6' }}
          />
          <div className={`absolute left-2 -top-5 ${pjs.className}`}>
            <div className="bg-[#95a5a6] text-white text-[7px] font-bold px-2 py-1 rounded shadow-md whitespace-nowrap">
              HIGH: ${highPoint.price.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>
      );
    }

    if (!highPoint || !lowPoint) {
      return null;
    }

    const fibLevels = calculateFibLevels();
    
    if (fibLevels.length === 0) {
      return null;
    }

    return (
      <>
        {/* Background zones */}
        {fibLevels.slice(0, -1).map((level, index) => {
          const nextLevel = fibLevels[index + 1];
          const y1 = priceToY(level.price);
          const y2 = priceToY(nextLevel.price);
          
          if (y1 === null || y2 === null) return null;

          const bgColors = [
            'rgba(253, 214, 218, 0.5)',
            'rgba(254, 234, 205, 0.5)',
            'rgba(219, 238, 220, 0.5)',
            'rgba(204, 234, 229, 0.5)',
            'rgba(204, 242, 247, 0.5)',
            'rgba(228, 228, 230, 0.5)',
          ];

          return (
            <div
              key={`bg-${index}`}
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                top: `${Math.min(y1, y2)}px`,
                height: `${Math.abs(y2 - y1)}px`,
                backgroundColor: bgColors[index],
                borderTop: index === 0 ? '1px solid rgba(0,0,0,0.1)' : 'none',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
              }}
            />
          );
        })}

        {/* Lines and labels */}
        {fibLevels.map((level, index) => {
          const y = priceToY(level.price);
          
          if (y === null) return null;

          const levelStyles = [
            { line: '#95a5a6', label: 'bg-[#95a5a6]' },
            { line: '#e74c3c', label: 'bg-[#e74c3c]' },
            { line: '#e67e22', label: 'bg-[#e67e22]' },
            { line: '#27ae60', label: 'bg-[#27ae60]' },
            { line: '#16a085', label: 'bg-[#16a085]' },
            { line: '#3498db', label: 'bg-[#3498db]' },
            { line: '#95a5a6', label: 'bg-[#95a5a6]' },
          ];

          const style = levelStyles[index] || { line: '#bdc3c7', label: 'bg-[#bdc3c7]' };

          return (
            <div
              key={`fib-${index}`}
              className="absolute left-0 right-0 pointer-events-none"
              style={{ top: `${y}px` }}
            >
              <div 
                className="w-full h-[0.6px] shadow-sm" 
                style={{ backgroundColor: style.line }}
              />
              
              <div className={`absolute left-2 -top-5 flex items-center gap-1 ${pjs.className}`}>
                <div className={`${style.label} text-white text-[7px] font-bold px-2 py-1 rounded shadow-md whitespace-nowrap`}>
                  ${level.price.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                
                <div className={`${style.label} text-white text-[7px] font-semibold px-2 py-1 rounded whitespace-nowrap`}>
                  {level.label}
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  const renderInstruction = () => {
    if (activeTool !== 'fibonacciRetracement') return null;
    
    if (!highPoint) {
      return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1.5 rounded shadow-lg z-50">
          Click to set HIGH point
        </div>
      );
    }
    
    if (!lowPoint) {
      return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1.5 rounded shadow-lg z-50">
          Click to set LOW point
        </div>
      );
    }
    
    return null;
  };

  // 🔥 FIXED: Show overlay when tool is active OR when there's completed fibonacci
  const showOverlay = activeTool === 'fibonacciRetracement' || (highPoint && lowPoint);

  if (!showOverlay) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0"
      style={{ 
        zIndex: 100,
        // 🔥 FIXED: Chỉ bắt sự kiện khi tool đang active, không chặn khi đã vẽ xong
        pointerEvents: activeTool === 'fibonacciRetracement' ? 'auto' : 'none',
        cursor: activeTool === 'fibonacciRetracement' ? 'crosshair' : 'default'
      }}
      onClick={activeTool === 'fibonacciRetracement' ? handleClick : undefined}
    >
      {renderFibLevels()}
      {renderInstruction()}
    </div>
  );
}
import { Plus_Jakarta_Sans } from 'next/font/google';
import React, { useEffect, useState, useRef, useCallback } from 'react';

interface PriceLevel {
  price: number;
  timestamp: number;
  percentage: number | null;
}

interface SimplePriceLevelLayerProps {
  activeTool: string;
  levels: PriceLevel[];
  onAddLevel: (price: number, timestamp: number) => void;
  chartInstance: any;
  drawingsVisible: boolean; // 🔥 Added
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

export function SimplePriceLevelLayer({
  activeTool,
  levels,
  onAddLevel,
  chartInstance,
  drawingsVisible, // 🔥 Added
}: SimplePriceLevelLayerProps) {
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
    if (activeTool !== 'priceLevel' || !chartInstance || !containerRef.current) {
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
            
            onAddLevel(result.value, timestamp);
            return;
          }
        }
      }

      console.warn('⚠️ Using fallback manual calculation');
      const visibleRange = chartInstance.getVisibleRange();
      const dataList = chartInstance.getDataList();
      
      if (!visibleRange || !dataList || dataList.length === 0) {
        return;
      }

      const { from, to } = visibleRange;
      const visibleData = dataList.slice(from, to + 1);

      const prices: number[] = [];
      visibleData.forEach((candle: any) => {
        if (candle.high) prices.push(candle.high);
        if (candle.low) prices.push(candle.low);
      });

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      
      const height = rect.height;
      const yRatio = y / height;
      const calculatedPrice = maxPrice - (yRatio * (maxPrice - minPrice));
      
      const middleIndex = Math.floor(visibleData.length / 2);
      const timestamp = visibleData[middleIndex].timestamp || Date.now();

      onAddLevel(calculatedPrice, timestamp);

    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  const renderLevels = () => {
    // 🔥 Check visibility first
    if (!drawingsVisible) {
      return null;
    }

    if (!levels || levels.length === 0) {
      return null;
    }

    const currentHeight = containerRef.current?.getBoundingClientRect().height || dimensions.height;
    
    if (currentHeight === 0) {
      return null;
    }

    let minPrice = 0;
    let maxPrice = 100000;

    try {
      const visibleRange = chartInstance?.getVisibleRange();
      const dataList = chartInstance?.getDataList();
      
      if (visibleRange && dataList && dataList.length > 0) {
        const { from, to } = visibleRange;
        const visibleData = dataList.slice(from, to + 1);
        
        const prices: number[] = [];
        visibleData.forEach((candle: any) => {
          if (candle.high) prices.push(candle.high);
          if (candle.low) prices.push(candle.low);
        });
        
        if (prices.length > 0) {
          minPrice = Math.min(...prices);
          maxPrice = Math.max(...prices);
        }
      }
    } catch (e) {
      console.warn('Failed to get price range:', e);
    }

    const priceRange = maxPrice - minPrice;
    if (priceRange === 0) return null;

    const levelYPositions = levels.map((level) => {
      const apiY = priceToY(level.price);
      
      if (apiY !== null) {
        return apiY;
      }
      
      const priceRatio = (level.price - minPrice) / priceRange;
      return currentHeight * (1 - priceRatio);
    });

    const level0Index = levels.findIndex(l => l.percentage === 0);
    const level100Index = levels.findIndex(l => l.percentage === 100);

    return (
      <>
        {level0Index !== -1 && level100Index !== -1 && (
          <div
            className="absolute right-0 pointer-events-none"
            style={{
              top: `${Math.min(levelYPositions[level0Index], levelYPositions[level100Index])}px`,
              height: `${Math.abs(levelYPositions[level100Index] - levelYPositions[level0Index])}px`,
              width: '56px',
              backgroundColor: 'rgba(55, 121, 236, 0.15)',
              borderLeft: '1px solid rgba(55, 121, 236, 0.3)',
            }}
          />
        )}

        {levels.map((level, index) => {
          const y = levelYPositions[index];

          let lineColor = '#3779ec';
          let bgColor = 'bg-[#3779ec]';
          let textColor = 'text-white';
          let percentBgColor = 'bg-[#3779ec]';
          let percentTextColor = 'text-white';

          if (level.percentage !== null) {
            if (level.percentage === 100 || level.percentage === 0) {
              lineColor = '#3779ec';
              bgColor = 'bg-[#3779ec]';
              percentBgColor = 'bg-[#3779ec]';
            } else {
              lineColor = '#e8c58a';
              bgColor = 'bg-[#e8c58a]';
              percentBgColor = 'bg-[#e8c58a]';
            }
          }

          return (
            <div
              key={`level-${index}-${level.price}`}
              className="absolute left-0 right-0 pointer-events-none"
              style={{ top: `${y}px` }}
            >
              <div 
                className="w-full h-[1.5px] shadow-sm" 
                style={{ backgroundColor: lineColor }}
              />
              
              <div className={`absolute left-2 -top-5 flex items-center gap-1 ${pjs.className}`}>
                <div className={`${bgColor} ${textColor} text-[7px] font-bold px-2 py-1 rounded shadow-md whitespace-nowrap`}>
                  ${level.price.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                
                {levels.length >= 2 && level.percentage !== null && (
                  <div className={`${percentBgColor} ${percentTextColor} text-[7px] font-semibold px-2 py-1 rounded whitespace-nowrap`}>
                    {level.percentage.toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  // 🔥 FIXED: Show when tool is active OR when there are levels
  const showOverlay = activeTool === 'priceLevel' || (levels && levels.length > 0);

  if (!showOverlay) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0"
      style={{ 
        zIndex: 100,
        pointerEvents: activeTool === 'priceLevel' ? 'auto' : 'none',
        cursor: activeTool === 'priceLevel' ? 'crosshair' : 'default'
      }}
      onClick={handleClick}
    >
      {renderLevels()}
    </div>
  );
}
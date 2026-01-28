// src/hooks/useDrawingManager.ts

import { useState, useCallback, useEffect } from 'react';
import { 
  DrawingState, 
  DrawingToolType, 
  BaseDrawing, 
  FreeDrawing,
  DrawingPoint,
  PriceLevelPoint 
} from '../types/drawing.types';

export function useDrawingManager(chartInstance: any) {
  const [state, setState] = useState<DrawingState>({
    drawings: [],
    freeDrawings: [],
    activeTool: 'cursor',
    magnetMode: false,
    drawingsLocked: false,
    drawingsVisible: true,
    tempDrawing: null,
    priceLevels: [], 
    fibonacciHigh: null,
    fibonacciLow: null,
  });

  // Load drawings from storage
  useEffect(() => {
    // 🔥 CLEAR ALL on page reload - không load từ localStorage nữa
    console.log('🧹 Page reloaded - clearing all drawings');
    
    // Clear localStorage
    localStorage.removeItem('chart_drawings');
    localStorage.removeItem('chart_free_drawings');
    
    // Set initial empty state
    setState(prev => ({
      ...prev,
      drawings: [],
      freeDrawings: [],
      priceLevels: [],
      fibonacciHigh: null,
      fibonacciLow: null,
    }));

    const visibilityState = localStorage.getItem('drawings_visible');
    if (visibilityState !== null) {
      setState(prev => ({ ...prev, drawingsVisible: visibilityState === 'true' }));
    }
  }, []);

  // Save drawings to storage
  const saveDrawings = useCallback((drawings: BaseDrawing[]) => {
    try {
      localStorage.setItem('chart_drawings', JSON.stringify(drawings));
    } catch (e) {
      console.error('Failed to save drawings:', e);
    }
  }, []);

  const saveFreeDrawings = useCallback((freeDrawings: FreeDrawing[]) => {
    try {
      localStorage.setItem('chart_free_drawings', JSON.stringify(freeDrawings));
    } catch (e) {
      console.error('Failed to save free drawings:', e);
    }
  }, []);

  // Set active tool - 🔥 FIXED: Smart clearing logic
  const setActiveTool = useCallback((tool: DrawingToolType) => {
    setState(prev => {
      let newPriceLevels = prev.priceLevels;
      let newFibHigh = prev.fibonacciHigh;
      let newFibLow = prev.fibonacciLow;

      // 🎯 Logic: Price Level và Fibonacci triệt tiêu lẫn nhau
      if (tool === 'priceLevel') {
        // Khi chọn Price Level → xóa Fibonacci
        newFibHigh = null;
        newFibLow = null;
        // Giữ nguyên priceLevels nếu có
      } else if (tool === 'fibonacciRetracement') {
        // Khi chọn Fibonacci → xóa Price Level
        newPriceLevels = [];
        // Giữ nguyên fibonacci nếu có
      } else if (tool === 'cursor') {
        // Cursor giữ nguyên tất cả
        // Không làm gì cả
      } else {
        // Các tool khác (simpleLine, circle, trendLine...) → giữ nguyên tất cả
        // Không làm gì cả
      }

      return { 
        ...prev, 
        activeTool: tool,
        priceLevels: newPriceLevels,
        fibonacciHigh: newFibHigh,
        fibonacciLow: newFibLow,
      };
    });
  }, []);

  // Toggle magnet mode
  const toggleMagnetMode = useCallback(() => {
    setState(prev => ({ ...prev, magnetMode: !prev.magnetMode }));
  }, []);

  // Toggle lock all drawings
  const toggleLockDrawings = useCallback(() => {
    setState(prev => {
      const locked = !prev.drawingsLocked;
      const drawings = prev.drawings.map(d => ({ ...d, locked }));
      const freeDrawings = prev.freeDrawings.map(d => ({ ...d, locked }));
      
      saveDrawings(drawings);
      saveFreeDrawings(freeDrawings);
      
      return { ...prev, drawingsLocked: locked, drawings, freeDrawings };
    });
  }, [saveDrawings, saveFreeDrawings]);

  // Toggle visibility of all drawings
  const toggleDrawingsVisibility = useCallback(() => {
    setState(prev => {
      const visible = !prev.drawingsVisible;
      localStorage.setItem('drawings_visible', String(visible));
      
      const drawings = prev.drawings.map(d => ({ ...d, visible }));
      const freeDrawings = prev.freeDrawings.map(d => ({ ...d, visible }));
      
      saveDrawings(drawings);
      saveFreeDrawings(freeDrawings);
      
      return { ...prev, drawingsVisible: visible, drawings, freeDrawings };
    });
  }, [saveDrawings, saveFreeDrawings]);

  // Add free drawing (Line, Circle)
  const addFreeDrawing = useCallback((drawing: FreeDrawing) => {
    setState(prev => {
      const newFreeDrawings = [...prev.freeDrawings, drawing];
      saveFreeDrawings(newFreeDrawings);
      return { ...prev, freeDrawings: newFreeDrawings };
    });
  }, [saveFreeDrawings]);

  // 🎯 Add price level (simple - just add to array)
  const addPriceLevelPoint = useCallback((price: number, timestamp: number) => {
    setState(prev => {
      const newLevel: PriceLevelPoint = {
        price,
        timestamp,
        percentage: null,
      };

      const newLevels = [...(prev.priceLevels || []), newLevel];
      
      // Calculate percentages
      const calculatedLevels = calculatePercentages(newLevels);

      console.log('📊 Price levels updated:', calculatedLevels);

      return {
        ...prev,
        priceLevels: calculatedLevels,
      };
    });
  }, []);

  // 🎯 Clear all price levels
  const clearPriceLevels = useCallback(() => {
    setState(prev => ({ ...prev, priceLevels: [] }));
  }, []);

  // 🆕 Set Fibonacci high point
  const setFibonacciHigh = useCallback((price: number, timestamp: number) => {
    setState(prev => ({
      ...prev,
      fibonacciHigh: { price, timestamp },
      fibonacciLow: null, // Reset low when setting new high
    }));
  }, []);

  // 🆕 Set Fibonacci low point
  const setFibonacciLow = useCallback((price: number, timestamp: number) => {
    setState(prev => ({
      ...prev,
      fibonacciLow: { price, timestamp },
    }));
  }, []);

  // 🆕 Clear Fibonacci
  const clearFibonacci = useCallback(() => {
    setState(prev => ({
      ...prev,
      fibonacciHigh: null,
      fibonacciLow: null,
    }));
  }, []);

  // Add drawing
  const addDrawing = useCallback((drawing: BaseDrawing) => {
    setState(prev => {
      const drawingWithVisibility = {
        ...drawing,
        visible: prev.drawingsVisible,
      };
      const newDrawings = [...prev.drawings, drawingWithVisibility];
      saveDrawings(newDrawings);
      return { ...prev, drawings: newDrawings };
    });
  }, [saveDrawings, state.drawingsVisible]);

  // Update drawing
  const updateDrawing = useCallback((id: string, updates: Partial<BaseDrawing>) => {
    setState(prev => {
      const drawings = prev.drawings.map(d => 
        d.id === id ? { ...d, ...updates } : d
      );
      saveDrawings(drawings);
      return { ...prev, drawings };
    });
  }, [saveDrawings]);

  // Remove drawing
  const removeDrawing = useCallback((id: string) => {
    setState(prev => {
      const drawings = prev.drawings.filter(d => d.id !== id);
      saveDrawings(drawings);
      return { ...prev, drawings };
    });
  }, [saveDrawings]);

  // Clear all drawings (including price levels)
  const clearAllDrawings = useCallback(() => {
    if (confirm('Are you sure you want to delete all drawings?')) {
      setState(prev => ({ 
        ...prev, 
        drawings: [], 
        freeDrawings: [], 
        priceLevels: [],
        fibonacciHigh: null,
        fibonacciLow: null,
      }));
      localStorage.removeItem('chart_drawings');
      localStorage.removeItem('chart_free_drawings');
    }
  }, []);

  // Set temp drawing (while drawing)
  const setTempDrawing = useCallback((drawing: BaseDrawing | null) => {
    setState(prev => ({ ...prev, tempDrawing: drawing }));
  }, []);

  // Magnet snap function
  const snapToPrice = useCallback((value: number, timestamp: number): DrawingPoint => {
    if (!state.magnetMode || !chartInstance) {
      return { timestamp, value };
    }

    // TODO: Implement snap to candle high/low/close
    return { timestamp, value };
  }, [state.magnetMode, chartInstance]);

  return {
    state,
    setActiveTool,
    toggleMagnetMode,
    toggleLockDrawings,
    toggleDrawingsVisibility,
    addDrawing,
    addFreeDrawing,
    updateDrawing,
    removeDrawing,
    clearAllDrawings,
    setTempDrawing,
    snapToPrice,
    addPriceLevelPoint,
    clearPriceLevels,
    setFibonacciHigh,
    setFibonacciLow,
    clearFibonacci,
  };
}

// Helper: Calculate percentages
function calculatePercentages(levels: PriceLevelPoint[]): PriceLevelPoint[] {
  if (levels.length < 2) {
    return levels.map(l => ({ ...l, percentage: null }));
  }

  const prices = levels.map(l => l.price);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const range = maxPrice - minPrice;

  if (range === 0) {
    return levels.map(l => ({ ...l, percentage: 50 }));
  }

  return levels.map(l => ({
    ...l,
    percentage: ((l.price - minPrice) / range) * 100,
  }));
}
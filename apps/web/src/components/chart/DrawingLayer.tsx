// src/components/chart/DrawingLayer.tsx
'use client';

import React, { useEffect } from 'react';
import { BaseDrawing, PriceLevelDrawing } from '../../types/drawing.types';

interface DrawingLayerProps {
  chartInstance: any;
  drawings: BaseDrawing[];
  tempDrawing: BaseDrawing | null;
  priceLevels?: any[];
}

export function DrawingLayer({ 
  chartInstance, 
  drawings, 
  tempDrawing,
  priceLevels 
}: DrawingLayerProps) {
  
  useEffect(() => {
    if (!chartInstance) return;

    // Clear existing overlays
    chartInstance.removeOverlay();

    // Filter only visible drawings
    const visibleDrawings = drawings.filter(d => d.visible !== false);

    // Render each visible drawing
    [...visibleDrawings, tempDrawing].filter(Boolean).forEach(drawing => {
      if (!drawing) return;

      const overlayConfigs = convertDrawingToOverlay(drawing);
      if (overlayConfigs) {
        if (Array.isArray(overlayConfigs)) {
          overlayConfigs.forEach(config => chartInstance.createOverlay(config));
        } else {
          chartInstance.createOverlay(overlayConfigs);
        }
      }
    });

    // Render active price levels
    if (priceLevels && priceLevels.length > 0) {
      priceLevels.forEach((level, index) => {
        chartInstance.createOverlay({
          id: `priceLevel_temp_${index}`,
          name: 'horizontalSegment',
          points: [{ timestamp: level.timestamp, value: level.price }],
          styles: {
            color: '#3B82F6',
            lineWidth: 2,
          },
        });
      });
    }

  }, [chartInstance, drawings, tempDrawing, priceLevels]);

  return null;
}

// Convert drawing to klinecharts overlay format
function convertDrawingToOverlay(drawing: BaseDrawing): any {
  const { type, points, style, id } = drawing;

  const baseStyle = {
    color: style?.color || '#1E40AF',
    lineWidth: style?.lineWidth || 2,
    dashStyle: style?.dashStyle || 'solid',
  };

  switch (type) {
    case 'trendLine':
      if (points.length < 2) return null;
      return {
        id,
        name: 'segment',
        points: points.map(p => ({ timestamp: p.timestamp, value: p.value })),
        styles: baseStyle,
      };

    case 'rayLine':
      if (points.length < 2) return null;
      return {
        id,
        name: 'ray',
        points: points.map(p => ({ timestamp: p.timestamp, value: p.value })),
        styles: baseStyle,
      };

    case 'horizontalLine':
      if (points.length < 1) return null;
      return {
        id,
        name: 'horizontalSegment',
        points: [{ timestamp: points[0].timestamp, value: points[0].value }],
        styles: baseStyle,
      };

    // Price Levels
    case 'priceLevel':
      const priceLevelDrawing = drawing as PriceLevelDrawing;
      if (!priceLevelDrawing.levels || priceLevelDrawing.levels.length === 0) return null;
      
      return priceLevelDrawing.levels.map((level, index) => ({
        id: `${id}_level_${index}`,
        name: 'horizontalSegment',
        points: [{ timestamp: level.timestamp, value: level.price }],
        styles: {
          ...baseStyle,
          color: '#3B82F6',
        },
      }));

    case 'rectangle':
      if (points.length < 2) return null;
      return {
        id,
        name: 'rect',
        points: points.map(p => ({ timestamp: p.timestamp, value: p.value })),
        styles: { ...baseStyle, filled: true, fillColor: baseStyle.color + '20' },
      };

    case 'parallelChannel':
      if (points.length < 2) return null;
      return {
        id,
        name: 'parallelogram',
        points: points.map(p => ({ timestamp: p.timestamp, value: p.value })),
        styles: baseStyle,
      };

    case 'fibonacciRetracement':
      if (points.length < 2) return null;
      return {
        id,
        name: 'fibonacciLine',
        points: points.map(p => ({ timestamp: p.timestamp, value: p.value })),
        styles: baseStyle,
      };

    // Ignore simpleLine and circle - they are handled by FreeDrawingCanvas
    case 'simpleLine':
    case 'circle':
      return null;

    default:
      return null;
  }
}
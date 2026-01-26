import React, { useRef, useEffect, useState } from 'react';
import { FreeDrawing, CanvasPoint } from '../../types/drawing.types';

// 🎨 CẤU HÌNH UI
const DRAWING_CONFIG = {
  completed: {
    trendline: {
      color: '#3779ec',
      lineWidth: 0.9,
      lineCap: 'round' as CanvasLineCap,
      lineJoin: 'round' as CanvasLineJoin,
    },
    circle: {
      strokeColor: '#3779ec',
      fillColor: 'rgba(59, 130, 246, 0.2)',
      lineWidth: 1,
      lineCap: 'round' as CanvasLineCap,
      lineJoin: 'round' as CanvasLineJoin,
    },
  },
  preview: {
    trendline: {
      color: '#3B82F6',
      lineWidth: 2,
      dashPattern: [5, 5],
    },
    circle: {
      strokeColor: '#3B82F6',
      fillColor: 'rgba(59, 130, 246, 0.1)',
      lineWidth: 2,
      dashPattern: [5, 5],
    },
  },
};

interface FreeDrawingCanvasProps {
  activeTool: 'cursor' | 'simpleLine' | 'circle' | string;
  drawings: FreeDrawing[];
  onDrawingComplete: (drawing: FreeDrawing) => void;
  drawingsVisible: boolean;
}

export function FreeDrawingCanvas({
  activeTool,
  drawings,
  onDrawingComplete,
  drawingsVisible,
}: FreeDrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 🎯 State cho TRENDLINE (click-click mode)
  const [trendlineFirstPoint, setTrendlineFirstPoint] = useState<CanvasPoint | null>(null);
  const [trendlinePreviewPoint, setTrendlinePreviewPoint] = useState<CanvasPoint | null>(null);
  
  // 🎯 State cho CIRCLE (drag mode - giữ nguyên)
  const [isDrawingCircle, setIsDrawingCircle] = useState(false);
  const [circleStartPoint, setCircleStartPoint] = useState<CanvasPoint | null>(null);
  const [circleCurrentPoint, setCircleCurrentPoint] = useState<CanvasPoint | null>(null);

  // Helper: Extend line to canvas edges
  const extendLine = (p1: CanvasPoint, p2: CanvasPoint, canvasWidth: number, canvasHeight: number) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      return { start: p1, end: p2 };
    }

    const intersections: CanvasPoint[] = [];
    
    // Left edge
    if (dx !== 0) {
      const t = -p1.x / dx;
      const y = p1.y + t * dy;
      if (y >= 0 && y <= canvasHeight) {
        intersections.push({ x: 0, y });
      }
    }
    
    // Right edge
    if (dx !== 0) {
      const t = (canvasWidth - p1.x) / dx;
      const y = p1.y + t * dy;
      if (y >= 0 && y <= canvasHeight) {
        intersections.push({ x: canvasWidth, y });
      }
    }
    
    // Top edge
    if (dy !== 0) {
      const t = -p1.y / dy;
      const x = p1.x + t * dx;
      if (x >= 0 && x <= canvasWidth) {
        intersections.push({ x, y: 0 });
      }
    }
    
    // Bottom edge
    if (dy !== 0) {
      const t = (canvasHeight - p1.y) / dy;
      const x = p1.x + t * dx;
      if (x >= 0 && x <= canvasWidth) {
        intersections.push({ x, y: canvasHeight });
      }
    }

    if (intersections.length >= 2) {
      return { start: intersections[0], end: intersections[intersections.length - 1] };
    }
    
    return { start: p1, end: p2 };
  };

  // Redraw all drawings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!drawingsVisible) return;

    // Vẽ tất cả drawings đã lưu
    drawings.forEach(drawing => {
      if (!drawing.visible) return;

      if (drawing.type === 'simpleLine' && drawing.points.length === 2) {
        const extended = extendLine(
          drawing.points[0],
          drawing.points[1],
          canvas.width,
          canvas.height
        );

        ctx.strokeStyle = drawing.color || DRAWING_CONFIG.completed.trendline.color;
        ctx.lineWidth = drawing.lineWidth || DRAWING_CONFIG.completed.trendline.lineWidth;
        ctx.lineCap = DRAWING_CONFIG.completed.trendline.lineCap;
        ctx.lineJoin = DRAWING_CONFIG.completed.trendline.lineJoin;

        ctx.beginPath();
        ctx.moveTo(extended.start.x, extended.start.y);
        ctx.lineTo(extended.end.x, extended.end.y);
        ctx.stroke();

      } else if (drawing.type === 'circle' && drawing.points.length === 2) {
        const center = drawing.points[0];
        const edge = drawing.points[1];
        const radius = Math.sqrt(
          Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
        );

        if ((drawing as any).fillColor || DRAWING_CONFIG.completed.circle.fillColor) {
          ctx.fillStyle = (drawing as any).fillColor || DRAWING_CONFIG.completed.circle.fillColor;
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
          ctx.fill();
        }

        ctx.strokeStyle = drawing.color || DRAWING_CONFIG.completed.circle.strokeColor;
        ctx.lineWidth = drawing.lineWidth || DRAWING_CONFIG.completed.circle.lineWidth;
        ctx.lineCap = DRAWING_CONFIG.completed.circle.lineCap;
        ctx.lineJoin = DRAWING_CONFIG.completed.circle.lineJoin;

        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });

    // 🎯 Preview TRENDLINE (click-click mode)
    if (trendlineFirstPoint && trendlinePreviewPoint) {
      // Vẽ đường đứt nét preview
      ctx.strokeStyle = DRAWING_CONFIG.preview.trendline.color;
      ctx.lineWidth = DRAWING_CONFIG.preview.trendline.lineWidth;
      ctx.lineCap = DRAWING_CONFIG.completed.trendline.lineCap;
      ctx.lineJoin = DRAWING_CONFIG.completed.trendline.lineJoin;
      ctx.setLineDash(DRAWING_CONFIG.preview.trendline.dashPattern);

      ctx.beginPath();
      ctx.moveTo(trendlineFirstPoint.x, trendlineFirstPoint.y);
      ctx.lineTo(trendlinePreviewPoint.x, trendlinePreviewPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 🎯 Vẽ điểm đầu tiên (point to to)
      ctx.fillStyle = DRAWING_CONFIG.preview.trendline.color;
      ctx.beginPath();
      ctx.arc(trendlineFirstPoint.x, trendlineFirstPoint.y, 6, 0, 2 * Math.PI);
      ctx.fill();

      // Vẽ viền trắng cho điểm
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(trendlineFirstPoint.x, trendlineFirstPoint.y, 6, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // 🎯 Preview CIRCLE (drag mode)
    if (isDrawingCircle && circleStartPoint && circleCurrentPoint) {
      const radius = Math.sqrt(
        Math.pow(circleCurrentPoint.x - circleStartPoint.x, 2) +
        Math.pow(circleCurrentPoint.y - circleStartPoint.y, 2)
      );

      ctx.fillStyle = DRAWING_CONFIG.preview.circle.fillColor;
      ctx.beginPath();
      ctx.arc(circleStartPoint.x, circleStartPoint.y, radius, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = DRAWING_CONFIG.preview.circle.strokeColor;
      ctx.lineWidth = DRAWING_CONFIG.preview.circle.lineWidth;
      ctx.lineCap = DRAWING_CONFIG.completed.circle.lineCap;
      ctx.lineJoin = DRAWING_CONFIG.completed.circle.lineJoin;
      ctx.setLineDash(DRAWING_CONFIG.preview.circle.dashPattern);

      ctx.beginPath();
      ctx.arc(circleStartPoint.x, circleStartPoint.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [drawings, drawingsVisible, trendlineFirstPoint, trendlinePreviewPoint, isDrawingCircle, circleStartPoint, circleCurrentPoint]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 🎯 TRENDLINE: Click handler
  const handleTrendlineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const point: CanvasPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    if (!trendlineFirstPoint) {
      // Click lần 1: Đánh dấu điểm đầu
      setTrendlineFirstPoint(point);
      setTrendlinePreviewPoint(point);
    } else {
      // Click lần 2: Hoàn thành drawing
      const newDrawing: any = {
        id: `simpleLine_${Date.now()}`,
        type: 'simpleLine',
        points: [trendlineFirstPoint, point],
        visible: true,
        locked: false,
        createdAt: Date.now(),
        color: DRAWING_CONFIG.completed.trendline.color,
        lineWidth: DRAWING_CONFIG.completed.trendline.lineWidth,
      };

      onDrawingComplete(newDrawing);

      // Reset
      setTrendlineFirstPoint(null);
      setTrendlinePreviewPoint(null);
    }

    e.preventDefault();
    e.stopPropagation();
  };

  // 🎯 TRENDLINE: Mouse move handler (update preview)
  const handleTrendlineMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trendlineFirstPoint) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const point: CanvasPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    setTrendlinePreviewPoint(point);
  };

  // 🎯 CIRCLE: Mouse down (bắt đầu drag)
  const handleCircleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const point: CanvasPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    setIsDrawingCircle(true);
    setCircleStartPoint(point);
    setCircleCurrentPoint(point);

    e.preventDefault();
    e.stopPropagation();
  };

  // 🎯 CIRCLE: Mouse move (kéo để tạo bán kính)
  const handleCircleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingCircle || !circleStartPoint) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const point: CanvasPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    setCircleCurrentPoint(point);

    e.preventDefault();
    e.stopPropagation();
  };

  // 🎯 CIRCLE: Mouse up (hoàn thành)
  const handleCircleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingCircle || !circleStartPoint) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const endPoint: CanvasPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const newDrawing: any = {
      id: `circle_${Date.now()}`,
      type: 'circle',
      points: [circleStartPoint, endPoint],
      visible: true,
      locked: false,
      createdAt: Date.now(),
      color: DRAWING_CONFIG.completed.circle.strokeColor,
      lineWidth: DRAWING_CONFIG.completed.circle.lineWidth,
      fillColor: DRAWING_CONFIG.completed.circle.fillColor,
    };

    onDrawingComplete(newDrawing);

    // Reset
    setIsDrawingCircle(false);
    setCircleStartPoint(null);
    setCircleCurrentPoint(null);

    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseLeave = () => {
    // Circle: Cancel nếu đang drag
    if (isDrawingCircle) {
      setIsDrawingCircle(false);
      setCircleStartPoint(null);
      setCircleCurrentPoint(null);
    }
    // Trendline: Giữ nguyên preview khi chuột rời khỏi canvas
  };

  const isInteractive = activeTool === 'simpleLine' || activeTool === 'circle';

  const getCursor = () => {
    if (isInteractive) return 'crosshair';
    return 'default';
  };

  // 🎯 Event handlers theo tool
  const handleClick = activeTool === 'simpleLine' ? handleTrendlineClick : undefined;
  const handleMove = activeTool === 'simpleLine' ? handleTrendlineMove : 
                     activeTool === 'circle' ? handleCircleMouseMove : undefined;
  const handleMouseDown = activeTool === 'circle' ? handleCircleMouseDown : undefined;
  const handleMouseUp = activeTool === 'circle' ? handleCircleMouseUp : undefined;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        zIndex: isInteractive ? 100 : 10,
        pointerEvents: isInteractive ? 'auto' : 'none',
        cursor: getCursor(),
      }}
      onClick={handleClick}
      onMouseMove={handleMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
    </div>
  );
}
// src/types/drawing.types.ts

export type DrawingToolType = 
  | 'cursor'              
  | 'simpleLine'          
  | 'circle'              
  | 'priceLevel'          
  | 'trendLine'           
  | 'fibonacciRetracement' // Fibonacci Retracement
  | 'rectangle'           
  | 'horizontalLine'      
  | 'rayLine'             
  | 'parallelChannel'     
  | 'text';               

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface DrawingPoint {
  timestamp: number;
  value: number;
}

export interface FreeDrawing {
  id: string;
  type: 'simpleLine' | 'circle';
  points: CanvasPoint[];
  color: string;
  lineWidth: number;
  visible: boolean;
  locked: boolean;
  createdAt: number;
}

export interface BaseDrawing {
  id: string;
  type: DrawingToolType;
  points: DrawingPoint[];
  style?: {
    color?: string;
    lineWidth?: number;
    dashStyle?: 'solid' | 'dashed';
  };
  locked?: boolean;
  visible?: boolean;
  createdAt: number;
}

export interface PriceLevelPoint {
  price: number;
  timestamp: number;
  percentage: number | null;
}

export interface PriceLevelDrawing extends BaseDrawing {
  type: 'priceLevel';
  levels: PriceLevelPoint[];
}

// 🆕 Fibonacci point
export interface FibonacciPoint {
  price: number;
  timestamp: number;
}

export interface DrawingState {
  drawings: BaseDrawing[];
  freeDrawings: FreeDrawing[];
  activeTool: DrawingToolType;
  magnetMode: boolean;
  drawingsLocked: boolean;
  drawingsVisible: boolean;
  tempDrawing: BaseDrawing | null;
  priceLevels?: PriceLevelPoint[];
  // 🆕 Fibonacci state
  fibonacciHigh?: FibonacciPoint | null;
  fibonacciLow?: FibonacciPoint | null;
}
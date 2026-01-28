export type LayoutType = 
  | '1x1'           // 1 chart
  | '1x2'           // 2 charts horizontal (side by side)
  | '2x1'           // 2 charts vertical (top and bottom)
  | '2top-1bottom'  // 3 charts: 2 on top, 1 on bottom
  | '1top-2bottom'  // 3 charts: 1 on top, 2 on bottom
  | '2x2';          // 4 charts grid

export interface ChartConfig {
  id: string;
  symbol: string;
  interval: string;
  position: {
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
  };
}

export interface LayoutConfig {
  type: LayoutType;
  charts: ChartConfig[];
  rows: number;
  cols: number;
}

export const LAYOUT_PRESETS: Record<LayoutType, Omit<LayoutConfig, 'charts'>> = {
  '1x1': { type: '1x1', rows: 1, cols: 1 },
  '1x2': { type: '1x2', rows: 1, cols: 2 },
  '2x1': { type: '2x1', rows: 2, cols: 1 },
  '2top-1bottom': { type: '2top-1bottom', rows: 2, cols: 2 },
  '1top-2bottom': { type: '1top-2bottom', rows: 2, cols: 2 },
  '2x2': { type: '2x2', rows: 2, cols: 2 },
};

// Helper to get available layouts for a chart count
export const LAYOUT_OPTIONS_BY_COUNT: Record<number, LayoutType[]> = {
  1: ['1x1'],
  2: ['1x2', '2x1'],
  3: ['2top-1bottom', '1top-2bottom'],
  4: ['2x2'],
};
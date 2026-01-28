import { Plus_Jakarta_Sans } from 'next/font/google';
import React, { useState, useRef, useEffect } from 'react';
import {
  FunctionSquare,
  Globe,
  Settings,
  Camera,
  Maximize,
  ChevronDown,
  CandlestickChart,
  LineChart,
  BarChart3,
  AreaChart,
} from 'lucide-react';

interface ChartToolbarProps {
  symbol: string;
  timeframe: string;
  chartType: string;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (tf: string) => void;
  onChartTypeChange: (type: string) => void;
  onIndicatorClick?: () => void;
}

const pjs = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['500', '600', '700'], 
});

export function ChartToolbar({
  symbol,
  timeframe,
  chartType,
  onSymbolChange,
  onTimeframeChange,
  onChartTypeChange,
  onIndicatorClick
}: ChartToolbarProps) {

  const timeframes = ['1s', '1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w'];
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];
  
  const chartTypes = [
    {
      value: 'candle_solid',
      label: 'Candles',
      icon: <CandlestickChart className="w-4 h-4" />,
    },
    {
      value: 'area',
      label: 'Line',
      icon: <LineChart className="w-4 h-4" />,
    },
    {
      value: 'ohlc',
      label: 'Bars',
      icon: <BarChart3 className="w-4 h-4" />,
    },
    {
      value: 'area_binance',
      label: 'Area',
      icon: <AreaChart className="w-4 h-4" />,
    },
  ];

  const [symbolOpen, setSymbolOpen] = useState(false);
  const [chartTypeOpen, setChartTypeOpen] = useState(false);
  
  const symbolRef = useRef<HTMLDivElement>(null);
  const chartTypeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (symbolRef.current && !symbolRef.current.contains(e.target as Node)) {
        setSymbolOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (chartTypeRef.current && !chartTypeRef.current.contains(e.target as Node)) {
        setChartTypeOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getCurrentChartType = () => {
    const current = chartTypes.find(ct => ct.value === chartType);
    return current || chartTypes[0];
  };

  return (
    <div className={`${pjs.className} font-bold bg-white border-b border-gray-200 px-4 h-10 flex items-center`}>
      
      {/* LEFT */}
      <div className="flex items-center gap-4">
        
        {/* SYMBOL DROPDOWN */}
        <div className="relative" ref={symbolRef}>
          <button
            onClick={() => setSymbolOpen(v => !v)}
            className="text-[17px] text-black font-bold px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-1"
          >
            {symbol.replace('USDT', '')}
            <ChevronDown className="w-3 h-3" />
          </button>

          {symbolOpen && (
            <div className="absolute left-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-md z-50">
              {symbols.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    onSymbolChange(s);
                    setSymbolOpen(false);
                  }}
                  className={`w-full text-left text-black px-3 py-1.5 text-sm hover:bg-gray-100 ${
                    symbol === s ? 'bg-blue-50 text-blue-600' : ''
                  }`}
                >
                  {s.replace('USDT', '')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-gray-200" />

        {/* TIMEFRAMES */}
        <div className="flex items-center gap-1">
          {timeframes.map(tf => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-2 py-1 text-xs font-bold rounded ${
                timeframe === tf
                  ? 'bg-gray-300 text-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-gray-200" />

        {/* CHART TYPE SELECTOR */}
        <div className="relative" ref={chartTypeRef}>
          <button
            onClick={() => setChartTypeOpen(v => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-100 text-[11.5px] text-gray-700"
            title="Chọn loại biểu đồ"
          >
            <span className="text-base">{getCurrentChartType().icon}</span>
            <span>{getCurrentChartType().label}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {chartTypeOpen && (
            <div className="absolute left-0 mt-1 w-36 bg-white border border-gray-200 rounded shadow-md z-50">
              {chartTypes.map(ct => (
                <button
                  key={ct.value}
                  onClick={() => {
                    onChartTypeChange(ct.value);
                    setChartTypeOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 ${
                    chartType === ct.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                  }`}
                >
                  <span className="text-base">{ct.icon}</span>
                  <span>{ct.label}</span>
                  {chartType === ct.value && (
                    <span className="ml-auto text-blue-600">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-1 text-[11.5px] text-gray-700">

        <div className="h-10 w-px bg-gray-200 mx-3" />
        
        <button 
          onClick={onIndicatorClick}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100"
        >
          <FunctionSquare className="w-4 h-4" />
          <span>Indicator</span>
        </button>

        <div className="h-10 w-px bg-gray-200 mx-3" />

        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
          <Globe className="w-4 h-4" />
          <span>Timezone</span>
        </button>

        <div className="h-10 w-px bg-gray-200 mx-3" />

        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
          <Settings className="w-4 h-4" />
          <span>Setting</span>
        </button>

        <div className="h-10 w-px bg-gray-200 mx-3" />

        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
          <Camera className="w-4 h-4" />
          <span>Screenshot</span>
        </button>

        <div className="h-10 w-px bg-gray-200 mx-3" />

        <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100">
          <Maximize className="w-4 h-4" />
          <span>Full Screen</span>
        </button>
      </div>
    </div>
  );
}
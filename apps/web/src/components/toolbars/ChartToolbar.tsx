// src/components/toolbars/ChartToolbar.tsx
import { Plus_Jakarta_Sans } from 'next/font/google';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FunctionSquare,
  Globe,
  Settings,
  Camera,
  Maximize,
  Minimize,
  ChevronDown,
  CandlestickChart,
  LineChart,
  BarChart3,
  AreaChart,
  Check,
  X,
} from 'lucide-react';
import {
  ChartSettings,
  DEFAULT_CHART_SETTINGS,
} from '../../hooks/useChartSettings';

interface ChartToolbarProps {
  symbol: string;
  timeframe: string;
  chartType: string;
  chartContainerRef?: React.RefObject<HTMLDivElement | null>;
  settings: ChartSettings;
  selectedTimezone: string;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (tf: string) => void;
  onTimezoneChange: (tz: string) => void;
  onChartTypeChange: (type: string) => void;
  onSettingsChange: (s: ChartSettings) => void;
  onIndicatorClick?: () => void;
}

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

// ─── Toast ──────────────────────────────────────────────
function ScreenshotToast({
  message,
  filePath,
  onClose,
}: {
  message: string;
  filePath?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-slide-up">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-[320px] w-full">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4 text-green-600" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-gray-800">
                {message}
              </span>
              {filePath && (
                <span className="text-xs text-gray-500 break-all">
                  📁 {filePath}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 h-0.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full animate-toast-progress" />
        </div>
      </div>
    </div>
  );
}

// ─── Timezone ───────────────────────────────────────────
const TIMEZONES = [
  { label: 'UTC (GMT+0)', value: 'UTC', offset: '+00:00' },
  { label: 'Ho Chi Minh (GMT+7)', value: 'Asia/Ho_Chi_Minh', offset: '+07:00' },
  { label: 'Shanghai (GMT+8)', value: 'Asia/Shanghai', offset: '+08:00' },
  { label: 'Tokyo (GMT+9)', value: 'Asia/Tokyo', offset: '+09:00' },
  { label: 'Seoul (GMT+9)', value: 'Asia/Seoul', offset: '+09:00' },
  { label: 'Singapore (GMT+8)', value: 'Asia/Singapore', offset: '+08:00' },
  { label: 'Dubai (GMT+4)', value: 'Asia/Dubai', offset: '+04:00' },
  { label: 'Mumbai (GMT+5:30)', value: 'Asia/Kolkata', offset: '+05:30' },
  { label: 'London (GMT+0)', value: 'Europe/London', offset: '+00:00' },
  { label: 'Frankfurt (GMT+1)', value: 'Europe/Berlin', offset: '+01:00' },
  { label: 'Moscow (GMT+3)', value: 'Europe/Moscow', offset: '+03:00' },
  { label: 'New York (GMT-5)', value: 'America/New_York', offset: '-05:00' },
  { label: 'Chicago (GMT-6)', value: 'America/Chicago', offset: '-06:00' },
  {
    label: 'Los Angeles (GMT-8)',
    value: 'America/Los_Angeles',
    offset: '-08:00',
  },
];

// ─── Settings Panel ─────────────────────────────────────
function SettingsPanel({
  settings,
  onSettingsChange,
  onClose,
}: {
  settings: ChartSettings;
  onSettingsChange: (s: ChartSettings) => void;
  onClose: () => void;
}) {
  const Toggle = ({ on, toggle }: { on: boolean; toggle: () => void }) => (
    <button
      onClick={toggle}
      className={`relative w-9 h-5 rounded-full transition-colors ${on ? 'bg-blue-500' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : ''}`}
      />
    </button>
  );

  const rows = [
    {
      label: 'Show Grid Lines',
      on: settings.showGrid,
      key: 'showGrid' as const,
    },
    {
      label: 'Show Crosshair',
      on: settings.showCrosshair,
      key: 'showCrosshair' as const,
    },
    {
      label: 'Show High/Low Mark',
      on: settings.showPriceMark,
      key: 'showPriceMark' as const,
    },
  ];

  return (
    <div
      className={`absolute left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-4 ${pjs.className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-800">
          Chart Settings
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="border-t border-gray-100 mb-3" />

      {/* Toggles */}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between">
            <span className="text-xs text-gray-600 font-medium">{r.label}</span>
            <Toggle
              on={r.on}
              toggle={() => onSettingsChange({ ...settings, [r.key]: !r.on })}
            />
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 my-3" />

      {/* Colors */}
      <div className="mt-3 space-y-2">
        {[
          { label: 'Up (Bullish)', key: 'candleUpColor' as const },
          { label: 'Down (Bearish)', key: 'candleDownColor' as const },
        ].map((c) => (
          <div key={c.key} className="flex items-center justify-between">
            <span className="text-xs text-gray-600 font-medium">{c.label}</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings[c.key]}
                onChange={(e) =>
                  onSettingsChange({ ...settings, [c.key]: e.target.value })
                }
                className="w-7 h-7 rounded cursor-pointer border border-gray-200"
              />
              <span className="text-xs text-gray-400 font-medium">
                {settings[c.key]}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 my-3" />

      {/* Bar spacing */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-700 font-medium">Bar Spacing</span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="4"
            max="40"
            value={settings.barSpace}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                barSpace: Number(e.target.value),
              })
            }
            className="w-24 accent-blue-500"
          />
          <span className="text-xs text-gray-500 w-6 text-right">
            {settings.barSpace}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-100 mt-3 pt-3">
        <button
          onClick={() => onSettingsChange(DEFAULT_CHART_SETTINGS)}
          className="w-full text-xs text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded py-1.5 transition-colors"
        >
          Reset to Default
        </button>
      </div>
    </div>
  );
}

// ─── Main Toolbar ───────────────────────────────────────
export function ChartToolbar({
  symbol,
  timeframe,
  chartType,
  chartContainerRef,
  settings,
  selectedTimezone,
  onSymbolChange,
  onTimeframeChange,
  onChartTypeChange,
  onTimezoneChange,
  onSettingsChange,
  onIndicatorClick,
}: ChartToolbarProps) {
  const timeframes = ['1s', '1m', '5m', '15m', '1h', '2h', '4h', '1d', '1w'];

  const chartTypes = [
    {
      value: 'candle_solid',
      label: 'Candles',
      icon: <CandlestickChart className="w-4 h-4" />,
    },
    { value: 'area', label: 'Line', icon: <LineChart className="w-4 h-4" /> },
    { value: 'ohlc', label: 'Bars', icon: <BarChart3 className="w-4 h-4" /> },
    {
      value: 'area_binance',
      label: 'Area',
      icon: <AreaChart className="w-4 h-4" />,
    },
  ];

  const [chartTypeOpen, setChartTypeOpen] = useState(false);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    filePath?: string;
  } | null>(null);

  const chartTypeRef = useRef<HTMLDivElement>(null);
  const timezoneRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (chartTypeRef.current && !chartTypeRef.current.contains(t))
        setChartTypeOpen(false);
      if (timezoneRef.current && !timezoneRef.current.contains(t))
        setTimezoneOpen(false);
      if (settingsRef.current && !settingsRef.current.contains(t))
        setSettingsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Track native fullscreen exit (Esc key)
  useEffect(() => {
    const onFS = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFS);
    return () => document.removeEventListener('fullscreenchange', onFS);
  }, []);

  // ── Fullscreen ──
  const handleFullscreen = useCallback(async () => {
    const target = chartContainerRef?.current ?? document.documentElement;
    try {
      if (!document.fullscreenElement) {
        await target.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, [chartContainerRef]);

  // ── Screenshot (native canvas, no html2canvas) ──
  const handleScreenshot = useCallback(async () => {
    const container = chartContainerRef?.current;
    if (!container) {
      setToast({ message: 'No chart container found.' });
      return;
    }
    try {
      const canvases = Array.from(
        container.querySelectorAll<HTMLCanvasElement>('canvas'),
      );
      if (canvases.length === 0) {
        setToast({ message: 'No canvas element found.' });
        return;
      }

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const off = document.createElement('canvas');
      off.width = rect.width * dpr;
      off.height = rect.height * dpr;
      const ctx = off.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);

      for (const c of canvases) {
        const cr = c.getBoundingClientRect();
        ctx.drawImage(
          c,
          cr.left - rect.left,
          cr.top - rect.top,
          cr.width,
          cr.height,
        );
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `${symbol}_${timeframe}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

      off.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setToast({
          message: 'Screenshot downloaded!',
          filePath: `Downloads/${name}`,
        });
      }, 'image/png');
    } catch (err) {
      console.error('Screenshot error:', err);
      setToast({ message: 'Screenshot failed.' });
    }
  }, [chartContainerRef, symbol, timeframe]);

  const current =
    chartTypes.find((ct) => ct.value === chartType) || chartTypes[0];

  // ── Shared button style ──
  const btn =
    'flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer';
  const divider = <div className="h-6 w-px bg-gray-200 mx-1 flex-shrink-0" />;

  return (
    <>
      {toast && (
        <ScreenshotToast
          message={toast.message}
          filePath={toast.filePath}
          onClose={() => setToast(null)}
        />
      )}

      <div
        className={`${pjs.className} font-bold bg-white border-b border-gray-200 px-4 h-10 flex items-center gap-1 text-[11.5px] text-gray-700`}
      >
        {/* Timeframes */}
        <div className="flex items-center gap-0.5">
          {timeframes.map((tf) => (
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

        {divider}

        {/* Chart type */}
        <div className="relative" ref={chartTypeRef}>
          <button onClick={() => setChartTypeOpen((v) => !v)} className={btn}>
            {current.icon}
            <span>{current.label}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {chartTypeOpen && (
            <div className="absolute left-0 mt-1 w-36 bg-white border border-gray-200 rounded shadow-md z-50">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Select Type
                </span>
              </div>
              {chartTypes.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => {
                    onChartTypeChange(ct.value);
                    setChartTypeOpen(false);
                  }}
                  className={`w-full font-medium text-left px-3 py-2 text-[12px] text-light hover:bg-gray-100 flex items-center gap-2 ${
                    chartType === ct.value
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700'
                  }`}
                >
                  {ct.icon}
                  <span>{ct.label}</span>
                  {chartType === ct.value && (
                    <span className="ml-auto text-blue-600"></span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {divider}

        {/* Indicator */}
        <button onClick={onIndicatorClick} className={btn}>
          <FunctionSquare className="w-4 h-4" />
          <span>Indicator</span>
          <ChevronDown className="w-3 h-3" />
        </button>

        {divider}

        {/* Timezone */}
        <div className="relative" ref={timezoneRef}>
          <button onClick={() => setTimezoneOpen((v) => !v)} className={btn}>
            <Globe className="w-4 h-4" />
            <span>Timezone</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {timezoneOpen && (
            <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Select Timezone
                </span>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {TIMEZONES.map((tz) => (
                  <button
                    key={tz.value}
                    onClick={() => {
                      onTimezoneChange(tz.value); // ← Dùng callback từ props
                      setTimezoneOpen(false);
                    }}
                    className={`w-full font-medium text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between ${
                      selectedTimezone === tz.value ? 'bg-blue-50' : '' // ← Dùng prop selectedTimezone
                    }`}
                  >
                    <span
                      className={
                        selectedTimezone === tz.value // ← Dùng prop selectedTimezone
                          ? 'text-blue-600 font-semibold'
                          : 'text-gray-700'
                      }
                    >
                      {tz.label}
                    </span>
                    <span className="text-gray-400 font-medium">
                      {tz.offset}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {divider}

        {/* Settings */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={`${btn} ${settingsOpen ? 'bg-gray-100' : ''}`}
          >
            <Settings className="w-4 h-4" />
            <span>Setting</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {settingsOpen && (
            <SettingsPanel
              settings={settings}
              onSettingsChange={onSettingsChange}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>

        {divider}

        {/* Screenshot */}
        <button onClick={handleScreenshot} className={btn}>
          <Camera className="w-4 h-4" />
          <span>Screenshot</span>
        </button>

        {divider}

        {/* Fullscreen */}
        <button onClick={handleFullscreen} className={btn}>
          {isFullscreen ? (
            <>
              <Minimize className="w-4 h-4" />
              <span>Exit Full</span>
            </>
          ) : (
            <>
              <Maximize className="w-4 h-4" />
              <span>Full Screen</span>
            </>
          )}
        </button>
      </div>
    </>
  );
}

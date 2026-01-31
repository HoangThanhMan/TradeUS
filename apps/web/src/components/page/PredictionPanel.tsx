// src/components/dashboard/PredictionPanel.tsx

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  predictionService,
  PredictionResponse,
  ModelInfo,
} from '../../services/prediction.service';
import type { PriceMessage } from '../../types/trading.types';
import { Plus_Jakarta_Sans } from 'next/font/google';
import {
  IconBolt,
  IconBrain,
  IconCircleFilled,
  IconMinus,
  IconRefresh,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

interface PredictionPanelProps {
  symbol: string;
  interval?: string;
  currentPrice: PriceMessage | null;
  onClose: () => void;
}

export function PredictionPanel({
  symbol,
  interval = '1h',
  currentPrice,
  onClose,
}: PredictionPanelProps) {
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchPrediction = useCallback(async () => {
    if (!isLive) return;

    setLoading(true);
    setError(null);

    try {
      const [predictionData, modelData] = await Promise.all([
        predictionService.getPrediction(symbol, interval),
        predictionService.getModelInfo(),
      ]);

      setPrediction(predictionData);
      setModelInfo(modelData);
      setLastUpdate(new Date());
    } catch (err: any) {
      console.error('Failed to fetch prediction:', err);
      const errorMsg =
        err?.detail?.message || err?.message || 'Failed to fetch prediction';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval, isLive]);

  useEffect(() => {
    fetchPrediction();

    // Refresh prediction every 30 seconds when live
    const refreshInterval = setInterval(() => {
      if (isLive) {
        fetchPrediction();
      }
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, [fetchPrediction, isLive]);

  // Refetch when symbol or interval changes
  useEffect(() => {
    fetchPrediction();
  }, [symbol, interval]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const getSignalColor = (signal: string) => {
    const s = signal.toLowerCase();

    if (
      s.includes('strong buy') ||
      s.includes('bullish') ||
      s.includes('buy')
    ) {
      return {
        bg: 'bg-green-50',
        text: 'text-green-600',
        border: 'border-green-200',
        icon: <IconTrendingUp size={16} />,
      };
    }

    if (
      s.includes('strong sell') ||
      s.includes('bearish') ||
      s.includes('sell')
    ) {
      return {
        bg: 'bg-red-50',
        text: 'text-red-600',
        border: 'border-red-200',
        icon: <IconTrendingDown size={16} />,
      };
    }

    return {
      bg: 'bg-gray-50',
      text: 'text-gray-600',
      border: 'border-gray-200',
      icon: <IconMinus size={14} />,
    };
  };

  return (
    <div
      className={`w-80 bg-white border-l border-gray-200 flex flex-col h-full ${pjs.className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconBrain size={18} stroke={1.8} className="text-gray-900" />
          <h3 className="font-semibold text-[14px] text-gray-900">
            ML Prediction
          </h3>
        </div>

        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && !prediction ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <span className="text-2xl mb-2">⚠️</span>
            <span className="text-red-500 text-sm">{error}</span>
            <button
              onClick={fetchPrediction}
              className="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : prediction ? (
          <div className="space-y-4">
            {/* Main Prediction Card */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              {/* Title & Live Badge */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col w-full">
                  <div className="flex w-full justify-between items-center">
                    <h4 className="font-semibold text-gray-900 text-[14px]">
                      {symbol} Prediction
                    </h4>{' '}
                    <div>
                      {' '}
                      <button
                        onClick={() => setIsLive(!isLive)}
                        className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}
                        title={isLive ? 'Pause updates' : 'Resume updates'}
                      />{' '}
                      <span
                        className={`text-[11px] font-medium ${isLive ? 'text-green-500' : 'text-gray-400'}`}
                      >
                        {isLive ? 'Live' : 'Paused'}
                      </span>{' '}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11.5px] text-gray-500">
                    <span>Interval: {prediction.interval}</span>

                    <span className="flex items-center gap-1 text-[11px]">
                      <IconBolt size={12} className="text-yellow-500" />
                      AI-Powered Forecast
                    </span>
                  </div>
                </div>
              </div>

              {/* Prices */}
              <div className="space-y-3">
                {/* Current Price */}
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <span className="relative flex w-5 h-5 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-gray-300 opacity-40 animate-ping" />
                      <IconCircleFilled
                        size={8}
                        className="relative text-gray-500"
                      />
                    </span>

                    <span className="text-[12px] font-semibold">
                      Current price
                    </span>
                  </div>
                  <span className="font-semibold text-gray-900">
                    ${formatPrice(prediction.current_price)}
                  </span>
                </div>

                {/* Predicted Price */}
                <div
                  className={`p-3 rounded-lg border ${
                    prediction.price_change_percent < 0
                      ? 'bg-red-50 border-red-200'
                      : 'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    {/* Left: label + arrow */}
                    <div className="flex flex-row items-center gap-1">
                      <span className="text-[12px] font-semibold text-gray-500">
                        Predicted price
                      </span>
                      {prediction.price_change_percent < 0 ? (
                        <IconTrendingDown
                          size={14}
                          className="mt-0.5 text-red-500"
                        />
                      ) : (
                        <IconTrendingUp
                          size={14}
                          className="mt-0.5 text-green-500"
                        />
                      )}{' '}
                    </div>
                    {/* Right: price + % */}
                    <div className="text-right">
                      <span
                        className={`text-lg font-bold leading-none ${
                          prediction.price_change_percent < 0
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}
                      >
                        ${formatPrice(prediction.predicted_price)}
                      </span>

                      <div
                        className={`mt-0.5 text-[11px] ${
                          prediction.price_change_percent < 0
                            ? 'text-red-500'
                            : 'text-green-500'
                        }`}
                      >
                        {prediction.price_change_percent > 0 ? '+' : ''}
                        {prediction.price_change_percent.toFixed(4)}% (
                        {prediction.price_change > 0 ? '+' : ''}
                        {prediction.price_change.toFixed(2)})
                      </div>
                    </div>{' '}
                  </div>
                </div>
              </div>

              {/* Signal */}
              {(() => {
                const colors = getSignalColor(prediction.signal);
                return (
                  <div
                    className={`mt-2 py-2 px-4 rounded-lg ${colors.bg} border ${colors.border}
    flex items-center justify-center gap-2`}
                  >
                    <span className={colors.text}>{colors.icon}</span>
                    <span className={`font-semibold text-sm ${colors.text}`}>
                      {prediction.signal}
                    </span>
                  </div>
                );
              })()}

              {/* Message */}
              <p className="mt-3 text-xs text-gray-500 text-center">
                {prediction.message}
              </p>
            </div>

            {/* Sentiment */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500">
                  Market Sentiment
                </span>
                <span
                  className={`text-xs font-bold ${
                    prediction.sentiment > 0.1
                      ? 'text-green-600'
                      : prediction.sentiment < -0.1
                        ? 'text-red-600'
                        : 'text-gray-600'
                  }`}
                >
                  {prediction.sentiment > 0 ? '+' : ''}
                  {(prediction.sentiment * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 relative">
                <div className="absolute left-1/2 w-0.5 h-2 bg-gray-400" />
                <div
                  className={`absolute h-2 rounded-full transition-all duration-500 ${
                    prediction.sentiment > 0 ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  style={{
                    left:
                      prediction.sentiment >= 0
                        ? '50%'
                        : `${50 + prediction.sentiment * 50}%`,
                    width: `${Math.abs(prediction.sentiment) * 50}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                <span>Bearish</span>
                <span>Neutral</span>
                <span>Bullish</span>
              </div>
            </div>

            {/* Model Info */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <h5 className="text-xs font-semibold text-gray-500 mb-2">
                Model Information
              </h5>
              <div className="space-y-2 text-xs">
                {modelInfo && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Status</span>
                      <span
                        className={`font-medium ${modelInfo.loaded ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {modelInfo.loaded ? '✓ Loaded' : '✗ Not Loaded'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Window Size</span>
                      <span className="text-gray-700 font-medium">
                        {modelInfo.window_size} candles
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Device</span>
                      <span className="text-gray-700 font-medium uppercase">
                        {modelInfo.device}
                      </span>
                    </div>
                    {modelInfo.extra_info?.rmse && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">RMSE</span>
                        <span className="text-gray-700 font-medium">
                          ${modelInfo.extra_info.rmse.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Updated</span>
                  <span className="text-gray-700 font-medium">
                    {lastUpdate ? lastUpdate.toLocaleTimeString() : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Features Used */}
            {modelInfo && modelInfo.feature_cols.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <h5 className="text-xs font-semibold text-gray-500 mb-2">
                  Features Used
                </h5>
                <div className="flex flex-wrap gap-1">
                  {modelInfo.feature_cols.map((feature) => (
                    <span
                      key={feature}
                      className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={fetchPrediction}
              disabled={loading}
              className="w-full py-2 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg text-sm font-medium
             hover:from-red-600 hover:to-orange-600 transition-all disabled:opacity-50
             flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Refreshing...
                </>
              ) : (
                <>
                  <IconRefresh size={16} stroke={2} />
                  Refresh Prediction
                </>
              )}
            </button>

            {/* Disclaimer */}
            <div className="text-xs text-gray-400 text-center italic">
              ⚠️ This prediction is for informational purposes only. Not
              financial advice.
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <span className="text-2xl mb-2">🤖</span>
            <span>No prediction available</span>
          </div>
        )}
      </div>
    </div>
  );
}

// app/backtest/components/ColorPicker.tsx
'use client';

import React, { useState } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';

const pjs = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
});

interface Props {
  selectedColor: string;
  onColorChange: (color: string) => void;
  label?: string;
}

// Predefined color palette
const COLOR_PALETTE = [
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EAB308', name: 'Yellow' },
  { hex: '#22C55E', name: 'Green' },
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#8B5CF6', name: 'Violet' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#EF4444', name: 'Red' },
  { hex: '#06B6D4', name: 'Cyan' },
  { hex: '#84CC16', name: 'Lime' },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#14B8A6', name: 'Teal' },
  { hex: '#F59E0B', name: 'Amber' },
];

export function ColorPicker({ selectedColor, onColorChange, label }: Props) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onColorChange(e.target.value);
  };

  return (
    <div className={`${pjs.className}`}>
      {label && (
        <label className="block text-[11px] font-semibold text-gray-600 mb-2">
          {label}
        </label>
      )}

      <div className="flex items-start gap-3">
        {/* Predefined Colors */}
        <div className="grid grid-cols-6 gap-2">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color.hex}
              type="button"
              onClick={() => {
                onColorChange(color.hex);
                setShowCustomPicker(false);
              }}
              className={`w-10 h-10 rounded-md border-2 transition-all hover:scale-110 hover:shadow-md ${
                selectedColor === color.hex && !showCustomPicker
                  ? 'border-gray-900 scale-110 shadow-lg ring-2 ring-gray-400'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              style={{
                backgroundColor: color.hex,
              }}
              title={color.name}
            />
          ))}
        </div>

        {/* Custom Color Picker */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowCustomPicker(!showCustomPicker)}
            className={`w-10 h-10 rounded-md border-2 transition-all hover:scale-110 hover:shadow-md relative overflow-hidden ${
              showCustomPicker
                ? 'border-gray-900 scale-110 shadow-lg ring-2 ring-gray-400'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            style={{
              background:
                'linear-gradient(135deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
            }}
            title="Custom Color"
          >
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-bold text-gray-700">
              +
            </div>
          </button>

          {showCustomPicker && (
            <input
              type="color"
              value={selectedColor}
              onChange={handleCustomColorChange}
              className="w-10 h-10 rounded-md border-2 border-gray-300 cursor-pointer"
              title="Pick any color"
            />
          )}
        </div>
      </div>

      {/* Selected color display */}
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
        <div
          className="w-5 h-5 rounded border border-gray-300"
          style={{ backgroundColor: selectedColor }}
        />
        <span className="font-medium">
          Selected:{' '}
          {COLOR_PALETTE.find((c) => c.hex === selectedColor)?.name ||
            selectedColor.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

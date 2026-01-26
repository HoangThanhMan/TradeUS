'use client';

import React from 'react';

interface RightToolsProps {
  open: boolean;
}

export function RightTools({ open }: RightToolsProps) {
  return (
    <div
      className={`
        transition-all duration-300 ease-in-out
        ${open ? 'w-12' : 'w-0'}
        bg-white border-l border-gray-200
        flex flex-col items-center py-4 gap-3
        overflow-hidden
      `}
    >
      <button className="w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100">
        📈
      </button>
      <button className="w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100">
        ⚙️
      </button>
      <button className="w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100">
        📷
      </button>
      <button className="w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100">
        ⛶
      </button>
    </div>
  );
}

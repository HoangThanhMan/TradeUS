'use client';

import React, { useEffect } from 'react';

export default function FontLoader({
  geistSans,
  geistMono,
}: {
  geistSans?: string;
  geistMono?: string;
}) {
  useEffect(() => {
    const added: string[] = [];
    // Delay class mutation slightly so it happens well after React hydration
    const id = setTimeout(() => {
      try {
        if (geistSans) {
          document.body.classList.add(geistSans);
          added.push(geistSans);
        }
        if (geistMono) {
          document.body.classList.add(geistMono);
          added.push(geistMono);
        }
      } catch (e) {
        // ignore (e.g., during tests or unsupported environments)
      }
    }, 0);
    return () => {
      clearTimeout(id);
      try {
        added.forEach((c) => document.body.classList.remove(c));
      } catch (e) {}
    };
  }, [geistSans, geistMono]);

  return null;
}

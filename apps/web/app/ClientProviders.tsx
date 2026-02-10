'use client';

import React from 'react';
import { AlertNotificationProvider } from '../src/contexts/AlertNotificationContext';

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AlertNotificationProvider>{children}</AlertNotificationProvider>
  );
}

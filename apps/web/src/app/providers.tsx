'use client';
import { MotionProvider, ThemeProvider, Toaster, TooltipProvider, hydrateSoundPreference } from '@arena/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  useEffect(() => hydrateSoundPreference(), []);
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MotionProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </MotionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
}

export default function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
}: PullToRefreshIndicatorProps) {
  if (pullDistance <= 0 && !isRefreshing) return null;

  const progress = Math.min(1, pullDistance / 60);

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[3000] pointer-events-none transition-transform duration-100 ease-out"
      style={{
        top: `${Math.max(12, pullDistance * 0.7)}px`,
      }}
    >
      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-card/95 border border-border/60 shadow-xl backdrop-blur-md text-xs font-semibold text-foreground">
        {isRefreshing ? (
          <>
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <span>Updating…</span>
          </>
        ) : (
          <>
            <RefreshCw
              className="h-4 w-4 text-primary transition-transform duration-75"
              style={{ transform: `rotate(${progress * 360}deg)` }}
            />
            <span>{pullDistance >= 60 ? 'Release to refresh' : 'Pull to refresh'}</span>
          </>
        )}
      </div>
    </div>
  );
}

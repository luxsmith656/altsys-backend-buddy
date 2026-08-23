import { useEffect, useState, useRef, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<any> | void;
  pullThreshold?: number;
  maxPull?: number;
  disabled?: boolean;
}

export function usePullToRefresh({
  onRefresh,
  pullThreshold = 65,
  maxPull = 110,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || isRefreshing) return;
      if (window.scrollY <= 2) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    },
    [disabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPulling.current || disabled || isRefreshing) return;
      const currentY = e.touches[0].clientY;
      const distance = currentY - startY.current;

      if (distance > 0 && window.scrollY <= 2) {
        // Apply resistance curve
        const pull = Math.min(maxPull, distance * 0.45);
        setPullDistance(pull);
      } else {
        setPullDistance(0);
        isPulling.current = false;
      }
    },
    [disabled, isRefreshing, maxPull]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || disabled) return;
    isPulling.current = false;

    if (pullDistance >= pullThreshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(50); // Keep indicator visible while refreshing
      try {
        await onRefresh();
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 400);
      }
    } else {
      setPullDistance(0);
    }
  }, [disabled, isRefreshing, onRefresh, pullDistance, pullThreshold]);

  useEffect(() => {
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, isRefreshing };
}

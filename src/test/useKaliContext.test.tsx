import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useKaliContext } from '@/hooks/useKaliContext';

describe('useKaliContext', () => {
  it('derives live group guidance from booking facts', () => {
    const { result } = renderHook(() => useKaliContext({ role: 'hiker', groupSize: 6 }));

    expect(result.current.insights).toHaveLength(1);
    expect(result.current.insights[0].kind).toBe('group-guidance');
    expect(result.current.forecastStatus).toBe('unavailable');
  });

  it('reports stale weather explicitly instead of hiding it', () => {
    const { result } = renderHook(() => useKaliContext({
      role: 'guide',
      weather: {
        condition: 'Rain',
        rainProbability: 65,
        fetchedAt: '2026-08-30T03:00:00+08:00',
      },
      now: '2026-08-31T09:00:00+08:00',
    }));

    expect(result.current.forecastStatus).toBe('stale');
    expect(result.current.insights[0].message).toContain('stale');
  });
});

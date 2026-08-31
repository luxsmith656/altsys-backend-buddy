import { useEffect, useMemo, useState } from 'react';
import { buildKaliContext, type KaliContextInput } from '@/lib/kaliContext';

export type ForecastStatus = 'fresh' | 'stale' | 'unavailable';

export function useKaliContext(input: KaliContextInput) {
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!input.booking) return;
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [input.booking?.date]);

  const insights = useMemo(
    () => buildKaliContext({ ...input, now: input.now ?? clock }),
    [input, clock],
  );

  const forecastStatus = useMemo<ForecastStatus>(() => {
    const weather = insights.find((item) => item.kind === 'weather');
    if (!weather) return 'unavailable';
    return weather.meta.forecastStatus === 'stale' ? 'stale' : 'fresh';
  }, [insights]);

  return { insights, forecastStatus };
}

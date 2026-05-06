// Lightweight Prophet-like forecaster (no external deps).
// Decomposition: trend (linear least squares) + weekly seasonality (avg by weekday)
// + event multipliers (holidays / strikes / fires) supplied from events_calendar.
// Designed to learn from whatever data we currently have and improve as data grows.

import { addDays, format, parseISO, startOfWeek, getDay } from 'date-fns';

export interface DailyPoint { date: string; count: number }
export interface EventEffect {
  start_date: string;
  end_date: string;
  effect: 'boost' | 'drop';
  effect_magnitude: number; // 0.0 - 1.0+
  title?: string;
}
export interface ForecastPoint {
  date: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
  components: { trend: number; weekly: number; event: number };
  eventTitles: string[];
}

/** Aggregate raw bookings (rows with booking_date and group_size) into daily series. */
export function aggregateDaily(rows: Array<{ booking_date: string; group_size?: number | null }>): DailyPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.booking_date) continue;
    map.set(r.booking_date, (map.get(r.booking_date) ?? 0) + (r.group_size ?? 1));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

function linearTrend(series: DailyPoint[]) {
  // x = day index, y = count
  const n = series.length;
  if (n === 0) return { slope: 0, intercept: 0, base: parseISO(format(new Date(), 'yyyy-MM-dd')) };
  const base = parseISO(series[0].date);
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  series.forEach((p, i) => {
    sx += i; sy += p.count; sxx += i * i; sxy += i * p.count;
  });
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept, base };
}

function weeklySeasonality(series: DailyPoint[]): number[] {
  // Returns multiplicative factors per weekday (0-6, Sun..Sat) relative to overall mean.
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  let total = 0;
  for (const p of series) {
    const d = getDay(parseISO(p.date));
    sums[d] += p.count;
    counts[d] += 1;
    total += p.count;
  }
  const overall = series.length > 0 ? total / series.length : 0;
  if (overall === 0) return new Array(7).fill(1);
  return sums.map((s, i) => {
    const avg = counts[i] > 0 ? s / counts[i] : overall;
    return avg / overall;
  });
}

function residualStd(series: DailyPoint[], predict: (date: string) => number): number {
  if (series.length < 2) return 1;
  const errs = series.map((p) => p.count - predict(p.date));
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  const variance = errs.reduce((a, b) => a + (b - mean) ** 2, 0) / errs.length;
  return Math.sqrt(Math.max(variance, 0.5));
}

function eventMultiplier(date: string, events: EventEffect[]): { factor: number; titles: string[] } {
  let factor = 1;
  const titles: string[] = [];
  for (const e of events) {
    if (date >= e.start_date && date <= e.end_date) {
      const m = Math.max(0, e.effect_magnitude);
      if (e.effect === 'boost') factor *= 1 + m;
      else factor *= Math.max(0, 1 - m);
      if (e.title) titles.push(e.title);
    }
  }
  return { factor, titles };
}

export function forecast(
  series: DailyPoint[],
  events: EventEffect[],
  horizonDays: number,
): ForecastPoint[] {
  const trend = linearTrend(series);
  const weekly = weeklySeasonality(series);

  const predictBase = (date: string) => {
    const x = Math.round((parseISO(date).getTime() - trend.base.getTime()) / (1000 * 60 * 60 * 24));
    const t = Math.max(0, trend.intercept + trend.slope * x);
    const w = weekly[getDay(parseISO(date))] ?? 1;
    return t * w;
  };
  const sigma = residualStd(series, predictBase);

  const last = series.length > 0 ? parseISO(series[series.length - 1].date) : new Date();
  const out: ForecastPoint[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const d = format(addDays(last, i), 'yyyy-MM-dd');
    const x = Math.round((parseISO(d).getTime() - trend.base.getTime()) / (1000 * 60 * 60 * 24));
    const trendVal = Math.max(0, trend.intercept + trend.slope * x);
    const weeklyFactor = weekly[getDay(parseISO(d))] ?? 1;
    const ev = eventMultiplier(d, events);
    const yhat = Math.max(0, trendVal * weeklyFactor * ev.factor);
    out.push({
      date: d,
      yhat,
      yhat_lower: Math.max(0, yhat - 1.96 * sigma),
      yhat_upper: yhat + 1.96 * sigma,
      components: { trend: trendVal, weekly: weeklyFactor, event: ev.factor },
      eventTitles: ev.titles,
    });
  }
  return out;
}

/** Identify peak month, week, year by total bookings */
export function findPeaks(series: DailyPoint[]) {
  const monthly = new Map<string, number>();
  const weekly = new Map<string, number>();
  const yearly = new Map<string, number>();
  for (const p of series) {
    const d = parseISO(p.date);
    const m = format(d, 'yyyy-MM');
    const w = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-'W'II");
    const y = format(d, 'yyyy');
    monthly.set(m, (monthly.get(m) ?? 0) + p.count);
    weekly.set(w, (weekly.get(w) ?? 0) + p.count);
    yearly.set(y, (yearly.get(y) ?? 0) + p.count);
  }
  const top = (m: Map<string, number>) => {
    let best: [string, number] | null = null;
    m.forEach((v, k) => { if (!best || v > best[1]) best = [k, v]; });
    return best;
  };
  return { peakMonth: top(monthly), peakWeek: top(weekly), peakYear: top(yearly) };
}

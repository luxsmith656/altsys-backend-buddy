import React from 'react';
import { format } from 'date-fns';
import {
  CloudRain,
  Zap,
  CloudFog,
  Sun,
  CloudSun,
  Cloud,
  ThermometerSun,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Compass,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KalisunganDayWeather } from '@/lib/kalisunganWeather';

interface CalendarWeatherAdvisoryProps {
  weather: KalisunganDayWeather | null;
  selectedDate?: Date;
  loading?: boolean;
  className?: string;
}

function WeatherCategoryIcon({ category, className }: { category: KalisunganDayWeather['category']; className?: string }) {
  switch (category) {
    case 'thunderstorm':
      return <Zap className={cn('text-amber-500 fill-amber-500/20', className)} />;
    case 'rain':
      return <CloudRain className={cn('text-blue-500', className)} />;
    case 'fog':
      return <CloudFog className={cn('text-slate-500', className)} />;
    case 'clear':
      return <Sun className={cn('text-amber-500', className)} />;
    case 'cloudy':
    default:
      return <CloudSun className={cn('text-sky-500', className)} />;
  }
}

export function CalendarWeatherAdvisory({
  weather,
  selectedDate,
  loading = false,
  className,
}: CalendarWeatherAdvisoryProps) {
  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border/40 bg-card/60 p-4 animate-pulse space-y-3', className)}>
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="h-10 bg-muted rounded w-full" />
        <div className="h-12 bg-muted rounded w-full" />
      </div>
    );
  }

  if (!weather) {
    return (
      <div className={cn('rounded-xl border border-border/30 bg-secondary/10 p-3.5 text-xs text-muted-foreground', className)}>
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary shrink-0" />
          <span>Select a date within the next 16 days to view live <strong>Mt. Kalisungan</strong> mountain weather and trail safety advisories.</span>
        </div>
      </div>
    );
  }

  const { advisory, maxTempC, minTempC, rainProbability, precipitationMm, condition, category, sourceName, sourceUrl, locationCitation } = weather;

  const levelColor =
    advisory.level === 'danger'
      ? 'border-destructive/40 bg-destructive/5 text-destructive'
      : advisory.level === 'caution'
      ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300'
      : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300';

  const badgeColor =
    advisory.level === 'danger'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : advisory.level === 'caution'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';

  return (
    <div className={cn('rounded-xl border border-border/40 bg-card shadow-sm overflow-hidden text-sm', className)}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-muted/40 border-b border-border/30">
        <div className="flex items-center gap-2">
          <WeatherCategoryIcon category={category} className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-xs tracking-tight">
            Mt. Kalisungan Trail Weather Forecast
            {selectedDate && <span className="text-muted-foreground font-normal"> · {format(selectedDate, 'MMM d, yyyy')}</span>}
          </span>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', badgeColor)}>
          {advisory.badgeLabel}
        </span>
      </div>

      <div className="p-3.5 space-y-3">
        {/* Core metrics row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-secondary/20 p-2 border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Condition</p>
            <p className="text-xs font-bold truncate mt-0.5" title={condition}>{condition}</p>
          </div>
          <div className="rounded-lg bg-secondary/20 p-2 border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Temperature</p>
            <p className="text-xs font-bold tabular-nums mt-0.5">{Math.round(minTempC)}° – {Math.round(maxTempC)}°C</p>
          </div>
          <div className="rounded-lg bg-secondary/20 p-2 border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Rain Chance</p>
            <p className={cn(
              'text-xs font-bold tabular-nums mt-0.5',
              rainProbability >= 60 ? 'text-destructive' : rainProbability >= 30 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'
            )}>
              {rainProbability}% {precipitationMm > 0 ? `(${precipitationMm}mm)` : ''}
            </p>
          </div>
        </div>

        {/* Rain Probability progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CloudRain className="h-3 w-3" /> Precipitation risk
            </span>
            <span className="font-semibold tabular-nums">{rainProbability}%</span>
          </div>
          <div className="w-full h-1.5 bg-secondary/50 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                rainProbability >= 70 ? 'bg-destructive' : rainProbability >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ width: `${Math.max(4, rainProbability)}%` }}
            />
          </div>
        </div>

        {/* Mountain Trail Impact & Safety Advisory */}
        <div className={cn('rounded-lg border p-3 space-y-1.5', levelColor)}>
          <div className="flex items-center gap-1.5 font-bold text-xs">
            {advisory.level === 'danger' ? (
              <ShieldAlert className="h-4 w-4 shrink-0" />
            ) : advisory.level === 'caution' ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <ShieldCheck className="h-4 w-4 shrink-0" />
            )}
            <span>{advisory.headline}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-foreground/90">
            {advisory.trailImpact}
          </p>
          <p className="text-[11px] leading-relaxed font-medium text-foreground/85 pt-1 border-t border-current/20">
            👉 <strong>Action Plan:</strong> {advisory.safetyAdvice}
          </p>
        </div>

        {/* Explicit API Citation & Location Source */}
        <div className="pt-2 border-t border-border/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-semibold text-foreground/75">Data source:</span>
            <span>{sourceName}</span>
            <span>·</span>
            <span>{locationCitation}</span>
          </div>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium shrink-0"
            title="Open-Meteo Weather Forecast Documentation"
          >
            open-meteo.com
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default CalendarWeatherAdvisory;

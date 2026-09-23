import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Zap,
  CloudRain,
  CloudFog,
  CloudSun,
  Sun,
  ThermometerSun,
  Compass,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  Droplets,
  Wind,
  Calendar,
  Mountain,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export interface ForecastDayItem {
  date: string;
  condition: string;
  maxTempC: number;
  minTempC: number;
  rainProbability: number;
  precipitationMm?: number;
  category?: string;
  advisoryBadge?: string;
  trailImpact?: string;
  safetyAdvice?: string;
}

export interface WeatherForecastPredictionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: string;
  condition?: string;
  category?: string;
  minTempC?: number;
  maxTempC?: number;
  rainProbability?: number;
  precipitationMm?: number;
  headline?: string;
  trailImpact?: string;
  safetyAdvice?: string;
  badgeLabel?: string;
  forecastDays?: ForecastDayItem[];
  locationCitation?: string;
  sourceUrl?: string;
}

function WeatherCategoryIcon({ category, className }: { category?: string; className?: string }) {
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

export function WeatherForecastPredictionModal({
  open,
  onOpenChange,
  selectedDate,
  condition = 'Partly Cloudy',
  category = 'cloudy',
  minTempC = 23,
  maxTempC = 30,
  rainProbability = 20,
  precipitationMm = 0,
  headline,
  trailImpact,
  safetyAdvice,
  badgeLabel,
  forecastDays = [],
  locationCitation = 'Mt. Kalisungan, Laguna (14.1475°N, 121.3454°E · 760m)',
  sourceUrl = 'https://www.mountain-forecast.com/peaks/Mount-Kalisungan/forecasts/686',
}: WeatherForecastPredictionModalProps) {
  const [activeDate, setActiveDate] = useState<string | undefined>(selectedDate);

  // Sync activeDate when modal opens or selectedDate changes
  const effectiveActiveDate = activeDate ?? selectedDate ?? (forecastDays.length > 0 ? forecastDays[0].date : undefined);

  // Find active day forecast data if user clicked another day in the multi-day strip
  const activeDayData = useMemo(() => {
    if (!effectiveActiveDate || forecastDays.length === 0) return null;
    return forecastDays.find((d) => d.date === effectiveActiveDate) ?? null;
  }, [effectiveActiveDate, forecastDays]);

  const displayCondition = activeDayData?.condition ?? condition;
  const displayCategory = activeDayData?.category ?? category;
  const displayMinTemp = activeDayData ? Math.round(activeDayData.minTempC) : Math.round(minTempC);
  const displayMaxTemp = activeDayData ? Math.round(activeDayData.maxTempC) : Math.round(maxTempC);
  const displayRain = activeDayData ? Math.round(activeDayData.rainProbability) : Math.round(rainProbability);
  const displayPrecip = activeDayData?.precipitationMm ?? precipitationMm;
  const displayImpact = activeDayData?.trailImpact ?? trailImpact;
  const displayAdvice = activeDayData?.safetyAdvice ?? safetyAdvice;
  const displayBadge = activeDayData?.advisoryBadge ?? badgeLabel ?? (displayRain >= 70 ? 'High Rain Risk' : displayRain >= 40 ? 'Moderate Rain' : 'Favorable Weather');

  const isDanger = displayCategory === 'thunderstorm' || displayRain >= 80;
  const isCaution = !isDanger && (displayCategory === 'rain' || displayCategory === 'fog' || displayRain >= 40);

  const formattedActiveDate = useMemo(() => {
    if (!effectiveActiveDate) return 'Selected Hike Window';
    try {
      return format(parseISO(effectiveActiveDate), 'EEEE, MMMM d, yyyy');
    } catch {
      return effectiveActiveDate;
    }
  }, [effectiveActiveDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-3xl border-border/60 shadow-2xl">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wide uppercase">
            <Mountain className="h-4 w-4" />
            <span>Mt. Kalisungan Weather Prediction</span>
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight">
            Mountain Weather Forecast
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {locationCitation} · High-resolution tropical mountain forecast
          </DialogDescription>
        </DialogHeader>

        {/* Selected / Active Day Forecast Card */}
        <div className={cn(
          'rounded-2xl border p-4 sm:p-5 transition-all space-y-4',
          isDanger
            ? 'border-destructive/40 bg-destructive/5'
            : isCaution
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-emerald-500/40 bg-emerald-500/5',
        )}>
          {/* Top row: Date + Condition Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Forecast for</p>
              <h3 className="text-base sm:text-lg font-bold text-foreground">{formattedActiveDate}</h3>
            </div>
            <span className={cn(
              'px-2.5 py-1 rounded-full text-xs font-bold border',
              isDanger
                ? 'bg-destructive/15 text-destructive border-destructive/30'
                : isCaution
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
            )}>
              {displayBadge}
            </span>
          </div>

          {/* Condition + Primary Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Condition */}
            <div className="p-3 rounded-xl bg-background/80 border border-border/40 flex items-center gap-3">
              <WeatherCategoryIcon category={displayCategory} className="h-7 w-7 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Condition</p>
                <p className="text-xs font-black truncate text-foreground" title={displayCondition}>
                  {displayCondition}
                </p>
              </div>
            </div>

            {/* Temperature */}
            <div className="p-3 rounded-xl bg-background/80 border border-border/40 flex items-center gap-3">
              <ThermometerSun className="h-6 w-6 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Temperature</p>
                <p className="text-xs font-black text-foreground tabular-nums">
                  {displayMinTemp}° – {displayMaxTemp}°C
                </p>
              </div>
            </div>

            {/* Rain Chance */}
            <div className="p-3 rounded-xl bg-background/80 border border-border/40 flex items-center gap-3">
              <CloudRain className={cn('h-6 w-6 shrink-0', displayRain >= 50 ? 'text-destructive' : 'text-blue-500')} />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Rain Chance</p>
                <p className={cn('text-xs font-black tabular-nums', displayRain >= 60 ? 'text-destructive font-bold' : 'text-foreground')}>
                  {displayRain}%
                </p>
              </div>
            </div>

            {/* Precipitation */}
            <div className="p-3 rounded-xl bg-background/80 border border-border/40 flex items-center gap-3">
              <Droplets className="h-6 w-6 shrink-0 text-sky-500" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Precipitation</p>
                <p className="text-xs font-black text-foreground tabular-nums">
                  {displayPrecip > 0 ? `${displayPrecip} mm` : 'Dry'}
                </p>
              </div>
            </div>
          </div>

          {/* Trail Impact & Mountain Hazard Advisory */}
          {(displayImpact || displayAdvice || headline) && (
            <div className="rounded-xl bg-background/90 border border-border/40 p-3.5 space-y-2 text-xs">
              {headline && (
                <div className="flex items-center gap-2 font-bold text-foreground">
                  {isDanger ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  <span>{headline}</span>
                </div>
              )}
              {displayImpact && (
                <p className="text-foreground/90 leading-relaxed">
                  <strong>Trail Impact:</strong> {displayImpact}
                </p>
              )}
              {displayAdvice && (
                <p className="text-foreground/90 leading-relaxed">
                  <strong>Hiker Advisory:</strong> {displayAdvice}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 16-Day Forecast Prediction Strip (if available) */}
        {forecastDays.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>16-Day Weather Prediction Outlook</span>
              </p>
              <span className="text-[10px] text-muted-foreground">Click a date to view its prediction</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {forecastDays.map((day) => {
                const isDaySelected = day.date === effectiveActiveDate;
                let dayLabel = day.date;
                try {
                  dayLabel = format(parseISO(day.date), 'EEE, MMM d');
                } catch {
                  // fallback
                }

                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setActiveDate(day.date)}
                    className={cn(
                      'flex flex-col items-center justify-center min-w-[76px] p-2.5 rounded-xl border text-center transition-all shrink-0',
                      isDaySelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-md scale-105'
                        : 'border-border/40 bg-card hover:border-primary/40 hover:bg-secondary/40 text-foreground',
                    )}
                  >
                    <span className="text-[10px] font-bold">{dayLabel}</span>
                    <WeatherCategoryIcon category={day.category} className="h-4 w-4 my-1" />
                    <span className={cn('text-[10px] font-semibold tabular-nums', isDaySelected ? 'text-primary-foreground/90' : 'text-muted-foreground')}>
                      {Math.round(day.minTempC)}°–{Math.round(day.maxTempC)}°
                    </span>
                    <span className={cn(
                      'text-[9px] font-bold mt-0.5',
                      isDaySelected
                        ? 'text-primary-foreground/90'
                        : day.rainProbability >= 60
                        ? 'text-destructive font-black'
                        : 'text-sky-600 dark:text-sky-400',
                    )}>
                      {day.rainProbability}% rain
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer with Real Mountain Forecast Links & Open-Meteo Citation (No raw API code!) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-primary" />
            <span className="text-[11px]">
              Predictions tuned for Mt. Kalisungan summit ridge & Lamot approaches
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={sourceUrl || "https://www.mountain-forecast.com/peaks/Mount-Kalisungan/forecasts/686"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline underline-offset-2 hover:opacity-80"
            >
              <span>Mountain-Forecast.com (686m Peak)</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://zoom.earth/#view=14.1475,121.3454,12z"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline underline-offset-2 hover:opacity-80"
            >
              <span>Live Rain Radar</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default WeatherForecastPredictionModal;

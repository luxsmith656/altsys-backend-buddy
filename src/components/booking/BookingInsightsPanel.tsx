import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  CloudRain,
  ThermometerSun,
  TriangleAlert,
  Clock,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Sun,
  Cloud,
  CloudDrizzle,
  Zap,
  Loader2,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { HikeType } from '@/lib/hikeSchedule';


export interface WeatherSnapshot {
  maxTempC: number;
  minTempC: number;
  rainProbability: number;
  condition: string;
}

export interface SmartRecommendations {
  bestTime: string;
  highHeat: boolean;
  highRain: boolean;
  groupMessage: string;
  recommendedTimes: string[];
}

interface BookingInsightsPanelProps {
  date?: Date;
  smartGuideEnabled: boolean;
  weatherInsight: WeatherSnapshot | null;
  weatherLoading: boolean;
  weatherError: string | null;
  smartRecommendations: SmartRecommendations | null;
  groupSize: number;
  hikeType: HikeType;
  onToggleSmartGuide: (enabled: boolean) => void;
  onClear: () => void;
}

function WeatherIcon({ condition }: { condition: string }) {
  const lower = condition.toLowerCase();
  if (lower.includes('clear') || lower.includes('sunny'))
    return <Sun className="h-5 w-5 text-amber-400" />;
  if (lower.includes('rain') || lower.includes('shower'))
    return <CloudRain className="h-5 w-5 text-blue-400" />;
  if (lower.includes('drizzle'))
    return <CloudDrizzle className="h-5 w-5 text-sky-400" />;
  if (lower.includes('thunder') || lower.includes('storm'))
    return <Zap className="h-5 w-5 text-yellow-500" />;
  return <Cloud className="h-5 w-5 text-slate-400" />;
}

function RainBar({ value }: { value: number }) {
  const colorClass =
    value > 70
      ? 'bg-destructive'
      : value > 40
      ? 'bg-amber-400'
      : 'bg-emerald-500';

  return (
    <div className="w-full h-2 bg-secondary/60 rounded-full overflow-hidden">
      <motion.div
        className={cn('h-full rounded-full', colorClass)}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
    </div>
  );
}

export default function BookingInsightsPanel({
  date,
  smartGuideEnabled,
  weatherInsight,
  weatherLoading,
  weatherError,
  smartRecommendations,
  groupSize,
  onToggleSmartGuide,
  onClear,
}: BookingInsightsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canClear = weatherInsight !== null || smartGuideEnabled;

  // Badge showing active state for the collapsed indicator
  const hasActiveInsights = smartGuideEnabled && (weatherInsight || weatherLoading);

  return (
    <div className="fixed right-4 top-24 z-20 w-72 hidden xl:block">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-2xl border border-border/40 bg-card/90 backdrop-blur-xl shadow-2xl overflow-hidden"
      >
        {/* ── Header (always visible) — clicking toggles expand/collapse ── */}
        <button
          onClick={() => setIsExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 border-b border-border/20 bg-primary/5 hover:bg-primary/10 transition-colors"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse AI Insights' : 'Expand AI Insights'}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold tracking-wide">AI Insights</span>
            {hasActiveInsights && !isExpanded && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {/* Clear button */}
            {canClear && isExpanded && (
              <button
                onClick={onClear}
                title="Clear insights & turn off Smart Guide"
                aria-label="Clear insights"
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Smart Guide toggle */}
            {isExpanded && (
              <button
                onClick={() => onToggleSmartGuide(!smartGuideEnabled)}
                aria-pressed={smartGuideEnabled}
                className={cn(
                  'flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg transition-all border',
                  smartGuideEnabled
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-secondary/60 text-muted-foreground border-border/30 hover:border-primary/30',
                )}
              >
                {smartGuideEnabled ? (
                  <ToggleRight className="h-3.5 w-3.5" />
                ) : (
                  <ToggleLeft className="h-3.5 w-3.5" />
                )}
                {smartGuideEnabled ? 'ON' : 'OFF'}
              </button>
            )}
            <span className="text-muted-foreground pointer-events-none">
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </div>
        </button>

        {/* ── Collapsible Body ── */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="insights-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="p-3 space-y-3 max-h-[65vh] overflow-y-auto">
                {/* Smart Guide OFF state */}
                {!smartGuideEnabled && (
                  <div className="text-center py-5 space-y-3">
                    <Sparkles className="h-9 w-9 text-primary/30 mx-auto" />
                    <p className="text-xs text-muted-foreground leading-relaxed px-2">
                      Enable Smart Guide to get real-time weather forecasts and AI-powered
                      recommendations for your selected hike date.
                    </p>
                    <Button size="sm" className="text-xs" onClick={() => onToggleSmartGuide(true)}>
                      Enable Smart Guide
                    </Button>
                  </div>
                )}

                {/* Smart Guide ON — no date yet */}
                {smartGuideEnabled && !date && (
                  <div className="text-center py-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      📅 Select a date on the calendar to load the weather forecast and AI
                      recommendations.
                    </p>
                  </div>
                )}

                {/* Smart Guide ON — loading */}
                {smartGuideEnabled && date && weatherLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    Loading forecast for {format(date, 'MMM d')}…
                  </div>
                )}

                {/* Smart Guide ON — error */}
                {smartGuideEnabled && date && weatherError && !weatherLoading && (
                  <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-xl p-2.5">
                    <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{weatherError}</span>
                  </div>
                )}

                {/* Smart Guide ON — forecast loaded */}
                {smartGuideEnabled && date && weatherInsight && !weatherLoading && (
                  <>
                    {/* Date label */}
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                      Forecast · {format(date, 'MMMM d, yyyy')}
                    </div>

                    {/* Weather card */}
                    <div className="rounded-xl bg-background/70 border border-border/20 p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <WeatherIcon condition={weatherInsight.condition} />
                          <span className="text-xs font-semibold truncate">{weatherInsight.condition}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold tabular-nums">
                            {Math.round(weatherInsight.minTempC)}–{Math.round(weatherInsight.maxTempC)}°C
                          </span>
                        </div>
                      </div>

                      {/* Rain probability */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <CloudRain className="h-3 w-3" />
                            Rain probability
                          </div>
                          <span
                            className={cn(
                              'font-bold',
                              weatherInsight.rainProbability > 70
                                ? 'text-destructive'
                                : weatherInsight.rainProbability > 40
                                ? 'text-amber-500'
                                : 'text-emerald-500',
                            )}
                          >
                            {Math.round(weatherInsight.rainProbability)}%
                          </span>
                        </div>
                        <RainBar value={weatherInsight.rainProbability} />
                      </div>

                      {/* Heat indicator */}
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <ThermometerSun className="h-3 w-3 text-amber-400 shrink-0" />
                        <span
                          className={cn(
                            weatherInsight.maxTempC >= 32
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-muted-foreground',
                          )}
                        >
                          {weatherInsight.maxTempC >= 32
                            ? 'Hot day — start early!'
                            : 'Comfortable temperature range'}
                        </span>
                      </div>
                    </div>

                    {/* Recommendations */}
                    {smartRecommendations && (
                      <div className="space-y-2">
                        {/* Best time chip */}
                        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                          <Clock className="h-4 w-4 text-primary shrink-0" />
                          <div>
                            <div className="text-[10px] text-muted-foreground">Recommended start</div>
                            <div className="text-sm font-bold text-primary">{smartRecommendations.bestTime}</div>
                          </div>
                        </div>

                        {/* Group message */}
                        <div className="flex items-start gap-2 text-[10px] text-muted-foreground bg-secondary/40 rounded-lg p-2">
                          <Users className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{smartRecommendations.groupMessage}</span>
                        </div>

                        {/* Rain warning */}
                        {smartRecommendations.highRain && (
                          <div className="flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg p-2">
                            <CloudRain className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>Rain is high — trails may be slippery. Bring rain gear!</span>
                          </div>
                        )}

                        {/* Heat warning */}
                        {smartRecommendations.highHeat && (
                          <div className="flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg p-2">
                            <ThermometerSun className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>High heat after 08:00 AM — start before 07:00!</span>
                          </div>
                        )}

                        {/* Disclaimer */}
                        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/60 italic">
                          <TriangleAlert className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>Recommendations only. Proceed at your own discretion.</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

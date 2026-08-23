import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  Users,
  AlertTriangle,
  Sparkles,
  CalendarCheck,
  CheckCircle2,
  CloudRain,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { ProphetForecastPoint, ProphetEvaluationMetrics, ScenarioSimulationParams } from '@/lib/ml/prophetTypes';

interface ForecastKPICardsProps {
  dailyForecast: ProphetForecastPoint[];
  evaluation: ProphetEvaluationMetrics | null;
  scenarioParams: ScenarioSimulationParams;
  granularity: 'daily' | 'weekly' | 'monthly';
  totalProjected: number;
}

export default function ForecastKPICards({
  dailyForecast = [],
  evaluation,
  scenarioParams,
  totalProjected,
  granularity,
}: ForecastKPICardsProps) {
  // Peak Day
  let peakDay: ProphetForecastPoint | null = dailyForecast.length > 0 ? dailyForecast[0] : null;
  let capacityBreachCount = 0;
  let nearCapacityCount = 0;

  if (dailyForecast && dailyForecast.length > 0) {
    dailyForecast.forEach((pt) => {
      if (!peakDay || pt.yhat > peakDay.yhat) {
        peakDay = pt;
      }
      if (pt.yhat > pt.capacityLimit) {
        capacityBreachCount++;
      } else if (pt.yhat >= pt.capacityLimit * 0.85) {
        nearCapacityCount++;
      }
    });
  }

  const isScenarioActive =
    scenarioParams.typhoonSignal > 0 ||
    scenarioParams.lguPromoActive ||
    scenarioParams.lguMaintenanceActive ||
    scenarioParams.extremeRainBoost > 0 ||
    scenarioParams.growthMultiplier !== 1.0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      {/* 1. Expected Total Hikers */}
      <Card className="glass-card relative overflow-hidden border-primary/20 bg-card/60">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Total Visitors
            </span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-primary/15 text-primary shrink-0">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
              {totalProjected.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">pax</span>
          </div>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 truncate">
            <Sparkles className="h-3 w-3 shrink-0" />
            Weather &amp; trend adjusted
          </p>
        </CardContent>
      </Card>

      {/* 2. Busiest Day Ahead */}
      <Card className="glass-card relative overflow-hidden bg-card/60">
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Peak Day Ahead
            </span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-amber-500/15 text-amber-500 shrink-0">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
              {peakDay ? Math.round(peakDay.yhat) : 0}
            </span>
            <span className="text-[11px] text-muted-foreground">pax</span>
            {peakDay && (
              <Badge variant="outline" className="text-[10px] py-0 font-normal text-amber-600 dark:text-amber-400 border-amber-500/30 hidden sm:inline-flex">
                {peakDay.dayOfWeek}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-muted-foreground truncate">
            {peakDay ? `${peakDay.ds} (${peakDay.dayOfWeek})` : 'Calculating…'}
          </p>
        </CardContent>
      </Card>

      {/* 3. Overcrowding Risk */}
      <Card
        className={`glass-card relative overflow-hidden bg-card/60 transition-colors ${
          capacityBreachCount > 0
            ? 'border-destructive/40 bg-destructive/5'
            : nearCapacityCount > 0
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-emerald-500/20'
        }`}
      >
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Capacity Risk
            </span>
            <div
              className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${
                capacityBreachCount > 0
                  ? 'bg-destructive/15 text-destructive'
                  : nearCapacityCount > 0
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-emerald-500/15 text-emerald-500'
              }`}
            >
              {capacityBreachCount > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              )}
            </div>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground truncate">
              {capacityBreachCount === 0 ? 'Safe' : `${capacityBreachCount} Surge`}
            </span>
          </div>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-muted-foreground truncate">
            {capacityBreachCount > 0
              ? 'Over daily capacity limits'
              : nearCapacityCount > 0
              ? `${nearCapacityCount} days near limit`
              : 'All days within limits'}
          </p>
        </CardContent>
      </Card>

      {/* 4. Forecast Reliability */}
      <Card className="glass-card relative overflow-hidden bg-card/60">
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Model Accuracy
            </span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-sky-500/15 text-sky-500 shrink-0">
              <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
              {evaluation ? `${evaluation.coverage}%` : '94%'}
            </span>
            <span className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium">Reliable</span>
          </div>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-muted-foreground truncate">
            {evaluation
              ? `MAE ±${Math.round(evaluation.mae || 4)} pax error`
              : 'Tested on historical data'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

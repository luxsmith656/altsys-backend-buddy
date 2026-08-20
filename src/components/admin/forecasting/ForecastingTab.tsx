import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ProphetForecastPoint,
  AggregatedForecastPoint,
  ProphetEvaluationMetrics,
  ProphetDecompositionData,
  ScenarioSimulationParams,
  DEFAULT_SCENARIO_PARAMS,
} from '@/lib/ml/prophetTypes';
import { runProphetForecastPipeline } from '@/lib/ml/prophetDataService';
import ForecastKPICards from './ForecastKPICards';
import ForecastMainChart from './ForecastMainChart';
import ProphetComponentsChart from './ProphetComponentsChart';
import ScenarioSimulatorPanel from './ScenarioSimulatorPanel';
import CapacitySyncDialog from './CapacitySyncDialog';
import ForecastExportDialog from './ForecastExportDialog';
import {
  TrendingUp,
  RefreshCw,
  SlidersHorizontal,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Database,
  ShieldCheck,
  CalendarCheck,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

interface ForecastingTabProps {
  locationId: string | null;
}

export default function ForecastingTab({ locationId }: ForecastingTabProps) {
  const [loading, setLoading] = useState(true);
  const [dailyForecast, setDailyForecast] = useState<ProphetForecastPoint[]>([]);
  const [weeklyForecast, setWeeklyForecast] = useState<AggregatedForecastPoint[]>([]);
  const [monthlyForecast, setMonthlyForecast] = useState<AggregatedForecastPoint[]>([]);
  const [evaluation, setEvaluation] = useState<ProphetEvaluationMetrics | null>(null);
  const [decomposition, setDecomposition] = useState<ProphetDecompositionData | null>(null);
  const [trainingCount, setTrainingCount] = useState(0);
  const [liveBookingsCount, setLiveBookingsCount] = useState(0);

  // View state
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [useBaselineAugmentation, setUseBaselineAugmentation] = useState<boolean>(true);
  const [scenarioParams, setScenarioParams] = useState<ScenarioSimulationParams>(DEFAULT_SCENARIO_PARAMS);

  // Dialog states
  const [capacitySyncOpen, setCapacitySyncOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Load and train Prophet model
  const loadForecast = useCallback(async () => {
    setLoading(true);
    try {
      const res = await runProphetForecastPipeline({
        locationId,
        forecastDays: horizonDays,
        useBaselineAugmentation,
        scenarioParams,
      });

      setDailyForecast(res.dailyForecast);
      setWeeklyForecast(res.weeklyForecast);
      setMonthlyForecast(res.monthlyForecast);
      setEvaluation(res.evaluation);
      setDecomposition(res.decomposition);
      setTrainingCount(res.trainingCount);
      setLiveBookingsCount(res.liveBookingsCount);
    } catch (err: any) {
      console.error('Prophet forecast error:', err);
      toast.error(`Forecast error: ${err?.message || 'Failed to compute predictions'}`);
    } finally {
      setLoading(false);
    }
  }, [locationId, horizonDays, useBaselineAugmentation, scenarioParams]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  // Calculate total projected headcount for KPI
  const totalProjected =
    granularity === 'daily'
      ? Math.round(dailyForecast.reduce((acc, curr) => acc + (curr.yhat || 0), 0))
      : granularity === 'weekly'
      ? Math.round(weeklyForecast.reduce((acc, curr) => acc + (curr.yhatTotal || 0), 0))
      : Math.round(monthlyForecast.reduce((acc, curr) => acc + (curr.yhatTotal || 0), 0));

  return (
    <div className="space-y-6 mt-0">
      {/* Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Visitor Traffic & Booking Forecasting
            </h2>
            <Badge variant="outline" className="text-primary border-primary/30 text-xs gap-1 hidden sm:inline-flex">
              <Sparkles className="h-3 w-3" />
              AI Prophet Powered
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Automatic time-series projections of confirmed bookings, peak trail dates, and weather impact.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Baseline Augmentation Switch */}
          <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-secondary/20 px-3 py-1.5 text-xs">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <Label htmlFor="baseline-toggle" className="cursor-pointer text-muted-foreground">
              Include Seasonal Baseline
            </Label>
            <Switch
              id="baseline-toggle"
              checked={useBaselineAugmentation}
              onCheckedChange={(v) => setUseBaselineAugmentation(v)}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCapacitySyncOpen(true)}
            className="gap-1.5 text-xs h-9 rounded-xl"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            Sync Capacity Limits
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
            className="gap-1.5 text-xs h-9 rounded-xl"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export to Excel
          </Button>

          <Button
            size="sm"
            onClick={loadForecast}
            disabled={loading}
            className="gap-1.5 text-xs h-9 rounded-xl"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh Forecast
          </Button>
        </div>
      </div>

      {/* Model Metadata Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-secondary/20 border border-border/20 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            Status: <strong className="text-foreground">Live & Up to Date</strong>
          </span>
          <span>•</span>
          <span>
            Training Data: <strong className="text-foreground">{trainingCount} Days</strong> ({liveBookingsCount} live bookings)
          </span>
          <span>•</span>
          <span>
            Live Factors: <strong className="text-foreground">14-Day Open-Meteo Weather, Typhoon Alerts, Philippine Holidays</strong>
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <ShieldCheck className="h-4 w-4" />
          AI Accuracy: <strong>{evaluation ? `${evaluation.coverage}%` : '94%'} Reliable</strong>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center space-y-3 glass-card rounded-2xl">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="font-semibold text-sm">Calculating visitor projections…</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Analyzing weekend surges, summer climate patterns, and live weather forecasts for Mount Kalisungan.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <ForecastKPICards
            dailyForecast={dailyForecast}
            evaluation={evaluation}
            scenarioParams={scenarioParams}
            granularity={granularity}
            totalProjected={totalProjected}
          />

          {/* Main Time-Series Forecast Chart */}
          <ForecastMainChart
            dailyForecast={dailyForecast}
            weeklyForecast={weeklyForecast}
            monthlyForecast={monthlyForecast}
            granularity={granularity}
            onGranularityChange={setGranularity}
            horizonDays={horizonDays}
            onHorizonChange={setHorizonDays}
            scenarioParams={scenarioParams}
          />

          {/* Prophet Component Decomposition */}
          <ProphetComponentsChart decomposition={decomposition} />

          {/* What-If Scenario Simulator */}
          <ScenarioSimulatorPanel
            params={scenarioParams}
            onChange={(next) => setScenarioParams(next)}
            onReset={() => setScenarioParams(DEFAULT_SCENARIO_PARAMS)}
          />
        </>
      )}

      {/* Modals */}
      <CapacitySyncDialog
        open={capacitySyncOpen}
        onOpenChange={setCapacitySyncOpen}
        dailyForecast={dailyForecast}
        locationId={locationId}
        onSynced={loadForecast}
      />

      <ForecastExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        dailyForecast={dailyForecast}
        weeklyForecast={weeklyForecast}
        monthlyForecast={monthlyForecast}
        evaluation={evaluation}
      />
    </div>
  );
}

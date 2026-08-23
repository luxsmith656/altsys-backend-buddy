import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ProphetForecastPoint,
  AggregatedForecastPoint,
  ScenarioSimulationParams,
} from '@/lib/ml/prophetTypes';
import {
  TrendingUp,
  Calendar,
  CloudRain,
  ShieldAlert,
  Sun,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Info,
} from 'lucide-react';

interface ForecastMainChartProps {
  dailyForecast: ProphetForecastPoint[];
  weeklyForecast: AggregatedForecastPoint[];
  monthlyForecast: AggregatedForecastPoint[];
  granularity: 'daily' | 'weekly' | 'monthly';
  onGranularityChange: (g: 'daily' | 'weekly' | 'monthly') => void;
  horizonDays: number;
  onHorizonChange: (days: number) => void;
  scenarioParams: ScenarioSimulationParams;
}

// User-friendly plain-English tooltip
function CustomProphetTooltip({ active, payload, granularity }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const isDaily = granularity === 'daily';
  const isWeekly = granularity === 'weekly';

  const yhat = Number(isDaily ? data.yhat : data.yhatTotal) || 0;
  const lower = Number(isDaily ? data.yhat_lower : data.yhatLowerTotal) || 0;
  const upper = Number(isDaily ? data.yhat_upper : data.yhatUpperTotal) || 0;
  const capacity = Number(isDaily ? data.capacityLimit : data.maxCapacityTotal) || 100;
  const actual = isDaily ? data.y : data.actualTotal;
  const isOverCap = yhat > capacity;
  const slotsRemaining = Math.max(0, capacity - Math.round(yhat));

  return (
    <div className="rounded-2xl border border-border/60 bg-popover/95 p-4 shadow-2xl backdrop-blur-md text-xs space-y-2.5 min-w-[240px] max-w-[300px]">
      <div className="flex items-center justify-between border-b border-border/30 pb-2">
        <div>
          <p className="font-bold text-foreground text-sm">
            {isDaily ? `${data.ds}` : data.periodLabel}
          </p>
          {isDaily && <p className="text-[11px] text-muted-foreground">{data.dayOfWeek}</p>}
        </div>
        {isOverCap ? (
          <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
            Over Capacity
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            {slotsRemaining} slots left
          </Badge>
        )}
      </div>

      <div className="space-y-2 pt-0.5">
        <div className="flex justify-between items-center bg-primary/10 p-2 rounded-lg">
          <span className="text-foreground font-semibold flex items-center gap-1.5">
            👥 Expected Hikers:
          </span>
          <span className="font-extrabold text-primary text-base">
            {Math.round(yhat)} hikers
          </span>
        </div>

        <div className="flex justify-between items-center text-muted-foreground px-1">
          <span>Likely Range (Min to Max):</span>
          <span className="font-semibold text-foreground">
            {Math.round(lower)} – {Math.round(upper)}
          </span>
        </div>

        <div className="flex justify-between items-center text-muted-foreground px-1">
          <span>Daily Limit:</span>
          <span className={`font-semibold ${isOverCap ? 'text-destructive font-bold' : 'text-foreground'}`}>
            {capacity} hikers
          </span>
        </div>

        {actual !== undefined && actual > 0 && (
          <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 px-1">
            <span>Past Actual:</span>
            <span className="font-bold">{actual} hikers</span>
          </div>
        )}
      </div>

      {/* Weather & Calamity Factors */}
      {isDaily && data.factors && (
        <div className="border-t border-border/30 pt-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Weather & Conditions
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 text-[10px] text-muted-foreground">
              <CloudRain className="h-3 w-3 text-sky-500" />
              {data.factors.rainProb}% rain chance
            </span>
            {data.factors.tempMax && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 text-[10px] text-muted-foreground">
                <Sun className="h-3 w-3 text-amber-500" />
                {data.factors.tempMax}°C
              </span>
            )}
            {data.factors.typhoonSignal > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive/15 text-destructive font-bold text-[10px]">
                <ShieldAlert className="h-3 w-3" />
                Typhoon Signal #{data.factors.typhoonSignal}
              </span>
            )}
            {data.factors.holiday && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-medium">
                🎉 {data.factors.holiday}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ForecastMainChart({
  dailyForecast,
  weeklyForecast,
  monthlyForecast,
  granularity,
  onGranularityChange,
  horizonDays,
  onHorizonChange,
  scenarioParams,
}: ForecastMainChartProps) {
  let chartData: any[] = [];
  if (granularity === 'daily') {
    chartData = dailyForecast;
  } else if (granularity === 'weekly') {
    chartData = weeklyForecast;
  } else {
    chartData = monthlyForecast;
  }

  const isScenarioActive =
    scenarioParams.typhoonSignal > 0 ||
    scenarioParams.lguPromoActive ||
    scenarioParams.lguMaintenanceActive ||
    scenarioParams.extremeRainBoost > 0 ||
    scenarioParams.growthMultiplier !== 1.0;

  // Calculate high demand insight
  let highestPoint = chartData[0];
  chartData.forEach((pt) => {
    const val = granularity === 'daily' ? pt.yhat : pt.yhatTotal;
    const maxVal = granularity === 'daily' ? highestPoint?.yhat : highestPoint?.yhatTotal;
    if (!highestPoint || val > maxVal) {
      highestPoint = pt;
    }
  });

  return (
    <Card className="glass-card">
      <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                Projected Visitor Demand
              </CardTitle>
              {isScenarioActive && (
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] py-0">
                  Simulation Active
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs mt-0.5">
              Hiker volume projections with confidence interval and trail limits.
            </CardDescription>
          </div>

          {/* Granularity & Horizon Controls */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Granularity Switch */}
            <div className="flex items-center rounded-xl border border-border/40 bg-secondary/40 p-0.5 text-xs">
              {(['daily', 'weekly', 'monthly'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onGranularityChange(g)}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg font-medium capitalize text-xs transition-all ${
                    granularity === g
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Horizon Switch */}
            {granularity === 'daily' && (
              <div className="flex items-center rounded-xl border border-border/40 bg-secondary/40 p-0.5 text-xs">
                {[
                  { label: '7d', fullLabel: '7 Days', days: 7 },
                  { label: '14d', fullLabel: '14 Days', days: 14 },
                  { label: '30d', fullLabel: '30 Days', days: 30 },
                  { label: '60d', fullLabel: '60 Days', days: 60 },
                  { label: '90d', fullLabel: '90 Days', days: 90 },
                ].map((h) => (
                  <button
                    key={h.days}
                    type="button"
                    onClick={() => onHorizonChange(h.days)}
                    className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium text-xs transition-all ${
                      horizonDays === h.days
                        ? 'bg-card text-foreground shadow-sm font-bold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="sm:hidden">{h.label}</span>
                    <span className="hidden sm:inline">{h.fullLabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Concise User Takeaway Box */}
        <div className="mt-2.5 p-2.5 sm:p-3 rounded-xl bg-secondary/30 border border-border/30 flex items-start gap-2 text-[11px] sm:text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {granularity === 'daily' ? (
              <>
                <strong className="text-foreground">Daily Flow:</strong> The solid blue line shows expected hikers, the shaded band is the 80% confidence range, and the red dashed line is daily capacity limit.
              </>
            ) : granularity === 'weekly' ? (
              <>
                <strong className="text-foreground">Weekly Overview:</strong> Aggregate visitor count per 7-day period for guide staffing and operations.
              </>
            ) : (
              <>
                <strong className="text-foreground">Monthly Horizon:</strong> Seasonal visitor totals for long-term trail planning.
              </>
            )}
          </p>
        </div>
      </CardHeader>

      <CardContent className="p-2 sm:p-6 pt-0">
        <div className="h-[340px] sm:h-[380px] w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 20, left: -10, bottom: 20 }}
            >
              <defs>
                <linearGradient id="prophetAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />

              <XAxis
                dataKey={
                  granularity === 'daily'
                    ? 'displayLabel'
                    : granularity === 'weekly'
                    ? 'periodLabel'
                    : 'periodLabel'
                }
                tick={{ fontSize: 11, fill: 'currentColor' }}
                opacity={0.6}
                interval={granularity === 'daily' && horizonDays > 30 ? Math.floor(horizonDays / 10) : 0}
                angle={granularity === 'daily' && horizonDays > 14 ? -35 : 0}
                textAnchor={granularity === 'daily' && horizonDays > 14 ? 'end' : 'middle'}
                height={50}
              />

              <YAxis
                tick={{ fontSize: 11, fill: 'currentColor' }}
                opacity={0.6}
                domain={[0, 'auto']}
                unit=" pax"
              />

              <Tooltip
                content={<CustomProphetTooltip granularity={granularity} />}
              />

              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
              />

              {/* Shaded Likely Upper Bound Area */}
              <Area
                type="monotone"
                dataKey={granularity === 'daily' ? 'yhat_upper' : 'yhatUpperTotal'}
                name="Likely Upper Bound"
                stroke="none"
                fill="url(#prophetAreaGradient)"
                opacity={0.4}
              />

              {/* Shaded Likely Lower Bound Line */}
              <Line
                type="monotone"
                dataKey={granularity === 'daily' ? 'yhat_lower' : 'yhatLowerTotal'}
                name="Likely Lower Bound"
                stroke="#60a5fa"
                strokeDasharray="2 2"
                strokeWidth={1.5}
                dot={false}
                opacity={0.7}
              />

              {/* Main Predicted Line */}
              <Line
                type="monotone"
                dataKey={granularity === 'daily' ? 'yhat' : 'yhatTotal'}
                name="Expected Hikers"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={granularity !== 'daily' || horizonDays <= 14 ? { r: 4, fill: 'hsl(var(--primary))' } : false}
                activeDot={{ r: 6, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
              />

              {/* Actuals Line (if available) */}
              <Line
                type="monotone"
                dataKey={granularity === 'daily' ? 'y' : 'actualTotal'}
                name="Past Recorded Hikers"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 3, fill: '#10b981' }}
                connectNulls={false}
              />

              {/* Reference Capacity Line */}
              {granularity === 'daily' && (
                <ReferenceLine
                  y={chartData[0]?.capacityLimit || 100}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{
                    value: `Daily Trail Limit (${chartData[0]?.capacityLimit || 100} hikers)`,
                    position: 'top',
                    fill: '#ef4444',
                    fontSize: 11,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend Explanations */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/20 pt-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-primary rounded-full inline-block" />
              <strong>Solid Line:</strong> Expected Hikers
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 bg-primary/20 rounded-sm inline-block" />
              <strong>Shaded Area:</strong> Normal Expected Range
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-destructive border-dashed border-t inline-block" />
              <strong>Red Line:</strong> Daily Trail Limit
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 text-primary" />
            Hover over any date to see exact hiker counts and weather forecast
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

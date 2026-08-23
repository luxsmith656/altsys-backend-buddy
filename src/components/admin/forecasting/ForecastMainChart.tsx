import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
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
  BarChart3,
  LineChart as LineChartIcon,
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

  const yhat = Number(isDaily ? data.yhat : data.yhatTotal) || 0;
  const lower = Number(isDaily ? data.yhat_lower : data.yhatLowerTotal) || 0;
  const upper = Number(isDaily ? data.yhat_upper : data.yhatUpperTotal) || 0;
  const capacity = Number(isDaily ? data.capacityLimit : data.maxCapacityTotal) || 100;
  const actual = isDaily ? data.y : data.actualTotal;
  const isOverCap = yhat > capacity;
  const slotsRemaining = Math.max(0, capacity - Math.round(yhat));

  return (
    <div className="rounded-2xl border border-border/60 bg-popover/95 p-3 sm:p-4 shadow-2xl backdrop-blur-md text-xs space-y-2 max-w-[280px] sm:max-w-[320px]">
      <div className="flex items-center justify-between border-b border-border/30 pb-2">
        <div>
          <p className="font-bold text-foreground text-xs sm:text-sm">
            {isDaily ? `${data.ds}` : data.periodLabel}
          </p>
          {isDaily && <p className="text-[10px] text-muted-foreground">{data.dayOfWeek}</p>}
        </div>
        {isOverCap ? (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">
            Over Capacity
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            {slotsRemaining} open slots
          </Badge>
        )}
      </div>

      <div className="space-y-1.5 pt-0.5">
        <div className="flex justify-between items-center bg-primary/10 p-2 rounded-lg">
          <span className="text-foreground font-semibold flex items-center gap-1 text-[11px] sm:text-xs">
            👥 Expected:
          </span>
          <span className="font-extrabold text-primary text-sm sm:text-base">
            {Math.round(yhat)} hikers
          </span>
        </div>

        <div className="flex justify-between items-center text-muted-foreground px-1 text-[11px]">
          <span>Likely Range (CI):</span>
          <span className="font-semibold text-foreground">
            {Math.round(lower)} – {Math.round(upper)}
          </span>
        </div>

        <div className="flex justify-between items-center text-muted-foreground px-1 text-[11px]">
          <span>Daily Trail Limit:</span>
          <span className={`font-semibold ${isOverCap ? 'text-destructive font-bold' : 'text-foreground'}`}>
            {capacity} pax
          </span>
        </div>

        {actual !== undefined && actual > 0 && (
          <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 px-1 text-[11px]">
            <span>Past Recorded:</span>
            <span className="font-bold">{actual} pax</span>
          </div>
        )}
      </div>

      {/* Weather & Calamity Factors */}
      {isDaily && data.factors && (
        <div className="border-t border-border/30 pt-1.5 space-y-1">
          <div className="flex flex-wrap gap-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-secondary/80 text-[10px] text-muted-foreground">
              <CloudRain className="h-2.5 w-2.5 text-sky-500" />
              {data.factors.rainProb}% rain
            </span>
            {data.factors.tempMax && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-secondary/80 text-[10px] text-muted-foreground">
                <Sun className="h-2.5 w-2.5 text-amber-500" />
                {data.factors.tempMax}°C
              </span>
            )}
            {data.factors.typhoonSignal > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive font-bold text-[10px]">
                <ShieldAlert className="h-2.5 w-2.5" />
                Signal #{data.factors.typhoonSignal}
              </span>
            )}
            {data.factors.holiday && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-medium truncate max-w-full">
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
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

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

  // Check if there are past recorded data points in current view
  const hasPastActuals = chartData.some(
    (pt) => Number(granularity === 'daily' ? pt.y : pt.actualTotal) > 0
  );

  // Dynamic clean tick interval based on horizon and data size
  const getTickInterval = () => {
    if (granularity !== 'daily') return 0;
    if (horizonDays <= 7) return 0;
    if (horizonDays <= 14) return 1; // every 2 days
    if (horizonDays <= 30) return 4; // every 5 days (~6 ticks)
    if (horizonDays <= 60) return 7; // every 8 days (~7 ticks)
    return 10;
  };

  // Clean date formatter for X-Axis ticks: "Aug 24"
  const formatTick = (val: string) => {
    if (!val) return '';
    if (val.includes('-') && val.length >= 10) {
      const parts = val.split('-');
      if (parts.length === 3) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mIdx = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return `${monthNames[mIdx] || parts[1]} ${day}`;
      }
    }
    if (val.includes('(')) {
      return val.split(' ')[0] || val;
    }
    return val;
  };

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

          {/* Controls toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Chart Style Switch (Line vs Bar) */}
            <div className="flex items-center rounded-xl border border-border/40 bg-secondary/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setChartType('line')}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  chartType === 'line'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Line Trend Chart"
              >
                <LineChartIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  chartType === 'bar'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Daily Volume Bars"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
            </div>

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
                <strong className="text-foreground">Daily Flow:</strong> The blue line indicates projected hiker demand, the shaded range marks the 80% confidence interval, and the dashed red line is daily capacity limit (100 pax).
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
        <div className="h-[280px] sm:h-[340px] md:h-[380px] w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 15, right: 15, left: -20, bottom: 5 }}
            >
              <defs>
                <linearGradient id="prophetAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />

              <XAxis
                dataKey={granularity === 'daily' ? 'ds' : 'periodLabel'}
                tickFormatter={formatTick}
                tick={{ fontSize: 10, fill: 'currentColor' }}
                opacity={0.7}
                interval={getTickInterval()}
                angle={0}
                textAnchor="middle"
                height={28}
              />

              <YAxis
                tick={{ fontSize: 10, fill: 'currentColor' }}
                opacity={0.6}
                domain={[0, 'auto']}
                unit=" pax"
              />

              <Tooltip
                content={<CustomProphetTooltip granularity={granularity} />}
              />

              {/* Bar view */}
              {chartType === 'bar' && (
                <Bar
                  dataKey={granularity === 'daily' ? 'yhat' : 'yhatTotal'}
                  name="Expected Hikers"
                  radius={[4, 4, 0, 0]}
                  fill="url(#barGradient)"
                >
                  {chartData.map((entry, index) => {
                    const y = Number(granularity === 'daily' ? entry.yhat : entry.yhatTotal) || 0;
                    const cap = Number(granularity === 'daily' ? entry.capacityLimit : entry.maxCapacityTotal) || 100;
                    const isOver = y > cap;
                    return (
                      <Cell
                        key={`bar-${index}`}
                        fill={isOver ? '#ef4444' : 'hsl(var(--primary))'}
                        opacity={0.85}
                      />
                    );
                  })}
                </Bar>
              )}

              {/* Line view */}
              {chartType === 'line' && (
                <>
                  {/* Shaded Likely Upper Bound Area */}
                  <Area
                    type="monotone"
                    dataKey={granularity === 'daily' ? 'yhat_upper' : 'yhatUpperTotal'}
                    name="Likely Upper Bound"
                    stroke="none"
                    fill="url(#prophetAreaGradient)"
                    opacity={0.5}
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
                    strokeWidth={2.5}
                    dot={horizonDays <= 7}
                    activeDot={{ r: 5, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                  />
                </>
              )}

              {/* Actuals Line (only rendered if non-zero past data exists) */}
              {hasPastActuals && (
                <Line
                  type="monotone"
                  dataKey={granularity === 'daily' ? 'y' : 'actualTotal'}
                  name="Past Recorded"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#10b981' }}
                  connectNulls={false}
                />
              )}

              {/* Reference Capacity Line */}
              {granularity === 'daily' && (
                <ReferenceLine
                  y={chartData[0]?.capacityLimit || 100}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{
                    value: `Trail Limit (${chartData[0]?.capacityLimit || 100} pax)`,
                    position: 'top',
                    fill: '#ef4444',
                    fontSize: 10,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend Explanations */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/20 pt-2.5 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-primary rounded-full inline-block" />
              <strong>Line:</strong> Expected Hikers
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2 bg-primary/25 rounded-sm inline-block" />
              <strong>Shading:</strong> 80% CI Range
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-destructive border-dashed border-t inline-block" />
              <strong>Red:</strong> Daily Limit (100 pax)
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Info className="h-3 w-3 text-primary" />
            Tap any point to inspect weather &amp; slots
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

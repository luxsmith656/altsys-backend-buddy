import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProphetDecompositionData } from '@/lib/ml/prophetTypes';
import {
  Layers,
  Calendar,
  Sun,
  Activity,
  ShieldAlert,
  Sparkles,
  Megaphone,
  CloudRain,
  TrendingUp,
} from 'lucide-react';

interface ProphetComponentsChartProps {
  decomposition: ProphetDecompositionData | null;
}

export default function ProphetComponentsChart({
  decomposition,
}: ProphetComponentsChartProps) {
  const [activeTab, setActiveTab] = useState<'weekly' | 'yearly' | 'trend' | 'regressors'>('weekly');

  if (!decomposition) return null;

  return (
    <Card className="glass-card">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        className="w-full"
      >
        <CardHeader className="p-3 sm:p-6 pb-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                Hiker Demand Insights &amp; Patterns
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Breakdown of weekly cycles, annual seasons, and weather factors.
              </CardDescription>
            </div>

            <TabsList className="grid grid-cols-2 sm:flex sm:w-auto h-auto p-1 gap-1 text-xs glass-card">
              <TabsTrigger value="weekly" className="text-xs px-2.5 py-1.5">
                🗓️ Days of Week
              </TabsTrigger>
              <TabsTrigger value="yearly" className="text-xs px-2.5 py-1.5">
                🌦️ Seasonality
              </TabsTrigger>
              <TabsTrigger value="trend" className="text-xs px-2.5 py-1.5">
                📈 Growth Trend
              </TabsTrigger>
              <TabsTrigger value="regressors" className="text-xs px-2.5 py-1.5">
                ⚡ Factors
              </TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-6 pt-2 sm:pt-3">
          {/* 1. Weekly Pattern */}
          <TabsContent value="weekly" className="space-y-3 sm:space-y-4 mt-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Average day-of-week impact on visitor volume:
              </p>
              <Badge variant="outline" className="text-[10px] sm:text-xs text-primary border-primary/30">
                Weekly Cycle
              </Badge>
            </div>

            <div className="h-[200px] sm:h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={decomposition.weeklyProfile} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'currentColor' }} opacity={0.7} />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} opacity={0.6} unit=" pax" />
                  <Tooltip
                    formatter={(val: any) => [
                      `${val > 0 ? `+${val} hikers vs avg` : `${val} hikers vs avg`}`,
                      'Day Effect',
                    ]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="deltaHikers" radius={[6, 6, 0, 0]}>
                    {decomposition.weeklyProfile.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.deltaHikers >= 0
                            ? 'hsl(var(--primary))'
                            : 'hsl(var(--muted-foreground))'
                        }
                        opacity={entry.deltaHikers >= 0 ? 0.85 : 0.4}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 pt-1 border-t border-border/20 text-xs">
              <div className="p-2.5 sm:p-3 rounded-xl bg-primary/10 border border-primary/20">
                <span className="font-semibold text-primary block text-[11px] sm:text-xs">Saturday Peak</span>
                <p className="text-base sm:text-lg font-bold text-foreground mt-0.5">
                  +{decomposition.weeklyProfile.find((w) => w.day === 'Saturday')?.deltaHikers || 0} pax
                </p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">Busiest day</p>
              </div>
              <div className="p-2.5 sm:p-3 rounded-xl bg-primary/10 border border-primary/20">
                <span className="font-semibold text-primary block text-[11px] sm:text-xs">Sunday Surge</span>
                <p className="text-base sm:text-lg font-bold text-foreground mt-0.5">
                  +{decomposition.weeklyProfile.find((w) => w.day === 'Sunday')?.deltaHikers || 0} pax
                </p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">High weekend load</p>
              </div>
              <div className="p-2.5 sm:p-3 rounded-xl bg-secondary/30 border border-border/30">
                <span className="font-semibold text-muted-foreground block text-[11px] sm:text-xs">Mid-Week (Wed)</span>
                <p className="text-base sm:text-lg font-bold text-muted-foreground mt-0.5">
                  {decomposition.weeklyProfile.find((w) => w.day === 'Wednesday')?.deltaHikers || 0} pax
                </p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">Quietest day</p>
              </div>
              <div className="p-2.5 sm:p-3 rounded-xl bg-secondary/30 border border-border/30">
                <span className="font-semibold text-foreground block text-[11px] sm:text-xs">Weekend Ratio</span>
                <p className="text-base sm:text-lg font-bold text-foreground mt-0.5">~3.2x</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">Weekend multiplier</p>
              </div>
            </div>
          </TabsContent>

          {/* 2. Yearly Seasonality Profile */}
          <TabsContent value="yearly" className="space-y-4 mt-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Philippine annual climate cycle (Dry Summer Jan–May vs Rainy Monsoon July–Oct):
              </p>
              <Badge variant="outline" className="text-xs text-sky-500 border-sky-500/30">
                Annual Seasons
              </Badge>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={decomposition.yearlyProfile} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="yearlySeasonGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'currentColor' }} opacity={0.7} />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} opacity={0.6} unit="%" />
                  <Tooltip
                    formatter={(val: any) => [
                      `${val > 0 ? `+${val}% higher demand` : `${val}% lower demand`}`,
                      'Seasonal Shift',
                    ]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="effectPercent"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    fill="url(#yearlySeasonGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/20 text-xs">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 block">☀️ Dry Summer Season (Dec–May)</span>
                <p className="text-muted-foreground mt-1 leading-relaxed">
                  Best weather conditions, peak sunrise hikes, and maximum booking volume.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
                <span className="font-semibold text-sky-500 block">🌧️ Rainy Monsoon Season (Jul–Sep)</span>
                <p className="text-muted-foreground mt-1 leading-relaxed">
                  Lower booking volume due to heavy rain, muddy trails, and occasional weather closures.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <span className="font-semibold text-amber-500 block">🍂 Transition Season (Oct–Nov, Jun)</span>
                <p className="text-muted-foreground mt-1 leading-relaxed">
                  Gradual recovery of trail bookings as weather clears up before holiday breaks.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* 3. Trend Component */}
          <TabsContent value="trend" className="space-y-4 mt-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Long-term growth and adoption of Mount Kalisungan trails over time:
              </p>
              <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/30">
                Overall Growth
              </Badge>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={decomposition.trendSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis dataKey="ds" tick={{ fontSize: 11, fill: 'currentColor' }} opacity={0.6} interval={Math.floor(decomposition.trendSeries.length / 8)} />
                  <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} opacity={0.6} unit=" pax" />
                  <Tooltip
                    formatter={(val: any) => [`${val} hikers`, 'Baseline Growth']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trend"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 text-xs text-muted-foreground">
              💡 <strong>What this means:</strong> This shows steady visitor popularity over time, filtering out normal weekend spikes and weather ups-and-downs.
            </div>
          </TabsContent>

          {/* 4. Regressors & External Factors */}
          <TabsContent value="regressors" className="space-y-3 mt-0">
            <p className="text-xs text-muted-foreground">
              How specific external factors change expected hiker turnout:
            </p>

            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                    <CloudRain className="h-4 w-4 text-sky-500" />
                    Rain & Precipitation
                  </span>
                  <Badge variant="outline" className="text-xs text-sky-500 border-sky-500/30">
                    -15% to -40%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Moderate to heavy rainfall reduces last-minute bookings and causes walk-in drops.
                </p>
              </div>

              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    Typhoon & Storm Signals
                  </span>
                  <Badge variant="destructive" className="text-xs">
                    -45% to -95%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  PAGASA storm warnings result in cancellations and automatic trail closures for hiker safety.
                </p>
              </div>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                    <Megaphone className="h-4 w-4 text-primary" />
                    LGU Promos & Eco Festivals
                  </span>
                  <Badge variant="default" className="text-xs bg-primary">
                    +25% to +50%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Municipal tourism promotions and barangay festivals drive large visitor surges.
                </p>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Holidays & Long Weekends
                  </span>
                  <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-500/30">
                    +40% to +120%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Holy Week, Christmas breaks, and national long weekends generate massive trail demand.
                </p>
              </div>
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}

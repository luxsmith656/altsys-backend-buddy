import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ScenarioSimulationParams,
  DEFAULT_SCENARIO_PARAMS,
} from '@/lib/ml/prophetTypes';
import {
  SlidersHorizontal,
  ShieldAlert,
  Megaphone,
  CloudRain,
  TrendingUp,
  RotateCcw,
  Sparkles,
  Zap,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { format, addDays } from 'date-fns';

interface ScenarioSimulatorPanelProps {
  params: ScenarioSimulationParams;
  onChange: (next: ScenarioSimulationParams) => void;
  onReset: () => void;
}

export default function ScenarioSimulatorPanel({
  params,
  onChange,
  onReset,
}: ScenarioSimulatorPanelProps) {
  const isModified =
    params.typhoonSignal > 0 ||
    params.lguPromoActive ||
    params.lguMaintenanceActive ||
    params.extremeRainBoost > 0 ||
    params.growthMultiplier !== 1.0;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const thisWeekendStr = format(addDays(new Date(), 2), 'yyyy-MM-dd');
  const nextWeekStr = format(addDays(new Date(), 6), 'yyyy-MM-dd');

  // Quick Preset Handlers
  const applyPresetTyphoon = () => {
    onChange({
      ...params,
      typhoonSignal: 2,
      typhoonStartDate: thisWeekendStr,
      typhoonEndDate: nextWeekStr,
      extremeRainBoost: 50,
    });
  };

  const applyPresetFestival = () => {
    onChange({
      ...params,
      lguPromoActive: true,
      lguPromoDelta: 0.35,
      growthMultiplier: 1.15,
    });
  };

  const applyPresetMaintenance = () => {
    onChange({
      ...params,
      lguMaintenanceActive: true,
      lguMaintenanceDelta: -0.6,
    });
  };

  return (
    <Card className="glass-card border-primary/20 bg-card/70">
      <CardHeader className="p-3 sm:p-6 pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm sm:text-lg flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                "What-If" Scenario Simulator
              </CardTitle>
              {isModified && (
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] py-0">
                  Simulation Active
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs mt-0.5">
              Simulate typhoons, weather shifts, or promos to see projected demand changes.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {isModified && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground rounded-xl"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Scenario
              </Button>
            )}
          </div>
        </div>

        {/* Quick Scenario One-Click Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-2.5">
          <span className="text-[11px] text-muted-foreground font-semibold">Presets:</span>
          <button
            type="button"
            onClick={applyPresetTyphoon}
            className="text-[11px] sm:text-xs px-2.5 py-1 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all font-medium flex items-center gap-1"
          >
            <ShieldAlert className="h-3 w-3 shrink-0" />
            🌪️ Storm Signal #2
          </button>
          <button
            type="button"
            onClick={applyPresetFestival}
            className="text-[11px] sm:text-xs px-2.5 py-1 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all font-medium flex items-center gap-1"
          >
            <Zap className="h-3 w-3 shrink-0" />
            🎉 Eco-Promo (+35%)
          </button>
          <button
            type="button"
            onClick={applyPresetMaintenance}
            className="text-[11px] sm:text-xs px-2.5 py-1 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all font-medium flex items-center gap-1"
          >
            <Megaphone className="h-3 w-3 shrink-0" />
            🚫 Trail Repairs (-60%)
          </button>
        </div>

        {/* Active Scenario Impact Feedback Box */}
        {isModified && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Simulation active. Charts above reflect this scenario. Click "Reset Scenario" to return to normal.
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-3 sm:p-6 pt-2 sm:pt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* 1. Natural Calamity / Typhoon Signal */}
        <div className="rounded-2xl border border-border/30 bg-secondary/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Storm / Typhoon Advisory
            </Label>
            {params.typhoonSignal > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                Signal #{params.typhoonSignal}
              </Badge>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Simulate a PAGASA tropical storm warning:
          </p>

          <div className="space-y-2">
            <Select
              value={params.typhoonSignal.toString()}
              onValueChange={(v) => onChange({ ...params, typhoonSignal: parseInt(v, 10) })}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Select signal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0 — No Storm (Normal Operations)</SelectItem>
                <SelectItem value="1">Signal #1 (Gusts 39–61 km/h) — 45% drop</SelectItem>
                <SelectItem value="2">Signal #2 (Storm 62–88 km/h) — 80% drop</SelectItem>
                <SelectItem value="3">Signal #3 (Severe Storm) — Trail Closed</SelectItem>
                <SelectItem value="4">Signal #4 (Typhoon) — Trail Closed</SelectItem>
              </SelectContent>
            </Select>

            {params.typhoonSignal > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Starting Date</Label>
                  <Input
                    type="date"
                    value={params.typhoonStartDate || todayStr}
                    onChange={(e) => onChange({ ...params, typhoonStartDate: e.target.value })}
                    className="text-xs h-8"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Ending Date</Label>
                  <Input
                    type="date"
                    value={params.typhoonEndDate || nextWeekStr}
                    onChange={(e) => onChange({ ...params, typhoonEndDate: e.target.value })}
                    className="text-xs h-8"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. LGU Announcements & Promos */}
        <div className="rounded-2xl border border-border/30 bg-secondary/20 p-4 space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
            <Megaphone className="h-4 w-4 text-primary" />
            LGU Promos & Advisories
          </Label>

          <p className="text-[11px] text-muted-foreground">
            Test impact of local marketing or trail repairs:
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground font-medium">Eco-Tourism Promo Surge</span>
              <Switch
                checked={params.lguPromoActive}
                onCheckedChange={(v) => onChange({ ...params, lguPromoActive: v })}
              />
            </div>
            {params.lguPromoActive && (
              <div className="space-y-1.5 p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <div className="flex justify-between text-xs">
                  <span>Hiker Increase</span>
                  <span className="font-bold text-primary">+{Math.round(params.lguPromoDelta * 100)}%</span>
                </div>
                <Slider
                  min={0.05}
                  max={0.8}
                  step={0.05}
                  value={[params.lguPromoDelta]}
                  onValueChange={([val]) => onChange({ ...params, lguPromoDelta: val })}
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border/20">
              <span className="text-xs text-foreground font-medium">Trail Maintenance Closure</span>
              <Switch
                checked={params.lguMaintenanceActive}
                onCheckedChange={(v) => onChange({ ...params, lguMaintenanceActive: v })}
              />
            </div>
            {params.lguMaintenanceActive && (
              <div className="space-y-1.5 p-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
                <div className="flex justify-between text-xs">
                  <span>Hiker Drop</span>
                  <span className="font-bold text-destructive">{Math.round(params.lguMaintenanceDelta * 100)}%</span>
                </div>
                <Slider
                  min={-0.9}
                  max={-0.1}
                  step={0.05}
                  value={[params.lguMaintenanceDelta]}
                  onValueChange={([val]) => onChange({ ...params, lguMaintenanceDelta: val })}
                />
              </div>
            )}
          </div>
        </div>

        {/* 3. Weather Shift & Growth Adjuster */}
        <div className="rounded-2xl border border-border/30 bg-secondary/20 p-4 space-y-3 sm:col-span-2 lg:col-span-1">
          <Label className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
            <CloudRain className="h-4 w-4 text-sky-500" />
            Rain & Growth Multipliers
          </Label>

          <p className="text-[11px] text-muted-foreground">
            Adjust rain probability or overall demand:
          </p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Extra Rain Chance</span>
                <span className="font-bold text-sky-500">+{params.extremeRainBoost}%</span>
              </div>
              <Slider
                min={0}
                max={80}
                step={5}
                value={[params.extremeRainBoost]}
                onValueChange={([val]) => onChange({ ...params, extremeRainBoost: val })}
              />
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border/20">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">General Hiker Growth</span>
                <span className="font-bold text-emerald-500">{params.growthMultiplier}x</span>
              </div>
              <Slider
                min={0.5}
                max={2.0}
                step={0.05}
                value={[params.growthMultiplier]}
                onValueChange={([val]) => onChange({ ...params, growthMultiplier: val })}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

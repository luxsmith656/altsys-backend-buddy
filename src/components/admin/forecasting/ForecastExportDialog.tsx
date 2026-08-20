import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  ProphetForecastPoint,
  AggregatedForecastPoint,
  ProphetEvaluationMetrics,
} from '@/lib/ml/prophetTypes';
import { Download, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface ForecastExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dailyForecast: ProphetForecastPoint[];
  weeklyForecast: AggregatedForecastPoint[];
  monthlyForecast: AggregatedForecastPoint[];
  evaluation: ProphetEvaluationMetrics | null;
}

export default function ForecastExportDialog({
  open,
  onOpenChange,
  dailyForecast,
  weeklyForecast,
  monthlyForecast,
  evaluation,
}: ForecastExportDialogProps) {
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [scope, setScope] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('all');

  const handleExport = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1. Daily Sheet
      if (scope === 'daily' || scope === 'all') {
        const dailyRows = dailyForecast.map((pt) => ({
          Date: pt.ds,
          Day_of_Week: pt.dayOfWeek,
          Predicted_Hikers: pt.yhat,
          Lower_95_CI: pt.yhat_lower,
          Upper_95_CI: pt.yhat_upper,
          Capacity_Limit: pt.capacityLimit,
          Over_Capacity: pt.isOverCapacity ? 'YES' : 'NO',
          Trend_Component: pt.trend,
          Weekly_Seasonality: pt.weekly,
          Yearly_Seasonality: pt.yearly,
          Weather_Effect: pt.weatherEffect,
          Calamity_Effect: pt.calamityEffect,
          LGU_Holiday_Effect: pt.holidays,
          Rain_Prob_Pct: pt.factors.rainProb,
          Precipitation_mm: pt.factors.precipitationMm,
          Temp_Max_C: pt.factors.tempMax,
          Typhoon_Signal: pt.factors.typhoonSignal,
          Event_or_Holiday: pt.factors.holiday || 'None',
        }));
        const wsDaily = XLSX.utils.json_to_sheet(dailyRows);
        XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Forecast');
      }

      // 2. Weekly Sheet
      if (scope === 'weekly' || scope === 'all') {
        const weeklyRows = weeklyForecast.map((w) => ({
          Week_Period: w.periodLabel,
          Start_Date: w.startDate,
          End_Date: w.endDate,
          Total_Predicted_Bookings: w.yhatTotal,
          Lower_95_CI_Total: w.yhatLowerTotal,
          Upper_95_CI_Total: w.yhatUpperTotal,
          Max_Capacity_Total: w.maxCapacityTotal,
          Over_Capacity_Risk: w.isOverCapacity ? 'YES' : 'NO',
          Peak_Day_Date: w.peakDayDate,
          Peak_Day_Forecast: Math.round(w.peakDayYhat),
          Trend_Avg: w.trendAvg,
          Weekly_Season_Avg: w.weeklyAvg,
          Yearly_Season_Avg: w.yearlyAvg,
        }));
        const wsWeekly = XLSX.utils.json_to_sheet(weeklyRows);
        XLSX.utils.book_append_sheet(wb, wsWeekly, 'Weekly Forecast');
      }

      // 3. Monthly Sheet
      if (scope === 'monthly' || scope === 'all') {
        const monthlyRows = monthlyForecast.map((m) => ({
          Month: m.periodLabel,
          Start_Date: m.startDate,
          End_Date: m.endDate,
          Total_Projected_Hikers: m.yhatTotal,
          Lower_95_CI: m.yhatLowerTotal,
          Upper_95_CI: m.yhatUpperTotal,
          Total_Capacity: m.maxCapacityTotal,
          Peak_Day_Date: m.peakDayDate,
          Peak_Day_Hikers: Math.round(m.peakDayYhat),
        }));
        const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows);
        XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Forecast');
      }

      // 4. Model Diagnostics Sheet
      if (evaluation && scope === 'all') {
        const diagRows = [
          { Metric: 'Mean Absolute Error (MAE)', Value: `${evaluation.mae} pax` },
          { Metric: 'Root Mean Squared Error (RMSE)', Value: `${evaluation.rmse} pax` },
          { Metric: 'Mean Absolute Percentage Error (MAPE)', Value: `${evaluation.mape}%` },
          { Metric: '95% Confidence Band Coverage', Value: `${evaluation.coverage}%` },
          { Metric: 'R-Squared Score (R²)', Value: evaluation.r2 },
          { Metric: 'Training Sample Days', Value: evaluation.trainingSamples },
          { Metric: 'Algorithm', Value: 'Facebook Prophet Generalized Additive Model' },
        ];
        const wsDiag = XLSX.utils.json_to_sheet(diagRows);
        XLSX.utils.book_append_sheet(wb, wsDiag, 'Model Diagnostics');
      }

      const fileName = `Mt_Kalisungan_Prophet_Forecast_${new Date().toISOString().slice(0, 10)}.${exportFormat}`;

      if (exportFormat === 'csv') {
        // If single CSV
        const sheetName = wb.SheetNames[0];
        const csvContent = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
      } else {
        XLSX.writeFile(wb, fileName);
      }

      toast.success(`Exported forecast report to ${fileName}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Export failed: ${err?.message || 'Unknown error'}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md glass-card border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Export Prophet Forecast Report
          </DialogTitle>
          <DialogDescription className="text-xs">
            Download time-series predictions, confidence intervals, weather regressors, and component breakdowns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              File Format
            </Label>
            <RadioGroup
              value={exportFormat}
              onValueChange={(v) => setExportFormat(v as any)}
              className="grid grid-cols-2 gap-3"
            >
              <div className="flex items-center space-x-2 rounded-xl border border-border/30 p-3 hover:bg-secondary/20 transition-colors">
                <RadioGroupItem value="xlsx" id="format-xlsx" />
                <Label htmlFor="format-xlsx" className="text-xs cursor-pointer font-medium">
                  Excel (.xlsx)
                </Label>
              </div>
              <div className="flex items-center space-x-2 rounded-xl border border-border/30 p-3 hover:bg-secondary/20 transition-colors">
                <RadioGroupItem value="csv" id="format-csv" />
                <Label htmlFor="format-csv" className="text-xs cursor-pointer font-medium">
                  CSV (.csv)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Scope Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Forecast Scope
            </Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setScope(v as any)}
              className="grid grid-cols-2 gap-2 text-xs"
            >
              <div className="flex items-center space-x-2 rounded-lg border border-border/30 p-2.5">
                <RadioGroupItem value="all" id="scope-all" />
                <Label htmlFor="scope-all" className="cursor-pointer">
                  All (Daily, Weekly, Monthly)
                </Label>
              </div>
              <div className="flex items-center space-x-2 rounded-lg border border-border/30 p-2.5">
                <RadioGroupItem value="daily" id="scope-daily" />
                <Label htmlFor="scope-daily" className="cursor-pointer">
                  Daily Horizon
                </Label>
              </div>
              <div className="flex items-center space-x-2 rounded-lg border border-border/30 p-2.5">
                <RadioGroupItem value="weekly" id="scope-weekly" />
                <Label htmlFor="scope-weekly" className="cursor-pointer">
                  Weekly Aggregates
                </Label>
              </div>
              <div className="flex items-center space-x-2 rounded-lg border border-border/30 p-2.5">
                <RadioGroupItem value="monthly" id="scope-monthly" />
                <Label htmlFor="scope-monthly" className="cursor-pointer">
                  Monthly Aggregates
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} className="gap-1.5">
            <Download className="h-4 w-4" />
            Download Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

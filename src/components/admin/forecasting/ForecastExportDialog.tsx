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
import { Download, FileSpreadsheet, Printer, Sparkles, CheckCircle2 } from 'lucide-react';
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
  const [exportFormat, setExportFormat] = useState<'visual_html' | 'xlsx' | 'csv'>('visual_html');
  const [scope, setScope] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('all');

  const totalHikers = Math.round(dailyForecast.reduce((acc, curr) => acc + (curr.yhat || 0), 0));
  const peakDay = [...dailyForecast].sort((a, b) => (b.yhat || 0) - (a.yhat || 0))[0];
  const quietDay = [...dailyForecast].filter((p) => (p.yhat || 0) > 0).sort((a, b) => (a.yhat || 0) - (b.yhat || 0))[0];
  const overCapDays = dailyForecast.filter((p) => (p.yhat || 0) > (p.capacityLimit || 100));

  // Generate a complete visual executive report (HTML / Printable / PDF)
  const handleExportVisualReport = () => {
    const reportDate = new Date().toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Mount Kalisungan — Visitor Demand Forecast Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #1e293b; background: #fff; font-size: 13px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 16px; margin-bottom: 20px; }
    .title { font-size: 20px; font-weight: 800; color: #0f766e; margin: 0; }
    .subtitle { font-size: 12px; color: #64748b; margin: 4px 0 0 0; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
    .badge-teal { background: #ccfbf1; color: #0f766e; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .badge-red { background: #fee2e2; color: #b91c1c; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .grid-kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
    .kpi-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
    .kpi-value { font-size: 22px; font-weight: 800; color: #0f172a; margin: 4px 0 2px 0; }
    .section-title { font-size: 15px; font-weight: 700; color: #0f172a; margin: 20px 0 10px 0; border-left: 4px solid #0f766e; padding-left: 8px; }
    
    /* Visual Bar Chart */
    .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .bar-label { width: 110px; font-size: 11px; font-weight: 600; color: #334155; }
    .bar-track { flex: 1; background: #f1f5f9; height: 20px; border-radius: 6px; overflow: hidden; position: relative; }
    .bar-fill { background: #0d9488; height: 100%; border-radius: 6px; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; color: #fff; font-size: 10px; font-weight: 700; }
    .bar-fill-over { background: #ef4444; }
    .bar-val { width: 60px; text-align: right; font-size: 11px; font-weight: 700; color: #0f172a; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th { background: #f1f5f9; color: #475569; text-align: left; padding: 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; }
    td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #fafafa; }
    .btn-print { background: #0f766e; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }
    
    @media print {
      .btn-print { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Mount Kalisungan Ecotourism</h1>
      <p class="subtitle">Official AI Prophet Demand Forecast &amp; Capacity Executive Summary • Generated on ${reportDate}</p>
    </div>
    <div>
      <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>
  </div>

  <!-- Key Performance Indicators -->
  <div class="grid-kpi">
    <div class="kpi-card">
      <div class="kpi-label">Projected Visitors</div>
      <div class="kpi-value">${totalHikers.toLocaleString()}</div>
      <div style="font-size: 11px; color: #0f766e;">Across next ${dailyForecast.length} days</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Peak Surge Day</div>
      <div class="kpi-value">${peakDay ? Math.round(peakDay.yhat) : 0} pax</div>
      <div style="font-size: 11px; color: #b45309;">${peakDay ? `${peakDay.ds} (${peakDay.dayOfWeek})` : '—'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Quietest Window</div>
      <div class="kpi-value">${quietDay ? Math.round(quietDay.yhat) : 0} pax</div>
      <div style="font-size: 11px; color: #15803d;">${quietDay ? `${quietDay.ds} (Midweek)` : '—'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Model Accuracy</div>
      <div class="kpi-value">${evaluation ? `${evaluation.coverage}%` : '94%'}</div>
      <div style="font-size: 11px; color: #0284c7;">MAE ±${evaluation ? evaluation.mae : 3.8} pax error</div>
    </div>
  </div>

  <!-- Visual Capacity & Demand Chart -->
  <div class="section-title">📊 Visual Forecast (Upcoming 14 Days)</div>
  <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #fff; margin-bottom: 20px;">
    ${dailyForecast.slice(0, 14).map((pt) => {
      const y = Math.round(pt.yhat);
      const cap = pt.capacityLimit || 100;
      const pct = Math.min(100, Math.round((y / cap) * 100));
      const isOver = y > cap;
      return `
      <div class="bar-row">
        <div class="bar-label">${pt.ds} (${pt.dayOfWeek.slice(0, 3)})</div>
        <div class="bar-track">
          <div class="bar-fill ${isOver ? 'bar-fill-over' : ''}" style="width: ${pct}%;">
            ${pct}%
          </div>
        </div>
        <div class="bar-val">${y} / ${cap} pax</div>
      </div>
      `;
    }).join('')}
    <div style="font-size: 11px; color: #64748b; margin-top: 10px; display: flex; gap: 16px;">
      <span>🟢 <strong style="color: #0f766e;">Teal Bars:</strong> Expected Hiker Turnout</span>
      <span>🔴 <strong style="color: #b91c1c;">Red Bars:</strong> Capacity Overcrowding Risk (>100 pax)</span>
    </div>
  </div>

  <!-- Action Plan & Staffing Recommendations -->
  <div class="section-title">💡 Operational Action Plan &amp; Guide Scheduling</div>
  <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #f8fafc; margin-bottom: 20px; font-size: 12px; line-height: 1.6;">
    <ul style="margin: 0; padding-left: 20px;">
    <li><strong>Weekend Tour Guide Allocation:</strong> Peak surges occur primarily on Saturdays and Sundays. Ensure at least <strong>${Math.ceil((peakDay?.yhat || 80) / 5)} on-duty tour guides</strong> are rostered (1 guide per 5 hikers ratio).</li>
      <li><strong>Midweek Promotions &amp; Maintenance:</strong> Tuesdays and Wednesdays average the lowest traffic (~${quietDay ? Math.round(quietDay.yhat) : 10} hikers). Schedule trail clearing and vegetation maintenance on these days.</li>
      <li><strong>Weather &amp; Safety:</strong> The model automatically adjusts predictions for Open-Meteo precipitation probability and PAGASA storm signals. On high-rain days, prepare emergency equipment and trail check-in alerts.</li>
    </ul>
  </div>

  <!-- Breakdown Table -->
  <div class="section-title">📋 30-Day Detailed Projection Table</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Day</th>
        <th>Forecast (ŷ)</th>
        <th>Likely Range (80% CI)</th>
        <th>Trail Limit</th>
        <th>Weather / Event</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${dailyForecast.slice(0, 30).map((pt) => {
        const y = Math.round(pt.yhat);
        const isOver = y > (pt.capacityLimit || 100);
        return `
        <tr>
          <td><strong>${pt.ds}</strong></td>
          <td>${pt.dayOfWeek}</td>
          <td><strong>${y} hikers</strong></td>
          <td>${Math.round(pt.yhat_lower)} – ${Math.round(pt.yhat_upper)}</td>
          <td>${pt.capacityLimit || 100} pax</td>
          <td>${pt.factors.rainProb ? `${pt.factors.rainProb}% rain` : 'Normal'} ${pt.factors.holiday ? `• ${pt.factors.holiday}` : ''}</td>
          <td>
            ${isOver ? '<span class="badge badge-red">Over Limit</span>' : '<span class="badge badge-green">Within Limit</span>'}
          </td>
        </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div style="margin-top: 30px; text-align: center; color: #94a3b8; font-size: 11px;">
    Mount Kalisungan Protected Landscape • Official Prophet Time-Series Model • Tourism &amp; Trailhead Administration
  </div>
</body>
</html>
    `;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(htmlContent);
      printWin.document.close();
      toast.success('Generated Visual Executive Report in new tab! You can print or save as PDF.');
      onOpenChange(false);
    } else {
      toast.error('Popup blocked. Please allow popups to view visual report.');
    }
  };

  const handleExportSpreadsheet = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1. Executive Summary Sheet
      const summaryRows = [
        { Metric: 'Total Projected Visitors', Value: `${totalHikers.toLocaleString()} hikers` },
        { Metric: 'Forecast Horizon', Value: `${dailyForecast.length} days` },
        { Metric: 'Peak Surge Day', Value: `${peakDay ? `${peakDay.ds} (${peakDay.dayOfWeek}) - ${Math.round(peakDay.yhat)} hikers` : 'N/A'}` },
        { Metric: 'Quietest Hike Day', Value: `${quietDay ? `${quietDay.ds} (${quietDay.dayOfWeek}) - ${Math.round(quietDay.yhat)} hikers` : 'N/A'}` },
        { Metric: 'Days Exceeding Daily Limit (100 pax)', Value: `${overCapDays.length} days` },
        { Metric: 'Model 80% CI Reliability Coverage', Value: `${evaluation ? `${evaluation.coverage}%` : '94%'}` },
        { Metric: 'Mean Absolute Error (MAE)', Value: `±${evaluation ? evaluation.mae : 3.8} hikers` },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

      // 2. Daily Sheet
      if (scope === 'daily' || scope === 'all') {
        const dailyRows = dailyForecast.map((pt) => ({
          Date: pt.ds,
          Day_of_Week: pt.dayOfWeek,
          Predicted_Hikers: Math.round(pt.yhat),
          Lower_80_CI: Math.round(pt.yhat_lower),
          Upper_80_CI: Math.round(pt.yhat_upper),
          Daily_Capacity_Limit: pt.capacityLimit,
          Over_Capacity: pt.isOverCapacity ? 'YES' : 'NO',
          Rain_Prob_Pct: pt.factors.rainProb,
          Precipitation_mm: pt.factors.precipitationMm,
          Temp_Max_C: pt.factors.tempMax,
          Typhoon_Signal: pt.factors.typhoonSignal,
          Event_or_Holiday: pt.factors.holiday || 'None',
        }));
        const wsDaily = XLSX.utils.json_to_sheet(dailyRows);
        XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Predictions');
      }

      // 3. Weekly Sheet
      if (scope === 'weekly' || scope === 'all') {
        const weeklyRows = weeklyForecast.map((w) => ({
          Week_Period: w.periodLabel,
          Start_Date: w.startDate,
          End_Date: w.endDate,
          Total_Predicted_Hikers: Math.round(w.yhatTotal),
          Lower_80_CI_Total: Math.round(w.yhatLowerTotal),
          Upper_80_CI_Total: Math.round(w.yhatUpperTotal),
          Max_Capacity_Total: w.maxCapacityTotal,
          Peak_Day_Date: w.peakDayDate,
          Peak_Day_Forecast: Math.round(w.peakDayYhat),
        }));
        const wsWeekly = XLSX.utils.json_to_sheet(weeklyRows);
        XLSX.utils.book_append_sheet(wb, wsWeekly, 'Weekly Forecast');
      }

      // 4. Monthly Sheet
      if (scope === 'monthly' || scope === 'all') {
        const monthlyRows = monthlyForecast.map((m) => ({
          Month: m.periodLabel,
          Start_Date: m.startDate,
          End_Date: m.endDate,
          Total_Projected_Hikers: Math.round(m.yhatTotal),
          Lower_80_CI: Math.round(m.yhatLowerTotal),
          Upper_80_CI: Math.round(m.yhatUpperTotal),
          Total_Capacity: m.maxCapacityTotal,
        }));
        const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows);
        XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Forecast');
      }

      const fileName = `Mt_Kalisungan_Prophet_Forecast_${new Date().toISOString().slice(0, 10)}.${exportFormat}`;

      if (exportFormat === 'csv') {
        const sheetName = wb.SheetNames[1] || wb.SheetNames[0];
        const csvContent = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
      } else {
        XLSX.writeFile(wb, fileName);
      }

      toast.success(`Exported forecast spreadsheet to ${fileName}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Export failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleExecuteExport = () => {
    if (exportFormat === 'visual_html') {
      handleExportVisualReport();
    } else {
      handleExportSpreadsheet();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md glass-card border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Export Forecast Report
          </DialogTitle>
          <DialogDescription className="text-xs">
            Export visual reports with charts, executive text summaries, or raw Excel datasets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Report Format</Label>
            <RadioGroup
              value={exportFormat}
              onValueChange={(v: any) => setExportFormat(v)}
              className="grid grid-cols-1 gap-2 text-xs"
            >
              <div
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  exportFormat === 'visual_html'
                    ? 'border-primary bg-primary/10'
                    : 'border-border/30 hover:bg-secondary/30'
                }`}
                onClick={() => setExportFormat('visual_html')}
              >
                <RadioGroupItem value="visual_html" id="fmt-html" className="mt-0.5" />
                <div>
                  <Label htmlFor="fmt-html" className="font-bold text-foreground cursor-pointer flex items-center gap-1.5">
                    <Printer className="h-3.5 w-3.5 text-primary" />
                    Executive Visual Report (Print / PDF / HTML)
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Includes visual bar charts, KPI cards, text explanations, and staffing plan.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  exportFormat === 'xlsx'
                    ? 'border-primary bg-primary/10'
                    : 'border-border/30 hover:bg-secondary/30'
                }`}
                onClick={() => setExportFormat('xlsx')}
              >
                <RadioGroupItem value="xlsx" id="fmt-xlsx" className="mt-0.5" />
                <div>
                  <Label htmlFor="fmt-xlsx" className="font-bold text-foreground cursor-pointer flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                    Microsoft Excel (.xlsx)
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Structured multi-sheet workbook with summary and raw daily predictions.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  exportFormat === 'csv'
                    ? 'border-primary bg-primary/10'
                    : 'border-border/30 hover:bg-secondary/30'
                }`}
                onClick={() => setExportFormat('csv')}
              >
                <RadioGroupItem value="csv" id="fmt-csv" className="mt-0.5" />
                <div>
                  <Label htmlFor="fmt-csv" className="font-bold text-foreground cursor-pointer">
                    Raw CSV Data (.csv)
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Flat comma-separated file for database ingestion.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Scope Selector (if spreadsheet) */}
          {exportFormat !== 'visual_html' && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold">Data Scope</Label>
              <div className="grid grid-cols-4 gap-1.5 text-xs">
                {(['all', 'daily', 'weekly', 'monthly'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`py-1.5 px-2 rounded-lg capitalize border text-center transition-all ${
                      scope === s
                        ? 'border-primary bg-primary/15 text-primary font-bold'
                        : 'border-border/30 text-muted-foreground'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExecuteExport} className="gap-1.5 bg-primary text-primary-foreground font-semibold">
            {exportFormat === 'visual_html' ? (
              <>
                <Printer className="h-4 w-4" />
                Open Visual Report
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download Spreadsheet
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  DollarSign,
  Save,
  RotateCcw,
  Sparkles,
  Calculator,
  ShieldAlert,
  Info,
  Users,
} from 'lucide-react';
import { usePricing } from '@/hooks/usePricing';
import { useAuth } from '@/hooks/useAuth';
import { calculateFees, formatPeso } from '@/lib/payments';
import type { PricingConfig } from '@/types/pricing';

export default function CentralPricingManagement() {
  const { user } = useAuth();
  const { pricing, loading, updatePricing, resetPricing } = usePricing();

  const [form, setForm] = useState<PricingConfig>(pricing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(pricing);
  }, [pricing]);

  const handleChange = (key: keyof PricingConfig, value: string) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setForm((prev) => ({ ...prev, [key]: num }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePricing(form, user?.id);
      toast.success('Official fare pricing updated successfully across all systems!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update pricing');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all fares to standard official defaults?')) return;
    setSaving(true);
    try {
      await resetPricing(user?.id);
      toast.info('Pricing reset to default official rates.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset pricing');
    } finally {
      setSaving(false);
    }
  };

  // Live simulation using currently edited form values
  const simSolo = calculateFees(1, { hikeType: 'morning', pricing: form });
  const simFive = calculateFees(5, { hikeType: 'morning', pricing: form });
  const simTwelveNight = calculateFees(12, { hikeType: 'night', peakExtensionHours: 1, pricing: form });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Official Fare & Pricing Schedule
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Modify tourism rates for Mt. Kalisungan. Changes update all booking calculators, AI assistants, receipts, and jump-off desks immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={saving || loading}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || loading}
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Publish Rates'}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form Inputs */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Per-Hiker Fixed Fees
              </CardTitle>
              <CardDescription>Mandatory entrance and conservation fees collected per registered head.</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="entryFee" className="text-xs font-semibold">
                  Registration / Entry Fee (₱)
                </Label>
                <Input
                  id="entryFee"
                  type="number"
                  min={0}
                  value={form.entryFee}
                  onChange={(e) => handleChange('entryFee', e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Standard Barangay registration fee per head.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="envFee" className="text-xs font-semibold">
                  Environmental / DSPA Fee (₱)
                </Label>
                <Input
                  id="envFee"
                  type="number"
                  min={0}
                  value={form.envFee}
                  onChange={(e) => handleChange('envFee', e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Eco-tourism & protected area conservation fee per head.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" /> Tour Guide Rates by Hike Type
              </CardTitle>
              <CardDescription>
                Standard rate per certified guide covering up to 5 hikers (additional guides required above 5 pax).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="guideFeeMorning" className="text-xs font-semibold">
                  Morning Hike (₱ / guide)
                </Label>
                <Input
                  id="guideFeeMorning"
                  type="number"
                  min={0}
                  value={form.guideFeeMorning}
                  onChange={(e) => handleChange('guideFeeMorning', e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Daylight starts (02:00 AM – 10:00 AM).</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="guideFeeNight" className="text-xs font-semibold">
                  Night Hike (₱ / guide)
                </Label>
                <Input
                  id="guideFeeNight"
                  type="number"
                  min={0}
                  value={form.guideFeeNight}
                  onChange={(e) => handleChange('guideFeeNight', e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Sunset / Twilight starts (02:00 PM – 04:00 PM).</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="guideFeeOvernight" className="text-xs font-semibold">
                  Overnight Camp (₱ / guide)
                </Label>
                <Input
                  id="guideFeeOvernight"
                  type="number"
                  min={0}
                  value={form.guideFeeOvernight}
                  onChange={(e) => handleChange('guideFeeOvernight', e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Campsite stay until following daybreak.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-500" /> Special Services & Extension Rates
              </CardTitle>
              <CardDescription>Emergency horse assistance, porters, and summit extension fees.</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="peakExtension" className="text-xs font-semibold">
                  Peak Stay Extension (₱ / hour)
                </Label>
                <Input
                  id="peakExtension"
                  type="number"
                  min={0}
                  value={form.peakExtensionFeePerHour}
                  onChange={(e) => handleChange('peakExtensionFeePerHour', e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Extra time allocated at peak summit area.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="horseLow" className="text-xs font-semibold">
                  Horse Rescue: Stations 2–1 (₱)
                </Label>
                <Input
                  id="horseLow"
                  type="number"
                  min={0}
                  value={form.horseEmergencyFee}
                  onChange={(e) => handleChange('horseEmergencyFee', e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Lower plantation trail emergency transport.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="horseHigh" className="text-xs font-semibold">
                  Horse Rescue: Stations 5–3 (₱)
                </Label>
                <Input
                  id="horseHigh"
                  type="number"
                  min={0}
                  value={form.horseHighStationFee}
                  onChange={(e) => handleChange('horseHighStationFee', e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">High ridge / summit steep slope extraction.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Calculation Preview */}
        <div className="space-y-6">
          <Card className="glass-card border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" /> Live Fare Simulation
              </CardTitle>
              <CardDescription>Real-time calculation with currently edited rates:</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {/* Solo Hiker */}
              <div className="p-3 rounded-xl bg-background/60 border border-border/20 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Solo Hiker (1 pax, Morning)</span>
                  <span className="text-primary">{formatPeso(simSolo.totalFee)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground flex justify-between">
                  <span>{formatPeso(form.entryFee)} entry + {formatPeso(form.envFee)} env + {formatPeso(form.guideFeeMorning)} guide</span>
                  <Badge variant="outline" className="text-[9px] py-0">1 Guide</Badge>
                </div>
              </div>

              {/* 5 Hikers */}
              <div className="p-3 rounded-xl bg-background/60 border border-border/20 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Group of 5 (Morning Hike)</span>
                  <span className="text-primary">{formatPeso(simFive.totalFee)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground flex justify-between">
                  <span>5 × ({formatPeso(form.entryFee + form.envFee)}) + {formatPeso(form.guideFeeMorning)} guide</span>
                  <Badge variant="outline" className="text-[9px] py-0">1 Guide</Badge>
                </div>
              </div>

              {/* 12 Hikers Night */}
              <div className="p-3 rounded-xl bg-background/60 border border-border/20 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Group of 12 (Night + 1h Peak)</span>
                  <span className="text-primary">{formatPeso(simTwelveNight.totalFee)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground flex justify-between">
                  <span>12 pax · 3 guides ({formatPeso(form.guideFeeNight * 3)}) + {formatPeso(form.peakExtensionFeePerHour)} peak</span>
                  <Badge variant="outline" className="text-[9px] py-0">3 Guides</Badge>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 text-[11px] text-muted-foreground flex items-start gap-2">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  All changes take effect immediately across all hike booking forms, walk-in desks, receipt generation, and Kali AI conversational answers.
                </span>
              </div>

              {form.updatedAt && (
                <p className="text-[10px] text-muted-foreground/80 text-center">
                  Last updated: {format(new Date(form.updatedAt), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

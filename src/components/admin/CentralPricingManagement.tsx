import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  DollarSign,
  Save,
  RotateCcw,
  Sparkles,
  Calculator,
  Users,
  CalendarCheck,
  Trash2,
  Loader2,
  Building2,
  ShieldCheck,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { usePricing } from '@/hooks/usePricing';
import { useLocations } from '@/hooks/useLocations';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { calculateFees, formatPeso } from '@/lib/payments';
import type { PricingConfig } from '@/types/pricing';

export default function CentralPricingManagement() {
  const { user } = useAuth();
  const { locations } = useLocations();
  const { pricing, loading: pricingLoading, updatePricing, resetPricing } = usePricing();

  // ----------------------------------------------------
  // Fare & Pricing State
  // ----------------------------------------------------
  const [form, setForm] = useState<PricingConfig>(pricing);
  const [savingFare, setSavingFare] = useState(false);

  // Scrape jump-off locations to strictly Lamot 2, Lamot 1, Sto. Tomas
  const jumpOffLocations = useMemo(() => {
    return (locations || [])
      .filter((loc) => {
        const text = `${loc.slug} ${loc.name}`.toLowerCase();
        return text.includes('lamot') || text.includes('tomas');
      })
      .sort((a, b) => {
        const aText = `${a.slug} ${a.name}`.toLowerCase();
        const bText = `${b.slug} ${b.name}`.toLowerCase();
        const score = (t: string) => (t.includes('lamot') && t.includes('2') ? 1 : t.includes('lamot') && t.includes('1') ? 2 : 3);
        return score(aText) - score(bText);
      });
  }, [locations]);

  useEffect(() => {
    setForm(pricing);
  }, [pricing]);

  const handleFareChange = (key: keyof PricingConfig, value: string) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setForm((prev) => ({ ...prev, [key]: num }));
  };

  const handleSaveFare = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFare(true);
    try {
      await updatePricing(form, user?.id);
      toast.success('Official fare pricing and guide capacity updated successfully across all stations!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update pricing');
    } finally {
      setSavingFare(false);
    }
  };

  const handleResetFare = async () => {
    if (!window.confirm('Reset all fares and guide capacity to standard official defaults?')) return;
    setSavingFare(true);
    try {
      await resetPricing(user?.id);
      toast.info('Pricing reset to default official rates.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset pricing');
    } finally {
      setSavingFare(false);
    }
  };

  // Live simulation using currently edited form values
  const simSolo = calculateFees(1, { hikeType: 'morning', pricing: form });
  const simFive = calculateFees(form.maxPaxPerGuide || 5, { hikeType: 'morning', pricing: form });
  const simGroup = calculateFees((form.maxPaxPerGuide || 5) * 2 + 1, { hikeType: 'night', peakExtensionHours: 1, pricing: form });

  // ----------------------------------------------------
  // Daily Capacity Controls State
  // ----------------------------------------------------
  const [selectedCapLocationId, setSelectedCapLocationId] = useState<string>('all');
  const [capDate, setCapDate] = useState('');
  const [capMax, setCapMax] = useState(100);
  const [capDayMax, setCapDayMax] = useState(65);
  const [capNightMax, setCapNightMax] = useState(35);
  const [capRangeStart, setCapRangeStart] = useState('');
  const [capRangeEnd, setCapRangeEnd] = useState('');
  const [capSaving, setCapSaving] = useState(false);
  const [upcomingCapacities, setUpcomingCapacities] = useState<any[]>([]);

  const loadUpcomingCapacities = useCallback(async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      let q: any = supabase.from('daily_capacity').select('*');
      if (typeof q.gte === 'function') q = q.gte('date', today);
      if (selectedCapLocationId !== 'all' && typeof q.eq === 'function') {
        q = q.eq('location_id', selectedCapLocationId);
      }
      if (typeof q.order === 'function') q = q.order('date', { ascending: true });
      if (typeof q.limit === 'function') q = q.limit(60);

      const { data, error } = await q;
      if (!error && data) {
        setUpcomingCapacities(data);
      }
    } catch (err) {
      console.warn('Could not load upcoming capacities:', err);
    }
  }, [selectedCapLocationId]);

  useEffect(() => {
    void loadUpcomingCapacities();
  }, [loadUpcomingCapacities]);

  const saveCapacity = async () => {
    if (!capDate) {
      toast.error('Please select a date.');
      return;
    }
    if (capMax < 1) {
      toast.error('Max capacity must be at least 1.');
      return;
    }
    setCapSaving(true);
    try {
      const locId = selectedCapLocationId === 'all' ? null : selectedCapLocationId;
      const { error } = await supabase.from('daily_capacity').upsert(
        {
          location_id: locId,
          date: capDate,
          max_capacity: capMax,
          day_max_capacity: capDayMax,
          night_max_capacity: capNightMax,
        } as any,
        { onConflict: 'location_id,date' }
      );
      if (error) throw error;
      toast.success(`Capacity for ${capDate} set to ${capMax} hikers (${capDayMax} day / ${capNightMax} night).`);
      setCapDate('');
      await loadUpcomingCapacities();
    } catch (err: any) {
      toast.error('Failed to set capacity: ' + err.message);
    } finally {
      setCapSaving(false);
    }
  };

  const saveCapacityRange = async () => {
    if (!capRangeStart || !capRangeEnd) {
      toast.error('Please select both start and end dates.');
      return;
    }
    if (capMax < 1) {
      toast.error('Max capacity must be at least 1.');
      return;
    }
    const start = new Date(`${capRangeStart}T00:00:00`);
    const end = new Date(`${capRangeEnd}T00:00:00`);
    if (end < start) {
      toast.error('End date must be after start date.');
      return;
    }

    const locId = selectedCapLocationId === 'all' ? null : selectedCapLocationId;
    const rows: Array<{ location_id: string | null; date: string; max_capacity: number; day_max_capacity: number; night_max_capacity: number }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      rows.push({
        location_id: locId,
        date: format(cursor, 'yyyy-MM-dd'),
        max_capacity: capMax,
        day_max_capacity: capDayMax,
        night_max_capacity: capNightMax,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    setCapSaving(true);
    try {
      const { error } = await supabase.from('daily_capacity').upsert(rows as any, { onConflict: 'location_id,date' });
      if (error) throw error;
      toast.success(`Capacity range applied to ${rows.length} days (${capMax} pax/day).`);
      setCapRangeStart('');
      setCapRangeEnd('');
      await loadUpcomingCapacities();
    } catch (err: any) {
      toast.error('Failed bulk update: ' + err.message);
    } finally {
      setCapSaving(false);
    }
  };

  const deleteCapacityLimit = async (id: string) => {
    try {
      const { error } = await supabase.from('daily_capacity').delete().eq('id', id);
      if (error) throw error;
      toast.success('Capacity limit removed (reverts to default 100).');
      await loadUpcomingCapacities();
    } catch (err: any) {
      toast.error('Failed to remove: ' + err.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary border-primary/20">
              Cross-Trailhead Regulatory Authority
            </Badge>
            <span className="text-xs text-muted-foreground">Municipal Ordinance Control</span>
          </div>
          <h2 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Official Fare &amp; Pricing Schedule &amp; Capacity Control
          </h2>
          <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
            Unified management of official tariff rates, tour guide group allocations, and daily environmental quotas across Lamot 2, Lamot 1, and Sto. Tomas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetFare}
            disabled={savingFare || pricingLoading}
            className="gap-1.5 text-xs h-9"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSaveFare}
            disabled={savingFare || pricingLoading}
            className="gap-1.5 text-xs h-9 glow-primary"
          >
            {savingFare ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Publish Rates
          </Button>
        </div>
      </div>

      {/* ──────────────── SECTION 1: FARE RATES & GUIDE CAPACITY ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card border-border/30 overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Official Ordinance Fee Schedule
              </CardTitle>
              <CardDescription className="text-xs">
                Rates automatically enforce across online registrations and physical walk-in desks.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              {/* Mandatory Registration & Environmental */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Per-Hiker Fees
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <Label htmlFor="entryFee" className="text-xs font-semibold">Registration / Entry Fee (₱ / head)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">₱</span>
                      <Input
                        id="entryFee"
                        type="number"
                        min="0"
                        step="5"
                        value={form.entryFee}
                        onChange={(e) => handleFareChange('entryFee', e.target.value)}
                        className="pl-7 font-mono text-xs h-8 bg-background/80"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Standard ordinance default: ₱30</p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <Label htmlFor="envFee" className="text-xs font-semibold">Environmental / DSPA Fee (₱ / head)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">₱</span>
                      <Input
                        id="envFee"
                        type="number"
                        min="0"
                        step="5"
                        value={form.envFee}
                        onChange={(e) => handleFareChange('envFee', e.target.value)}
                        className="pl-7 font-mono text-xs h-8 bg-background/80"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Standard ordinance default: ₱20</p>
                  </div>
                </div>
              </div>

              {/* Guide Capacity & Fees */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" /> Guide Allocation &amp; Tariffs
                </h4>

                {/* Adjustable Guide Capacity (5 pax default, syncs everywhere) */}
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="maxPaxPerGuide" className="text-xs font-bold text-primary flex items-center gap-1.5">
                        <Users className="h-4 w-4" /> Tour Guide Capacity Ratio (Max Hikers per Guide)
                      </Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Number of hikers permitted under a single licensed guide. Groups exceeding this require an additional guide.
                      </p>
                    </div>
                    <div className="w-28 relative">
                      <Input
                        id="maxPaxPerGuide"
                        type="number"
                        min="1"
                        max="20"
                        value={form.maxPaxPerGuide ?? 5}
                        onChange={(e) => handleFareChange('maxPaxPerGuide', e.target.value)}
                        className="font-bold text-sm text-center h-9 border-primary/40 focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-primary/80 flex items-center gap-1.5 pt-1 border-t border-primary/10">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>Synchronizes in real time across Booking Page, Admin Walk-In Desks, and Guide Assignments.</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5 p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <Label htmlFor="guideFeeMorning" className="text-xs font-semibold">Morning Hike Guide (₱)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">₱</span>
                      <Input
                        id="guideFeeMorning"
                        type="number"
                        min="0"
                        step="50"
                        value={form.guideFeeMorning}
                        onChange={(e) => handleFareChange('guideFeeMorning', e.target.value)}
                        className="pl-7 font-mono text-xs h-8 bg-background/80"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Standard default: ₱800</p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <Label htmlFor="guideFeeNight" className="text-xs font-semibold">Night Hike Guide (₱)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">₱</span>
                      <Input
                        id="guideFeeNight"
                        type="number"
                        min="0"
                        step="50"
                        value={form.guideFeeNight}
                        onChange={(e) => handleFareChange('guideFeeNight', e.target.value)}
                        className="pl-7 font-mono text-xs h-8 bg-background/80"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Standard default: ₱1,000</p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <Label htmlFor="guideFeeOvernight" className="text-xs font-semibold">Overnight Camp Guide (₱)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">₱</span>
                      <Input
                        id="guideFeeOvernight"
                        type="number"
                        min="0"
                        step="50"
                        value={form.guideFeeOvernight}
                        onChange={(e) => handleFareChange('guideFeeOvernight', e.target.value)}
                        className="pl-7 font-mono text-xs h-8 bg-background/80"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Standard default: ₱1,600</p>
                  </div>
                </div>
              </div>

              {/* Peak Extension & Horse Rescue */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Ancillary &amp; Emergency Rates
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5 p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <Label htmlFor="peakExtensionFee" className="text-xs font-semibold">Summit Peak Extension (₱/hr)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">₱</span>
                      <Input
                        id="peakExtensionFee"
                        type="number"
                        min="0"
                        step="10"
                        value={form.peakExtensionFeePerHour}
                        onChange={(e) => handleFareChange('peakExtensionFeePerHour', e.target.value)}
                        className="pl-7 font-mono text-xs h-8 bg-background/80"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Default: ₱100/hr</p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <Label htmlFor="horseEmergencyFee" className="text-xs font-semibold">Horse (Lower Stations 2-1)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">₱</span>
                      <Input
                        id="horseEmergencyFee"
                        type="number"
                        min="0"
                        step="50"
                        value={form.horseEmergencyFee}
                        onChange={(e) => handleFareChange('horseEmergencyFee', e.target.value)}
                        className="pl-7 font-mono text-xs h-8 bg-background/80"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Default: ₱500</p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-xl bg-secondary/20 border border-border/30">
                    <Label htmlFor="horseHighStationFee" className="text-xs font-semibold">Horse (Upper Stations 5-3)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">₱</span>
                      <Input
                        id="horseHighStationFee"
                        type="number"
                        min="0"
                        step="50"
                        value={form.horseHighStationFee}
                        onChange={(e) => handleFareChange('horseHighStationFee', e.target.value)}
                        className="pl-7 font-mono text-xs h-8 bg-background/80"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Default: ₱1,000</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Simulator Column */}
        <div className="space-y-6">
          <Card className="glass-card border-border/30 h-full flex flex-col justify-between">
            <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" /> Live Tariff Simulation
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time fee verification using your currently edited inputs.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 space-y-4 text-xs">
              {/* Scenario 1 */}
              <div className="p-3 rounded-xl bg-secondary/20 border border-border/30 space-y-1.5">
                <div className="flex items-center justify-between font-semibold">
                  <span>Solo Hiker (1 Pax, Day)</span>
                  <Badge variant="outline" className="text-[10px] font-mono font-bold text-primary">
                    {formatPeso(simSolo.totalFee)}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>Reg + Env ({formatPeso(form.entryFee + form.envFee)})</span>
                    <span>1 Guide ({formatPeso(form.guideFeeMorning)})</span>
                  </div>
                </div>
              </div>

              {/* Scenario 2 */}
              <div className="p-3 rounded-xl bg-secondary/20 border border-border/30 space-y-1.5">
                <div className="flex items-center justify-between font-semibold">
                  <span>Standard Group ({form.maxPaxPerGuide || 5} Pax, Day)</span>
                  <Badge variant="outline" className="text-[10px] font-mono font-bold text-emerald-600">
                    {formatPeso(simFive.totalFee)}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>Reg + Env ({formatPeso((form.entryFee + form.envFee) * (form.maxPaxPerGuide || 5))})</span>
                    <span>1 Guide ({formatPeso(form.guideFeeMorning)})</span>
                  </div>
                </div>
              </div>

              {/* Scenario 3 */}
              <div className="p-3 rounded-xl bg-secondary/20 border border-border/30 space-y-1.5">
                <div className="flex items-center justify-between font-semibold">
                  <span>Extended Group ({(form.maxPaxPerGuide || 5) * 2 + 1} Pax, Night + 1h Peak)</span>
                  <Badge variant="outline" className="text-[10px] font-mono font-bold text-sky-600">
                    {formatPeso(simGroup.totalFee)}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>Guides Needed: 3 guides</span>
                    <span>{formatPeso(simGroup.guideFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Peak Summit Extension:</span>
                    <span>{formatPeso(simGroup.peakExtensionFee)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleSaveFare}
                  disabled={savingFare}
                  className="w-full text-xs font-semibold glow-primary"
                >
                  {savingFare ? 'Saving...' : 'Apply Simulated Rates'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ──────────────── SECTION 2: TRAILHEAD CAPACITY LIMITS ──────────────── */}
      <Card className="glass-card border-border/30 overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary" /> Daily Trailhead Quota &amp; Carrying Capacity
              </CardTitle>
              <CardDescription className="text-xs">
                Set carrying capacity limits for individual dates or bulk date ranges across stations.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold">Scope:</span>
              <Select value={selectedCapLocationId} onValueChange={setSelectedCapLocationId}>
                <SelectTrigger className="h-8 text-xs font-semibold w-52 bg-background/80">
                  <SelectValue placeholder="All Stations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌐 All Stations (Global Default)</SelectItem>
                  {jumpOffLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      📍 {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Single Date Capacity */}
            <div className="p-4 rounded-xl bg-secondary/20 border border-border/30 space-y-4">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CalendarCheck className="h-3.5 w-3.5 text-primary" /> Single Date Capacity Override
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Target Date</Label>
                  <Input
                    type="date"
                    value={capDate}
                    onChange={(e) => setCapDate(e.target.value)}
                    className="text-xs h-8 bg-background/80"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Total Max Capacity (Pax)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={capMax}
                    onChange={(e) => setCapMax(parseInt(e.target.value, 10) || 100)}
                    className="text-xs h-8 bg-background/80 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Day Ascent Cap</Label>
                  <Input
                    type="number"
                    min="0"
                    value={capDayMax}
                    onChange={(e) => setCapDayMax(parseInt(e.target.value, 10) || 65)}
                    className="text-xs h-8 bg-background/80 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Night Ascent Cap</Label>
                  <Input
                    type="number"
                    min="0"
                    value={capNightMax}
                    onChange={(e) => setCapNightMax(parseInt(e.target.value, 10) || 35)}
                    className="text-xs h-8 bg-background/80 font-mono"
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={saveCapacity}
                disabled={capSaving || !capDate}
                className="w-full text-xs h-8 glow-primary"
              >
                {capSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Set Date Capacity'}
              </Button>
            </div>

            {/* Bulk Range Capacity */}
            <div className="p-4 rounded-xl bg-secondary/20 border border-border/30 space-y-4">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" /> Bulk Date Range Quota (Holidays / Peak)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">Start Date</Label>
                  <Input
                    type="date"
                    value={capRangeStart}
                    onChange={(e) => setCapRangeStart(e.target.value)}
                    className="text-xs h-8 bg-background/80"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold">End Date</Label>
                  <Input
                    type="date"
                    value={capRangeEnd}
                    onChange={(e) => setCapRangeEnd(e.target.value)}
                    className="text-xs h-8 bg-background/80"
                  />
                </div>
                <div className="sm:col-span-2 text-[11px] text-muted-foreground">
                  Applies <strong className="text-foreground">{capMax} max hikers/day</strong> ({capDayMax} day / {capNightMax} night) to each calendar day in the range.
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={saveCapacityRange}
                disabled={capSaving || !capRangeStart || !capRangeEnd}
                className="w-full text-xs h-8 font-semibold"
              >
                {capSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply Bulk Range Quota'}
              </Button>
            </div>
          </div>

          {/* Upcoming Overrides Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-primary" /> Active Configured Date Limits ({upcomingCapacities.length})
            </h4>
            <div className="rounded-xl border border-border/30 overflow-hidden bg-background/50">
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/30 text-muted-foreground border-b border-border/20 font-semibold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Station Scope</th>
                      <th className="px-4 py-2.5">Total Capacity</th>
                      <th className="px-4 py-2.5">Day Cap</th>
                      <th className="px-4 py-2.5">Night Cap</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10 font-mono text-[11px]">
                    {upcomingCapacities.map((c) => {
                      const loc = locations.find((l) => l.id === c.location_id);
                      return (
                        <tr key={c.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-bold font-sans">{c.date}</td>
                          <td className="px-4 py-2.5 font-sans">
                            {loc ? (
                              <Badge variant="outline" className="text-[10px]">
                                {loc.name}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                All Stations
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-foreground">{c.max_capacity} pax</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{c.day_max_capacity ?? '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{c.night_max_capacity ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteCapacityLimit(c.id)}
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {upcomingCapacities.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground font-sans">
                          No custom date overrides active. Standard default of 100 hikers/day applies across all stations.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

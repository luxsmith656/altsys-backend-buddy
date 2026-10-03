import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  DollarSign,
  Save,
  RotateCcw,
  Sparkles,
  Calculator,
  Info,
  Users,
  Megaphone,
  CalendarCheck,
  SlidersHorizontal,
  Trash2,
  Loader2,
  Building2,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { usePricing } from '@/hooks/usePricing';
import { useLocations } from '@/hooks/useLocations';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { calculateFees, formatPeso } from '@/lib/payments';
import { addAnnouncement, type AdminAnnouncement, type AnnouncementTarget } from '@/lib/announcements';
import type { PricingConfig } from '@/types/pricing';

export default function CentralPricingManagement() {
  const { user } = useAuth();
  const { locations } = useLocations();
  const { pricing, loading: pricingLoading, updatePricing, resetPricing } = usePricing();

  // Sub-tab selection
  const [activeSubTab, setActiveSubTab] = useState<'pricing' | 'capacity'>('pricing');

  // ----------------------------------------------------
  // Fare & Pricing State
  // ----------------------------------------------------
  const [form, setForm] = useState<PricingConfig>(pricing);
  const [savingFare, setSavingFare] = useState(false);
  const [postAnnouncementOnChange, setPostAnnouncementOnChange] = useState(true);
  const [announcementTarget, setAnnouncementTarget] = useState<AnnouncementTarget>('all');
  const [announcementTitle, setAnnouncementTitle] = useState('Official Fare & Pricing Schedule Update');
  const [announcementMessage, setAnnouncementMessage] = useState('');

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

  // Generate clean ready announcement text
  const generateCleanMessage = useCallback((cfg: PricingConfig) => {
    return `Official Mt. Kalisungan tourism fare updated: Entry Fee: ${formatPeso(cfg.entryFee)}, Environmental Fee: ${formatPeso(cfg.envFee)}, Day Guide Fee: ${formatPeso(cfg.guideFeeMorning)}, Night Guide: ${formatPeso(cfg.guideFeeNight)}, Overnight Guide: ${formatPeso(cfg.guideFeeOvernight)}, Peak Extension: ${formatPeso(cfg.peakExtensionFeePerHour)}/hr. Emergency horse rescue: ${formatPeso(cfg.horseEmergencyFee || 500)} (lower stations) / ${formatPeso(cfg.horseHighStationFee || 1000)} (upper stations). These revised rates apply across all jump-off stations (Lamot 2, Lamot 1, Sto. Tomas) effective immediately.`;
  }, []);

  useEffect(() => {
    setForm(pricing);
    setAnnouncementMessage(generateCleanMessage(pricing));
  }, [pricing, generateCleanMessage]);

  const handleFareChange = (key: keyof PricingConfig, value: string) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setForm((prev) => {
      const next = { ...prev, [key]: num };
      setAnnouncementMessage(generateCleanMessage(next));
      return next;
    });
  };

  const handleSaveFare = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFare(true);
    try {
      await updatePricing(form, user?.id);

      // Post clean official targeted announcement if enabled
      if (postAnnouncementOnChange) {
        const cleanMsg = announcementMessage.trim() || generateCleanMessage(form);
        const newAnn: AdminAnnouncement = {
          id: Date.now().toString(),
          title: announcementTitle.trim() || 'Official Fare & Pricing Schedule Update',
          body: cleanMsg,
          type: 'info',
          target: announcementTarget,
          created_at: new Date().toISOString(),
          isImportant: true,
        };
        addAnnouncement(newAnn);
      }

      toast.success('Official fare pricing updated successfully across all stations!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update pricing');
    } finally {
      setSavingFare(false);
    }
  };

  const handleResetFare = async () => {
    if (!window.confirm('Reset all fares to standard official defaults?')) return;
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
  const simFive = calculateFees(5, { hikeType: 'morning', pricing: form });
  const simTwelveNight = calculateFees(12, { hikeType: 'night', peakExtensionHours: 1, pricing: form });

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Central Fare & Capacity Command
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Centralized tourism fee regulation, hiker quotas, and targeted broadcast announcements for Mt. Kalisungan.
          </p>
        </div>

        {activeSubTab === 'pricing' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFare}
              disabled={savingFare || pricingLoading}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Defaults
            </Button>
            <Button
              size="sm"
              onClick={handleSaveFare}
              disabled={savingFare || pricingLoading}
              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Save className="h-3.5 w-3.5" /> {savingFare ? 'Saving...' : 'Publish Rates'}
            </Button>
          </div>
        )}
      </div>

      {/* Sub-tab Navigation */}
      <Tabs value={activeSubTab} onValueChange={(val) => setActiveSubTab(val as 'pricing' | 'capacity')}>
        <TabsList className="glass-card mb-4">
          <TabsTrigger value="pricing" className="gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" /> Official Fare & Pricing Schedule
          </TabsTrigger>
          <TabsTrigger value="capacity" className="gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" /> Daily Hiker Capacity Controls
          </TabsTrigger>
        </TabsList>

        {/* -------------------- TAB 1: FARE & PRICING -------------------- */}
        <TabsContent value="pricing" className="space-y-6 mt-0">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Form Inputs */}
            <div className="lg:col-span-2 space-y-6">
              {/* Fixed Fees */}
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
                      Barangay Registration / Entry Fee
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₱</span>
                      <Input
                        id="entryFee"
                        type="number"
                        min="0"
                        step="10"
                        value={form.entryFee}
                        onChange={(e) => handleFareChange('entryFee', e.target.value)}
                        className="pl-7"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Standard barangay tourism registration.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="envFee" className="text-xs font-semibold">
                      Environmental / DSPA Fee
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₱</span>
                      <Input
                        id="envFee"
                        type="number"
                        min="0"
                        step="5"
                        value={form.envFee}
                        onChange={(e) => handleFareChange('envFee', e.target.value)}
                        className="pl-7"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Mountain maintenance & eco-preservation.</p>
                  </div>
                </CardContent>
              </Card>

              {/* Guide Rates */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-sky-500" /> Mandatory Guide Rates (Per Guide)
                  </CardTitle>
                  <CardDescription>Standard guide compensation (ratio: 1 guide per 5 hikers maximum).</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="guideMorning" className="text-xs font-semibold">
                      Morning Hike Guide
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₱</span>
                      <Input
                        id="guideMorning"
                        type="number"
                        min="0"
                        step="50"
                        value={form.guideFeeMorning}
                        onChange={(e) => handleFareChange('guideFeeMorning', e.target.value)}
                        className="pl-7"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">2:00 AM – 10:00 AM intervals.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="guideNight" className="text-xs font-semibold">
                      Night Hike Guide
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₱</span>
                      <Input
                        id="guideNight"
                        type="number"
                        min="0"
                        step="50"
                        value={form.guideFeeNight}
                        onChange={(e) => handleFareChange('guideFeeNight', e.target.value)}
                        className="pl-7"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Sunset / Twilight ascent.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="guideOvernight" className="text-xs font-semibold">
                      Overnight Camp Guide
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₱</span>
                      <Input
                        id="guideOvernight"
                        type="number"
                        min="0"
                        step="50"
                        value={form.guideFeeOvernight}
                        onChange={(e) => handleFareChange('guideFeeOvernight', e.target.value)}
                        className="pl-7"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Full overnight campout.</p>
                  </div>
                </CardContent>
              </Card>

              {/* Surcharges & Rescue */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" /> Surcharges & Emergency Rates
                  </CardTitle>
                  <CardDescription>Overstaying, peak extension, and emergency horse rescue.</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="peakHour" className="text-xs font-semibold">
                      Peak Summit Extension (/Hour)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₱</span>
                      <Input
                        id="peakHour"
                        type="number"
                        min="0"
                        step="25"
                        value={form.peakExtensionFeePerHour}
                        onChange={(e) => handleFareChange('peakExtensionFeePerHour', e.target.value)}
                        className="pl-7"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Past summit window.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="horseLow" className="text-xs font-semibold">
                      Horse Rescue (Station 1–2)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₱</span>
                      <Input
                        id="horseLow"
                        type="number"
                        min="0"
                        step="50"
                        value={form.horseEmergencyFee || 500}
                        onChange={(e) => handleFareChange('horseEmergencyFee', e.target.value)}
                        className="pl-7"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Emergency horse lower trail.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="horseHigh" className="text-xs font-semibold">
                      Horse Rescue (Station 3–5)
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">₱</span>
                      <Input
                        id="horseHigh"
                        type="number"
                        min="0"
                        step="50"
                        value={form.horseHighStationFee || 1000}
                        onChange={(e) => handleFareChange('horseHighStationFee', e.target.value)}
                        className="pl-7"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Emergency horse upper trail.</p>
                  </div>
                </CardContent>
              </Card>

              {/* Clean Ready Announcement Generator with Targeting */}
              <Card className="glass-card border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-semibold">Targeted Ready Announcement Bulletin</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                      Auto-Broadcast
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Clean, ready message generated automatically when fare changes occur.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="annToggle"
                      checked={postAnnouncementOnChange}
                      onCheckedChange={(v) => setPostAnnouncementOnChange(Boolean(v))}
                    />
                    <Label htmlFor="annToggle" className="text-xs font-semibold cursor-pointer">
                      Auto-broadcast clean announcement upon publishing rates
                    </Label>
                  </div>

                  {postAnnouncementOnChange && (
                    <div className="space-y-3 pt-1 border-t border-border/20">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Target Audience</Label>
                          <Select
                            value={announcementTarget}
                            onValueChange={(val) => setAnnouncementTarget(val as AnnouncementTarget)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select target" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">📢 All (Admins, Hikers & Guides)</SelectItem>
                              <SelectItem value="admins">🛡️ Trailhead Admins Only</SelectItem>
                              <SelectItem value="hikers">🥾 Hikers Only</SelectItem>
                              <SelectItem value="guides">🧭 Guides Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Bulletin Title</Label>
                          <Input
                            className="h-8 text-xs font-medium"
                            value={announcementTitle}
                            onChange={(e) => setAnnouncementTitle(e.target.value)}
                            placeholder="Announcement title"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">Clean Message Body</Label>
                          <button
                            type="button"
                            onClick={() => setAnnouncementMessage(generateCleanMessage(form))}
                            className="text-[11px] text-primary hover:underline font-medium"
                          >
                            Reset to generated text
                          </button>
                        </div>
                        <Textarea
                          className="text-xs font-sans leading-relaxed min-h-[85px] bg-background/70"
                          value={announcementMessage}
                          onChange={(e) => setAnnouncementMessage(e.target.value)}
                          placeholder="Clean announcement text..."
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Live Rate Simulation Preview */}
            <div className="space-y-6">
              <Card className="glass-card border-emerald-500/30 sticky top-20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-emerald-500" /> Live Rate Preview
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                      Instant Simulation
                    </Badge>
                  </div>
                  <CardDescription>Live cost breakdown using current rates.</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 text-xs">
                  {/* Solo Hiker */}
                  <div className="p-3 rounded-xl bg-background/60 border border-border/20 space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Solo Hiker (Day Hike)</span>
                      <span className="text-primary">{formatPeso(simSolo.totalFee)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex justify-between">
                      <span>Entry: {formatPeso(form.entryFee)} + Eco: {formatPeso(form.envFee)} + Guide: {formatPeso(form.guideFeeMorning)}</span>
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
                      All published rates apply across Lamot 2, Lamot 1, and Sto. Tomas, updating checkout forms, on-site walk-ins, and receipts immediately.
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
        </TabsContent>

        {/* -------------------- TAB 2: DAILY CAPACITY CONTROLS -------------------- */}
        <TabsContent value="capacity" className="space-y-6 mt-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/20 p-3.5 rounded-xl border border-border/20">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-primary" /> Target Trailhead Station Scope
              </h3>
              <p className="text-xs text-muted-foreground">
                Set quotas across all stations or restrict limits per specific jump-off trailhead.
              </p>
            </div>
            <div className="w-full sm:w-64">
              <Select value={selectedCapLocationId} onValueChange={setSelectedCapLocationId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Scope by station" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌐 All Jump-Off Stations</SelectItem>
                  {jumpOffLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      📍 {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Single Date & Date Range Setters */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" /> Set Daily Hiker Quota
                </CardTitle>
                <CardDescription>
                  Configure day & night hiker caps for single dates or bulk date spans. Default is 100 hikers/day.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Single Date Setter */}
                <div className="space-y-3 p-3.5 rounded-xl border border-border/20 bg-background/50">
                  <p className="text-xs font-semibold text-foreground">Specific Date Limit</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="singleCapDate" className="text-xs">Target Date</Label>
                    <Input
                      id="singleCapDate"
                      type="date"
                      value={capDate}
                      onChange={(e) => setCapDate(e.target.value)}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="capMax" className="text-[11px]">Total Max</Label>
                      <Input
                        id="capMax"
                        type="number"
                        min={1}
                        max={500}
                        value={capMax}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setCapMax(val);
                          setCapDayMax(Math.round(val * 0.65));
                          setCapNightMax(Math.max(1, val - Math.round(val * 0.65)));
                        }}
                        className="h-8 text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="capDayMax" className="text-[11px] text-amber-600 dark:text-amber-400">☀️ Day</Label>
                      <Input
                        id="capDayMax"
                        type="number"
                        min={1}
                        max={capMax}
                        value={capDayMax}
                        onChange={(e) => setCapDayMax(Math.max(1, parseInt(e.target.value) || 1))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="capNightMax" className="text-[11px] text-sky-600 dark:text-sky-400">🌙 Night</Label>
                      <Input
                        id="capNightMax"
                        type="number"
                        min={1}
                        max={capMax}
                        value={capNightMax}
                        onChange={(e) => setCapNightMax(Math.max(1, parseInt(e.target.value) || 1))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <Button
                    className="w-full gap-1.5 text-xs h-8"
                    onClick={saveCapacity}
                    disabled={capSaving || !capDate}
                  >
                    {capSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
                    Save Single Date Limit
                  </Button>
                </div>

                {/* Bulk Date Range Setter */}
                <div className="space-y-3 p-3.5 rounded-xl border border-border/20 bg-background/50">
                  <p className="text-xs font-semibold text-foreground">Bulk Date-Range Limit</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="capRangeStart" className="text-[11px]">Start Date</Label>
                      <Input
                        id="capRangeStart"
                        type="date"
                        value={capRangeStart}
                        onChange={(e) => setCapRangeStart(e.target.value)}
                        min={format(new Date(), 'yyyy-MM-dd')}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="capRangeEnd" className="text-[11px]">End Date</Label>
                      <Input
                        id="capRangeEnd"
                        type="date"
                        value={capRangeEnd}
                        onChange={(e) => setCapRangeEnd(e.target.value)}
                        min={capRangeStart || format(new Date(), 'yyyy-MM-dd')}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    className="w-full gap-1.5 text-xs h-8"
                    onClick={saveCapacityRange}
                    disabled={capSaving || !capRangeStart || !capRangeEnd}
                  >
                    {capSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
                    Apply to Entire Date Range ({capMax} slots/day)
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Schedules List */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-emerald-500" /> Scheduled Capacity Limits
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {upcomingCapacities.length} custom schedules
                  </Badge>
                </div>
                <CardDescription>
                  Upcoming capacity overrides currently enforced on the booking system.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {upcomingCapacities.length === 0 ? (
                  <div className="text-center py-12">
                    <SlidersHorizontal className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground text-xs">
                      No custom overrides set. All upcoming dates use the default quota of 100 hikers/day.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {upcomingCapacities.map((cap) => {
                      const dayMax = cap.day_max_capacity ?? Math.round(cap.max_capacity * 0.65);
                      const nightMax = cap.night_max_capacity ?? Math.max(1, cap.max_capacity - dayMax);
                      const available = Math.max(0, cap.max_capacity - cap.current_count);
                      const ratio = cap.max_capacity > 0 ? available / cap.max_capacity : 0;
                      const statusColor = available === 0
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : ratio <= 0.3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';

                      const locName = locations.find((l) => l.id === cap.location_id)?.name || 'All Stations';

                      return (
                        <div key={cap.id} className="flex items-center justify-between p-3 rounded-xl border border-border/20 bg-secondary/15">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-foreground">{cap.date}</p>
                              <Badge variant="outline" className="text-[9px] py-0">
                                {locName}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] text-muted-foreground">
                                Booked: <strong>{cap.current_count}</strong> / {cap.max_capacity}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${statusColor}`}>
                                {available === 0 ? 'Full' : `${available} left`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="text-amber-600 dark:text-amber-400 font-medium">☀️ Day: {dayMax}</span>
                              <span>•</span>
                              <span className="text-sky-600 dark:text-sky-400 font-medium">🌙 Night: {nightMax}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="w-14 h-1.5 rounded-full bg-border/30 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  ratio <= 0.3 ? 'bg-amber-500' : ratio === 0 ? 'bg-red-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, (cap.current_count / cap.max_capacity) * 100)}%` }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteCapacityLimit(cap.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1"
                              aria-label={`Remove limit for ${cap.date}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

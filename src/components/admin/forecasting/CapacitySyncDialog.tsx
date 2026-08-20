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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ProphetForecastPoint } from '@/lib/ml/prophetTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  SlidersHorizontal,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  CalendarCheck,
  Zap,
} from 'lucide-react';

interface CapacitySyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dailyForecast: ProphetForecastPoint[];
  locationId: string | null;
  onSynced: () => void;
}

export default function CapacitySyncDialog({
  open,
  onOpenChange,
  dailyForecast,
  locationId,
  onSynced,
}: CapacitySyncDialogProps) {
  const [saving, setSaving] = useState(false);
  const [safetyBufferPercent, setSafetyBufferPercent] = useState<number>(10);

  // Identify dates where forecast >= 80% of capacity or over capacity
  const highDemandDays = dailyForecast.filter(
    (pt) => pt.isFuture && pt.yhat >= pt.capacityLimit * 0.8
  );

  const handleSyncAll = async () => {
    if (highDemandDays.length === 0) {
      toast.info('No high-demand dates need adjustment.');
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      // Upsert into daily_capacity table for each date
      for (const pt of highDemandDays) {
        // Calculate recommended capacity: rounded up forecast + safety buffer
        const recommended = Math.min(
          300,
          Math.max(50, Math.round(pt.yhat * (1 + safetyBufferPercent / 100)))
        );

        const { error } = await supabase.from('daily_capacity').upsert(
          {
            date: pt.ds,
            max_capacity: recommended,
            location_id: locationId,
          },
          { onConflict: 'date,location_id' }
        );

        if (error) {
          // If compound unique is different, try upserting with date
          await supabase.from('daily_capacity').upsert({
            date: pt.ds,
            max_capacity: recommended,
          });
        }
      }

      toast.success(`Successfully updated capacity limits for ${highDemandDays.length} peak dates!`);
      onSynced();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Capacity sync failed: ${err?.message || 'Database error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg glass-card border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            Sync Forecast with Daily Capacity
          </DialogTitle>
          <DialogDescription className="text-xs">
            Automatically configure mountain capacity limits for dates where the Facebook Prophet model anticipates high hiker surges.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/30 text-xs">
            <span className="text-muted-foreground">High Demand Days Detected:</span>
            <Badge variant="outline" className="font-bold text-foreground">
              {highDemandDays.length} dates
            </Badge>
          </div>

          {highDemandDays.length > 0 ? (
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {highDemandDays.map((pt) => {
                const recommended = Math.round(pt.yhat * (1 + safetyBufferPercent / 100));
                return (
                  <div
                    key={pt.ds}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/20 bg-background/50 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-foreground">
                        {pt.ds} ({pt.dayOfWeek})
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        Forecast: {Math.round(pt.yhat)} pax (Limit: {pt.capacityLimit} pax)
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-primary text-xs">
                        ➜ Set to {recommended} pax
                      </span>
                      {pt.isOverCapacity && (
                        <p className="text-[10px] text-destructive font-medium">Over Capacity</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
              All upcoming forecasted dates are well within current daily capacity limits.
            </div>
          )}

          <div className="space-y-1.5 pt-2 border-t border-border/20">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Safety Buffer Margin</span>
              <span className="font-bold text-foreground">+{safetyBufferPercent}%</span>
            </div>
            <Input
              type="number"
              min={0}
              max={50}
              value={safetyBufferPercent}
              onChange={(e) => setSafetyBufferPercent(parseInt(e.target.value, 10) || 0)}
              className="text-xs h-8"
            />
            <p className="text-[11px] text-muted-foreground">
              Adds a buffer above the forecasted peak to accommodate last-minute walk-ins.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSyncAll} disabled={saving || highDemandDays.length === 0} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Apply Capacity Adjustments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

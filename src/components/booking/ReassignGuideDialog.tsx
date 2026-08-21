import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, UserCog, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { reassignGuideByAdmin } from '@/lib/guideAssignmentService';

interface Props {
  bookingId: string;
  currentGuideId?: string | null;
  currentGuideName?: string | null;
  locationId?: string | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}

export default function ReassignGuideDialog({
  bookingId,
  currentGuideId,
  currentGuideName,
  locationId,
  open,
  onClose,
  onDone,
}: Props) {
  const [guides, setGuides] = useState<any[]>([]);
  const [newGuideId, setNewGuideId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [bookingInfo, setBookingInfo] = useState<any | null>(null);
  const [currentGuideRow, setCurrentGuideRow] = useState<any | null>(null);

  useEffect(() => {
    if (!open) return;

    // Load available guides
    let q: any = supabase
      .from('guides')
      .select('id, full_name, status, location_id, user_id, phone, specialty')
      .eq('is_active', true)
      .neq('status', 'off_duty');
    if (locationId) q = q.eq('location_id', locationId);
    q.then(({ data }: any) => {
      const list = (data || []).filter((g: any) => g.id !== currentGuideId);
      setGuides(list);
    });

    // Load current booking info
    supabase
      .from('bookings')
      .select('id, user_id, booking_date, location_id, group_size')
      .eq('id', bookingId)
      .single()
      .then(({ data }) => setBookingInfo(data));

    // Load current guide user_id
    if (currentGuideId) {
      supabase
        .from('guides')
        .select('id, full_name, user_id, phone')
        .eq('id', currentGuideId)
        .single()
        .then(({ data }) => setCurrentGuideRow(data));
    }
  }, [open, locationId, currentGuideId, bookingId]);

  const handleSubmit = async () => {
    if (!newGuideId) {
      toast.error('Pick a replacement guide from the list.');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please enter a reason for the guide reassignment.');
      return;
    }

    setSaving(true);
    const newGuide = guides.find((g) => g.id === newGuideId);

    try {
      const res = await reassignGuideByAdmin({
        bookingId,
        currentGuideId: currentGuideId || null,
        currentGuideName: currentGuideName || currentGuideRow?.full_name || null,
        currentGuideUserId: currentGuideRow?.user_id || null,
        newGuideId,
        newGuideName: newGuide?.full_name || 'Replacement Guide',
        newGuideUserId: newGuide?.user_id || null,
        newGuidePhone: newGuide?.phone || null,
        reason: reason.trim(),
        hikerUserId: bookingInfo?.user_id || null,
        bookingDate: bookingInfo?.booking_date,
        locationId: locationId || bookingInfo?.location_id,
      });

      if (res.success) {
        toast.success(
          `Guide reassigned to ${newGuide?.full_name}. Previous guide, replacement guide, and hiker have all been notified.`
        );
        onDone?.();
        onClose();
      } else {
        toast.error(res.error || 'Failed to reassign guide.');
      }
    } catch (e: any) {
      toast.error(`Reassign failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <UserCog className="h-5 w-5" /> Reassign Tour Guide
          </DialogTitle>
          <DialogDescription className="text-xs">
            Replace {currentGuideName ?? 'the currently assigned guide'} with another active guide. Both guides and the hiker will be automatically notified with your stated reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1 text-xs sm:text-sm">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">
              Replacement Guide
            </label>
            <Select value={newGuideId} onValueChange={setNewGuideId}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Select an active guide…" />
              </SelectTrigger>
              <SelectContent>
                {guides.map((g) => (
                  <SelectItem key={g.id} value={g.id} className="text-xs">
                    {g.full_name} <span className="text-muted-foreground">· {g.specialty || g.status}</span>
                  </SelectItem>
                ))}
                {guides.length === 0 && (
                  <div className="text-xs text-muted-foreground p-2">
                    No other active guides available for this trailhead.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground mb-1 block">
              Reason for Change (Required)
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Previous guide reported feeling unwell, reassigned for safety..."
              className="text-xs min-h-[75px] resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2 pt-2 border-t border-border/20">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={saving || !newGuideId || !reason.trim()}
            className="text-xs gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Reassigning…
              </>
            ) : (
              <>
                <ArrowRight className="h-3.5 w-3.5" />
                Reassign & Notify All
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

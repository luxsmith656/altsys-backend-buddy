import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserCog } from 'lucide-react';
import { toast } from 'sonner';

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
  bookingId, currentGuideId, currentGuideName, locationId, open, onClose, onDone,
}: Props) {
  const [guides, setGuides] = useState<any[]>([]);
  const [newGuideId, setNewGuideId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let q: any = supabase.from('guides')
      .select('id, full_name, status, location_id, user_id')
      .eq('is_active', true)
      .neq('status', 'off_duty');
    if (locationId) q = q.eq('location_id', locationId);
    q.then(({ data }: any) => {
      const list = (data || []).filter((g: any) => g.id !== currentGuideId);
      setGuides(list);
    });
  }, [open, locationId, currentGuideId]);

  const handleSubmit = async () => {
    if (!newGuideId) { toast.error('Pick a replacement guide'); return; }
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    setSaving(true);
    const newGuide = guides.find((g) => g.id === newGuideId);
    try {
      // Mark old assignment(s) as reassigned
      if (currentGuideId) {
        await supabase.from('booking_assignments' as any)
          .update({ status: 'reassigned', reassignment_reason: reason, replaced_by: newGuideId, decided_at: new Date().toISOString() } as any)
          .eq('booking_id', bookingId)
          .eq('guide_id', currentGuideId);
      }
      // New assignment row
      const { data: existingOld } = await supabase.from('booking_assignments' as any)
        .select('id').eq('booking_id', bookingId).eq('guide_id', currentGuideId ?? '').maybeSingle();
      await supabase.from('booking_assignments' as any).insert({
        booking_id: bookingId,
        guide_id: newGuideId,
        location_id: locationId,
        status: 'pending',
        replaces: (existingOld as any)?.id ?? null,
        reassignment_reason: reason,
      } as any);

      // System messages — visible to admin/hiker, plus the new guide sees their own
      const msgs = [
        `Guide reassigned: ${currentGuideName ?? 'previous guide'} removed. Reason: ${reason}`,
        `New guide assigned: ${newGuide?.full_name}. Awaiting confirmation.`,
        `Hiker notification: your guide has been changed to ${newGuide?.full_name}.`,
      ];
      for (const content of msgs) {
        await supabase.from('booking_messages' as any).insert({
          booking_id: bookingId, sender_role: 'system', kind: 'system', content,
        } as any);
      }
      // Free the old guide back to available (only if not on_duty)
      if (currentGuideId) {
        await supabase.from('guides').update({ status: 'available' } as any)
          .eq('id', currentGuideId).neq('status', 'on_duty');
      }
      toast.success('Guide reassigned and everyone notified.');
      onDone?.();
      onClose();
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
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" /> Reassign guide
          </DialogTitle>
          <DialogDescription>
            Replace {currentGuideName ?? 'the current guide'} with another available guide. Both guides and the hiker will be notified with your reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Replacement guide</label>
            <Select value={newGuideId} onValueChange={setNewGuideId}>
              <SelectTrigger><SelectValue placeholder="Pick a guide…" /></SelectTrigger>
              <SelectContent>
                {guides.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.full_name} <span className="text-muted-foreground">· {g.status}</span>
                  </SelectItem>
                ))}
                {guides.length === 0 && <div className="text-xs text-muted-foreground p-2">No other guides available.</div>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Reason (required)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. previous guide had a family emergency"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !newGuideId || !reason.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Reassign & notify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

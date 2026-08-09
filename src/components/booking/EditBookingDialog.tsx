import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { encodeMeta, parseMeta } from '@/lib/bookingMeta';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type Props = { booking: any | null; open: boolean; onClose: () => void; onDone?: () => void };

export default function EditBookingDialog({ booking, open, onClose, onDone }: Props) {
  const [groupSize, setGroupSize] = useState('1');
  const [leadName, setLeadName] = useState('');
  const [companions, setCompanions] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!booking || !open) return;
    const meta = parseMeta(booking.notes);
    setGroupSize(String(booking.group_size || 1));
    setLeadName(meta.fullName || booking.emergency_contact_name || '');
    setCompanions((meta.companions || []).filter(Boolean).join('\n'));
    setReason('');
  }, [booking, open]);

  const save = async () => {
    if (!booking) return;
    const nextGroupSize = Math.max(1, Math.min(30, Number(groupSize) || 1));
    if (!reason.trim()) { toast.error('State why this booking was changed.'); return; }
    setSaving(true);
    try {
      const previousMeta = parseMeta(booking.notes);
      const nextCompanions = companions.split('\n').map((name) => name.trim()).filter(Boolean);
      const receipt = {
        changedAt: new Date().toISOString(),
        reason: reason.trim(),
        before: { groupSize: booking.group_size, leadName: previousMeta.fullName || booking.emergency_contact_name || '', companions: previousMeta.companions || [] },
        after: { groupSize: nextGroupSize, leadName: leadName.trim(), companions: nextCompanions },
      };
      const { error } = await supabase.from('bookings').update({
        group_size: nextGroupSize,
        status: 'adjustment_pending',
        notes: encodeMeta({ ...previousMeta, fullName: leadName.trim(), companions: nextCompanions, bookingChange: receipt }),
      } as any).eq('id', booking.id);
      if (error) throw error;
      await supabase.from('booking_messages' as any).insert({
        booking_id: booking.id,
        sender_role: 'system',
        kind: 'system',
        content: `Booking details updated by admin. ${reason.trim()} Lead: ${leadName.trim() || 'unchanged'}; group: ${booking.group_size} to ${nextGroupSize} pax. Please review and confirm.`,
      } as any);
      toast.success('Booking update sent for hiker confirmation.');
      onDone?.();
      onClose();
    } catch (error: any) {
      toast.error(error?.message || 'Could not update the booking.');
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit booking details</DialogTitle>
        <DialogDescription>The hiker will receive this change receipt and must confirm it before the booking continues.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Lead hiker name</Label><Input value={leadName} onChange={(event) => setLeadName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label>Group size</Label><Input type="number" min="1" max="30" value={groupSize} onChange={(event) => setGroupSize(event.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label>Companions, one name per line</Label><Textarea value={companions} onChange={(event) => setCompanions(event.target.value)} rows={4} /></div>
        <div className="space-y-1.5"><Label>Reason for this change</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Explain what changed and why" /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={saving || !reason.trim()}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Send for confirmation</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

import { useEffect, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { canChangeBooking } from '@/lib/bookingReceipt';
import { parseMeta } from '@/lib/bookingMeta';
import { notifyUser } from '@/lib/firestoreNotifications';
import { containsProfanity, PROFANITY_NOTICE } from '@/lib/contentModeration';

type Props = {
  bookingId: string;
  bookingDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterReschedule?: () => void;
};

export default function BookingRescheduleDialog({ bookingId, bookingDate, open, onOpenChange, onAfterReschedule }: Props) {
  const { user, role } = useAuth();
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewDate('');
      setReason('');
    }
  }, [open]);

  const submit = async () => {
    if (!user || sending) return;
    if (!newDate) { toast.error('Pick a new date'); return; }
    if (reason.trim().length < 5) { toast.error('Please explain the reason (at least 5 characters).'); return; }
    if (containsProfanity(reason)) { toast.error(PROFANITY_NOTICE); return; }
    setSending(true);
    try {
      const [{ data: booking, error: bookingError }, { data: sessions, error: sessionError }] = await Promise.all([
        supabase.from('bookings').select('id,status,notes,user_id').eq('id', bookingId).eq('user_id', user.id).single(),
        supabase.from('hiker_sessions').select('status,end_time').eq('booking_id', bookingId),
      ]);
      if (bookingError || sessionError || !booking || !canChangeBooking(booking, sessions ?? [])) {
        throw new Error(bookingError?.message || sessionError?.message || 'This hike has started or ended and cannot be rescheduled.');
      }
      const currentMeta = parseMeta(booking.notes);
      const nextNotes = JSON.stringify({ ...currentMeta, requestedRescheduleReason: reason.trim() });
      const { data: changed, error: updateError } = await supabase.from('bookings').update({
        status: 'adjustment_pending',
        requested_new_date: newDate,
        requested_at: new Date().toISOString(),
        notes: nextNotes,
      } as any).eq('id', bookingId).eq('user_id', user.id).eq('status', booking.status).select('id').maybeSingle();
      if (updateError || !changed) throw new Error(updateError?.message || 'Booking changed. Reload before requesting a new date.');

      const { error: messageError } = await supabase.from('booking_messages' as any).insert({
        booking_id: bookingId,
        sender_id: user.id,
        sender_role: role || 'hiker',
        recipient_role: 'admin',
        kind: 'reschedule_request',
        content: `Hiker requested to reschedule from ${bookingDate} to ${newDate}. Reason: ${reason.trim()}`,
      } as any);
      if (messageError) console.warn('Reschedule chat notice failed:', messageError.message);
      await notifyUser(user.id, { title: 'Reschedule request sent', body: `Your request from ${bookingDate} to ${newDate} is pending local admin approval.`, category: 'booking', link: '/hiker' }).catch(() => null);
      toast.success('Reschedule request sent to admin');
      onOpenChange(false);
      onAfterReschedule?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send reschedule request.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> Reschedule booking</DialogTitle>
          <DialogDescription>Current booking date: <strong>{format(new Date(`${bookingDate}T00:00:00`), 'MMM d, yyyy')}</strong>. The local admin must approve the new date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input aria-label="Requested hike date" type="date" value={newDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setNewDate(event.target.value)} />
            <Button disabled={sending} onClick={() => void submit()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send request'}</Button>
          </div>
          <Textarea aria-label="Reason for reschedule" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="Why do you need to change the date?" />
          <p className="text-xs text-muted-foreground">Your booking will stay pending until the local admin approves the change.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
import { containsProfanity, PROFANITY_NOTICE } from '@/lib/contentModeration';

type Props = {
  bookingId: string;
  bookingDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterReschedule?: () => void;
  weatherCancelled?: boolean;
};

export default function BookingRescheduleDialog({ bookingId, bookingDate, open, onOpenChange, onAfterReschedule, weatherCancelled = false }: Props) {
  const { user } = useAuth();
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
      const bookingMeta = parseMeta(booking?.notes);
      const canUseWeatherPath = weatherCancelled && Boolean((bookingMeta as any).weatherCancellation);
      if (bookingError || sessionError || !booking || (!canUseWeatherPath && !canChangeBooking(booking, sessions ?? []))) {
        throw new Error(bookingError?.message || sessionError?.message || 'This hike has started or ended and cannot be rescheduled.');
      }
      const { error: requestError } = await supabase.rpc((canUseWeatherPath ? 'request_weather_booking_reschedule' : 'request_booking_reschedule') as any, {
        p_booking_id: bookingId,
        p_new_date: newDate,
        p_reason: reason.trim(),
      });
      if (requestError) throw new Error(requestError.message || 'Could not send the reschedule request.');
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
          <DialogDescription>{weatherCancelled ? 'Weather cancellation date' : 'Current booking date'}: <strong>{format(new Date(`${bookingDate}T00:00:00`), 'MMM d, yyyy')}</strong>. The local admin must approve the new date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-[minmax(0,1fr)_auto]">
            <Input aria-label="Requested hike date" type="date" value={newDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setNewDate(event.target.value)} />
            <Button disabled={sending} onClick={() => void submit()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send request'}</Button>
          </div>
          <Textarea aria-label="Reason for reschedule" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="Why do you need to change the date?" />
          <p className="text-xs text-muted-foreground">{weatherCancelled ? 'The weather-cancelled booking will stay pending until the local admin approves the new date.' : 'Your booking will stay pending until the local admin approves the change.'}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

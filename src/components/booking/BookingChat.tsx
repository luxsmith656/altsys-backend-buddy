import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Send, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Msg {
  id: string;
  booking_id: string;
  sender_id: string | null;
  sender_role: string;
  kind: string;
  content: string;
  created_at: string;
}

interface Props {
  bookingId: string;
  bookingDate: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** allow the current user to request a reschedule (hiker only) */
  canRequestReschedule?: boolean;
  /** admin actions (approve/reject reschedule) */
  isAdmin?: boolean;
  onAfterReschedule?: () => void;
}

export default function BookingChat({
  bookingId, bookingDate, open, onOpenChange,
  canRequestReschedule, isAdmin, onAfterReschedule,
}: Props) {
  const { user, role } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newDate, setNewDate] = useState('');
  const scroller = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('booking_messages' as any)
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    setMsgs((data as any) ?? []);
    setLoading(false);
    setTimeout(() => scroller.current?.scrollTo({ top: 99999 }), 50);
  };

  useEffect(() => {
    if (!open) return;
    void load();
    const ch = supabase
      .channel(`bm-${bookingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${bookingId}` },
        (p) => { setMsgs((m) => [...m, p.new as Msg]); setTimeout(() => scroller.current?.scrollTo({ top: 99999 }), 50); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, bookingId]);

  const send = async (kind: string = 'chat', content?: string) => {
    const body = (content ?? text).trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase.from('booking_messages' as any).insert({
      booking_id: bookingId,
      sender_id: user?.id,
      sender_role: role || 'user',
      kind,
      content: body,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    if (!content) setText('');
  };

  const requestReschedule = async () => {
    if (!newDate) { toast.error('Pick a new date'); return; }
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'adjustment_pending', requested_new_date: newDate, requested_at: new Date().toISOString() } as any)
      .eq('id', bookingId);
    if (error) { toast.error(error.message); return; }
    await send('reschedule_request', `Hiker requested to reschedule from ${bookingDate} to ${newDate}.`);
    toast.success('Reschedule request sent to admin');
    setNewDate('');
    onAfterReschedule?.();
  };

  const adminApproveReschedule = async (booking: any) => {
    const target = booking?.requested_new_date;
    if (!target) { toast.error('No requested date on file'); return; }
    const { error } = await supabase
      .from('bookings')
      .update({ booking_date: target, status: 'confirmed', requested_new_date: null } as any)
      .eq('id', bookingId);
    if (error) { toast.error(error.message); return; }
    await send('system', `Reschedule approved — new date: ${target}.`);
    toast.success('Reschedule approved');
    onAfterReschedule?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Booking conversation</DialogTitle>
          <DialogDescription>Messages about your booking on {format(new Date(bookingDate), 'MMM d, yyyy')}.</DialogDescription>
        </DialogHeader>

        <div ref={scroller} className="h-72 overflow-y-auto border rounded-md p-3 space-y-2 bg-muted/30">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : msgs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hi 👋</p>
          ) : (
            msgs.map((m) => {
              const mine = m.sender_id === user?.id;
              const system = m.kind !== 'chat';
              return (
                <div key={m.id} className={`flex ${system ? 'justify-center' : mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    system ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100 italic' :
                    mine ? 'bg-primary text-primary-foreground' : 'bg-card border'
                  }`}>
                    {!system && <div className="text-[10px] opacity-70 mb-0.5 uppercase">{m.sender_role}</div>}
                    {m.content}
                    <div className="text-[10px] opacity-60 mt-1">{format(new Date(m.created_at), 'MMM d, HH:mm')}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} />
          <Button onClick={() => void send()} disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        {canRequestReschedule && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> Request a new date
            </p>
            <div className="flex gap-2">
              <Input type="date" value={newDate} min={new Date().toISOString().slice(0,10)}
                onChange={(e) => setNewDate(e.target.value)} />
              <Button size="sm" variant="outline" onClick={() => void requestReschedule()}>Send request</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Your booking will move to "adjustment pending" until admin approves.</p>
          </div>
        )}

        {isAdmin && (
          <AdminRescheduleControls bookingId={bookingId} onApprove={adminApproveReschedule} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdminRescheduleControls({ bookingId, onApprove }: { bookingId: string; onApprove: (b: any) => void }) {
  const [b, setB] = useState<any>(null);
  useEffect(() => {
    supabase.from('bookings').select('id,booking_date,status,requested_new_date').eq('id', bookingId).maybeSingle()
      .then(({ data }) => setB(data));
  }, [bookingId]);
  if (!b?.requested_new_date) return null;
  return (
    <div className="border-t pt-3 space-y-2 bg-sky-50 dark:bg-sky-950/30 -mx-6 px-6 py-3">
      <p className="text-sm font-medium">Reschedule request pending</p>
      <p className="text-xs text-muted-foreground">From {b.booking_date} → <strong>{b.requested_new_date}</strong></p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onApprove(b)}>Approve new date</Button>
      </div>
    </div>
  );
}

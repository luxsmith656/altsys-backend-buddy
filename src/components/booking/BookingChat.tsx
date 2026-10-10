import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Bell, Loader2, Send, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { canChangeBooking } from '@/lib/bookingReceipt';
import { Textarea } from '@/components/ui/textarea';
import { notifyUser } from '@/lib/firestoreNotifications';
import { containsProfanity, PROFANITY_NOTICE } from '@/lib/contentModeration';

interface Msg {
  id: string;
  booking_id: string;
  sender_id: string | null;
  sender_role: string;
  recipient_role?: string | null;
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
  initialMode?: 'chat' | 'reschedule';
}

function bookingMessageError(message: string) {
  if (message.includes("'recipient_role'") && message.toLowerCase().includes('schema cache')) {
    return 'Booking messages need a database update. Ask the project admin to apply the latest booking-message migration, then try again.';
  }
  return message;
}

export default function BookingChat({
  bookingId, bookingDate, open, onOpenChange,
  canRequestReschedule, isAdmin, onAfterReschedule,
  initialMode = 'chat',
}: Props) {
  const { user, role } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [mode, setMode] = useState<'chat' | 'reschedule'>(initialMode);
  const scroller = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('booking_messages' as any)
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    setMsgs((data as any) ?? []);
    setUnreadCount(0);
    setLoading(false);
    setTimeout(() => scroller.current?.scrollTo({ top: 99999 }), 50);
  };

  useEffect(() => {
    if (!open) return;
    void load();
    const ch = supabase
      .channel(`bm-${bookingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${bookingId}` },
        (p) => {
          const message = p.new as Msg;
          const visibleToRole = role === 'admin' || role === 'super_admin' ||
            (role === 'guide' && (message.sender_id === user?.id || message.recipient_role === 'guide')) ||
            (role === 'hiker' && (message.sender_id === user?.id || message.recipient_role === 'hiker'));
          if (!visibleToRole) return;
          setMsgs((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
          if (message.sender_id !== user?.id && message.sender_role === 'admin') {
            window.dispatchEvent(new CustomEvent('booking-admin-message', { detail: { bookingId } }));
          }
          if (message.sender_id !== user?.id && !open) setUnreadCount((count) => count + 1);
          setTimeout(() => scroller.current?.scrollTo({ top: 99999 }), 50);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, bookingId, role, user?.id]);

  const send = async (kind: string = 'chat', content?: string): Promise<boolean> => {
    const body = (content ?? text).trim();
    if (!body) return false;
    if (containsProfanity(body)) { toast.error(PROFANITY_NOTICE); return false; }
    setSending(true);
    const { data: inserted, error } = await supabase.from('booking_messages' as any).insert({
      booking_id: bookingId,
      sender_id: user?.id,
      sender_role: role || 'user',
      recipient_role: kind === 'reschedule_request' ? 'admin' : role === 'hiker' ? 'guide' : 'hiker',
      kind,
      content: body,
    }).select('*').single();
    setSending(false);
    if (error) { toast.error(bookingMessageError(error.message)); return false; }
    // Do not wait for a websocket round trip to show the sender's message.
    // The realtime event, when enabled, is still de-duplicated by the row id.
    const insertedMessage = inserted as unknown as Msg | null;
    if (insertedMessage?.id) {
      setMsgs((current) => current.some((item) => item.id === insertedMessage.id) ? current : [...current, insertedMessage]);
      setTimeout(() => scroller.current?.scrollTo({ top: 99999 }), 50);
    }
    // Persist a realtime bell notification for the other side of the booking.
    // The chat itself remains the source of truth; this only makes new messages discoverable.
    const { data: booking } = await supabase.from('bookings').select('user_id').eq('id', bookingId).maybeSingle();
    if (role === 'admin' && booking?.user_id) {
      await notifyUser(booking.user_id, { title: 'New booking message', body: 'An administrator sent you a message about your booking.', category: 'booking', link: '/hiker' }).catch(() => null);
    } else if (role === 'hiker') {
      const { data: assignments } = await supabase.from('booking_assignments' as any).select('guide_id, guides(user_id)').eq('booking_id', bookingId).in('status', ['pending', 'accepted']);
      const guideIds = ((assignments as any[]) || []).map((item) => item.guides?.user_id).filter(Boolean);
      await Promise.all(guideIds.map((id) => notifyUser(id, { title: 'New booking message', body: 'A hiker sent a message about an assigned booking.', category: 'booking', link: '/guide' }).catch(() => null)));
    }
    if (!content) setText('');
    return true;
  };

  const requestReschedule = async () => {
    if (!canRequestReschedule || sending) return;
    if (!newDate) { toast.error('Pick a new date'); return; }
    if (rescheduleReason.trim().length < 5) { toast.error('Please explain the reason (at least 5 characters).'); return; }
    setSending(true);
    const { data: current, error: readError } = await supabase.from('bookings').select('id,status,notes').eq('id', bookingId).single();
    const { data: sessions, error: sessionError } = await supabase.from('hiker_sessions').select('status,end_time').eq('booking_id', bookingId);
    if (readError || sessionError || !current || !canChangeBooking(current, sessions ?? [])) {
      setSending(false);
      toast.error(readError?.message || sessionError?.message || 'This hike has started or ended and cannot be rescheduled.');
      return;
    }
    let parsedNotes: Record<string, unknown> = {};
    try {
      parsedNotes = current.notes ? JSON.parse(current.notes) as Record<string, unknown> : {};
    } catch {
      parsedNotes = current.notes ? { legacyNotes: current.notes } : {};
    }
    let update = supabase
      .from('bookings')
      .update({
        status: 'adjustment_pending',
        requested_new_date: newDate,
        requested_at: new Date().toISOString(),
        notes: JSON.stringify({ ...parsedNotes, requestedRescheduleReason: rescheduleReason.trim() }),
      } as any)
      .eq('id', bookingId).eq('status', current.status);
    update = current.notes == null ? update.is('notes', null) : update.eq('notes', current.notes);
    const { data: changed, error } = await update.select('id').maybeSingle();
    if (error || !changed) { setSending(false); toast.error(error?.message || 'Booking changed. Reload before requesting a new date.'); return; }
    const messageSent = await send('reschedule_request', `Hiker requested to reschedule from ${bookingDate} to ${newDate}. Reason: ${rescheduleReason.trim()}`);
    if (!messageSent) {
      toast.error('The reschedule was saved, but its message could not be delivered. Contact the administrator directly.');
      setNewDate('');
      setRescheduleReason('');
      setSending(false);
      onAfterReschedule?.();
      return;
    }
    toast.success('Reschedule request sent to admin');
    setNewDate('');
    setRescheduleReason('');
    onAfterReschedule?.();
  };

  const adminDecideReschedule = async (booking: any, approved: boolean) => {
    const target = booking?.requested_new_date;
    if (!target && approved) { toast.error('No requested date on file'); return; }
    if (!approved && decisionReason.trim().length < 5) { toast.error('Add a reason for declining the request.'); return; }
    const { data, error } = await supabase.rpc('admin_approve_booking_reschedule' as any, {
      p_booking_id: bookingId,
      p_approved: approved,
      p_reason: decisionReason.trim() || null,
    });
    if (error) { toast.error(error.code === 'PGRST202' ? 'Apply the latest reschedule migration first.' : error.message); return; }
    const result = data as { hikerUserId?: string; guideUserIds?: string[] } | null;
    const message = approved ? `Reschedule approved — new date: ${target}.` : `Reschedule declined. Reason: ${decisionReason.trim()}`;
    if (result?.hikerUserId) await notifyUser(result.hikerUserId, { title: approved ? 'Reschedule approved' : 'Reschedule declined', body: message, category: 'booking' }).catch(() => null);
    await Promise.all((result?.guideUserIds || []).map((id) => notifyUser(id, { title: 'Booking date updated', body: message, category: 'booking' }).catch(() => null)));
    toast.success(approved ? 'Reschedule approved' : 'Reschedule declined');
    setDecisionReason('');
    onAfterReschedule?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" /> Booking conversation
            {unreadCount > 0 && <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">{unreadCount}</span>}
          </DialogTitle>
        <DialogDescription>{mode === 'chat' ? `Messages about your booking on ${format(new Date(bookingDate), 'MMM d, yyyy')}.` : 'Request a date change for this booking. The local admin must approve it.'}</DialogDescription>
        </DialogHeader>

        {mode === 'chat' && <div ref={scroller} className="h-72 overflow-y-auto border rounded-md p-3 space-y-2 bg-muted/30">
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
        </div>}

        {mode === 'chat' && <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} />
          <Button onClick={() => void send()} disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>}

        {canRequestReschedule && mode === 'reschedule' && (
          <div className="space-y-2">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> Request a new date
            </p>
            <div className="flex gap-2">
              <Input aria-label="Requested hike date" type="date" value={newDate} min={new Date().toISOString().slice(0,10)}
                onChange={(e) => setNewDate(e.target.value)} />
              <Button size="sm" variant="outline" disabled={sending} onClick={() => void requestReschedule()}>Send request</Button>
            </div>
            <Textarea aria-label="Reason for reschedule" value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} maxLength={500} rows={2} placeholder="Why do you need to change the date?" />
            <p className="text-[11px] text-muted-foreground">Your booking will move to “adjustment pending” until admin approves.</p>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        )}

        {isAdmin && (
          <AdminRescheduleControls bookingId={bookingId} decisionReason={decisionReason} onReasonChange={setDecisionReason} onDecide={adminDecideReschedule} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdminRescheduleControls({ bookingId, decisionReason, onReasonChange, onDecide }: { bookingId: string; decisionReason: string; onReasonChange: (value: string) => void; onDecide: (booking: any, approved: boolean) => void }) {
  const [b, setB] = useState<any>(null);
  const [hikerReason, setHikerReason] = useState('');
  useEffect(() => {
    supabase.from('bookings').select('id,booking_date,status,requested_new_date,notes').eq('id', bookingId).maybeSingle()
      .then(({ data }) => {
        setB(data);
        try { setHikerReason(data?.notes ? JSON.parse(data.notes).requestedRescheduleReason || '' : ''); } catch { setHikerReason(''); }
      });
  }, [bookingId]);
  if (!b?.requested_new_date || b.status !== 'adjustment_pending') return null;
  return (
    <div className="border-t pt-3 space-y-2 bg-sky-50 dark:bg-sky-950/30 -mx-6 px-6 py-3">
      <p className="text-sm font-medium">Reschedule request pending</p>
      <p className="text-xs text-muted-foreground">From {b.booking_date} → <strong>{b.requested_new_date}</strong></p>
      {hikerReason && <p className="rounded-md bg-background/70 p-2 text-sm"><strong>Hiker's reason:</strong> {hikerReason}</p>}
      <Textarea aria-label="Admin reschedule decision reason" value={decisionReason} onChange={(event) => onReasonChange(event.target.value)} rows={2} placeholder="Reason if declining or note for the hiker" />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onDecide(b, true)}>Approve new date</Button>
        <Button size="sm" variant="destructive" onClick={() => onDecide(b, false)}>Decline</Button>
      </div>
    </div>
  );
}

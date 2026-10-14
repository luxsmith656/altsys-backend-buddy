import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Send, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
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
  recipientRole?: 'hiker' | 'guide' | 'admin' | 'ranger';
}

function bookingMessageError(message: string) {
  if (message.includes("'recipient_role'") && message.toLowerCase().includes('schema cache')) {
    return 'Booking messages need a database update. Ask the project admin to apply the latest booking-message migration, then try again.';
  }
  return message;
}

export default function BookingChat({
  bookingId, bookingDate, open, onOpenChange,
  recipientRole,
}: Props) {
  const { user, role } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  // Mobile browsers resize the visual viewport when the keyboard opens, but
  // do not always resize the layout viewport used by 100dvh. Track the visual
  // viewport so the composer stays above the keyboard on iOS and Android.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const visualViewport = window.visualViewport;
    const updateViewport = () => setViewportHeight(Math.round(visualViewport?.height ?? window.innerHeight));
    updateViewport();
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [open]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('booking_messages' as any)
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    if (error) {
      setMsgs([]);
      toast.error(bookingMessageError(error.message));
    } else {
      setMsgs((data as any) ?? []);
    }
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
          const visibleToRole = role === 'admin' || role === 'super_admin' || role === 'ranger' ||
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
      recipient_role: kind === 'reschedule_request' ? 'admin' : recipientRole || (role === 'hiker' ? 'guide' : 'hiker'),
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
      // Keep action buttons/bells current immediately, even when the realtime
      // socket is delayed or disabled in the current browser session.
      window.dispatchEvent(new CustomEvent('booking-message-alert', {
        detail: { bookingId, messageId: insertedMessage.id },
      }));
      setTimeout(() => scroller.current?.scrollTo({ top: 99999 }), 50);
    }
    // A database trigger creates the durable bell notification for the
    // message recipient. Keeping delivery beside the insert avoids a client
    // refresh or RLS difference silently losing a booking-chat alert.
    if (!content) setText('');
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ '--booking-chat-vh': viewportHeight ? `${viewportHeight}px` : '100dvh' } as React.CSSProperties}
        className="flex h-[var(--booking-chat-vh)] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 md:bottom-4 md:left-auto md:right-4 md:top-auto md:h-[min(720px,calc(100dvh-2rem))] md:max-h-[calc(100dvh-2rem)] md:w-[min(420px,calc(100vw-2rem))] md:max-w-[420px] md:translate-x-0 md:translate-y-0 md:rounded-2xl md:border"
      >
        <DialogHeader className="border-b bg-background px-4 py-3 pr-12 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate">Booking conversation</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{format(new Date(`${bookingDate}T00:00:00`), 'MMM d, yyyy')}</span>
            </span>
            {unreadCount > 0 && <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">{unreadCount}</span>}
          </DialogTitle>
          <DialogDescription className="sr-only">Messages about your booking.</DialogDescription>
        </DialogHeader>

        <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 px-3 py-4 sm:px-[max(1.25rem,calc((100vw-42rem)/2))]">
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
                  <div className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-sm shadow-sm sm:max-w-[78%] ${
                    system ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100 italic' :
                    mine ? 'bg-primary text-primary-foreground' : 'bg-card border'
                  }`}>
                    {!system && <div className="mb-0.5 text-[10px] font-medium uppercase opacity-70">{m.sender_role}</div>}
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <div className="mt-1 text-right text-[10px] opacity-60">{format(new Date(m.created_at), 'MMM d, HH:mm')}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex min-w-0 shrink-0 gap-2 border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-4">
          <Input ref={inputRef} className="rounded-full bg-muted/30 px-4" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
            onFocus={() => window.setTimeout(() => inputRef.current?.scrollIntoView({ block: 'nearest' }), 50)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} />
          <Button className="shrink-0 rounded-full" size="icon" aria-label="Send message" onClick={() => void send()} disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}

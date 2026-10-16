import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Loader2, MessageCircle, Send, Users, X } from 'lucide-react';
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
          if (!visibleToRole || message.kind !== 'chat') return;
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

  const send = async (content?: string): Promise<boolean> => {
    const body = (content ?? text).trim();
    if (!body) return false;
    if (containsProfanity(body)) { toast.error(PROFANITY_NOTICE); return false; }
    setSending(true);
    const { data: inserted, error } = await supabase.from('booking_messages' as any).insert({
      booking_id: bookingId,
      sender_id: user?.id,
      sender_role: role || 'user',
      recipient_role: recipientRole || (role === 'hiker' ? 'guide' : 'hiker'),
      kind: 'chat',
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
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-label="Booking conversation panel"
          tabIndex={-1}
          initial={{ opacity: 0, x: -360 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -360 }}
          transition={{ type: 'spring', damping: 28, stiffness: 220 }}
          style={{ '--booking-chat-vh': viewportHeight ? `${viewportHeight}px` : '100dvh' } as React.CSSProperties}
          className="fixed inset-0 z-[2100] flex h-[var(--booking-chat-vh)] w-screen flex-col overflow-hidden bg-card shadow-2xl sm:bottom-0 sm:left-0 sm:right-auto sm:top-16 sm:h-auto sm:w-[min(100vw,25rem)] sm:rounded-r-2xl sm:border-r sm:border-border/50 md:w-[min(40vw,28rem)] lg:w-[min(34vw,30rem)] xl:w-[min(30vw,32rem)]"
          onKeyDown={(event) => { if (event.key === 'Escape') onOpenChange(false); }}
        >
          <header className="flex items-center gap-3 border-b border-border/30 bg-primary/5 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Booking conversation</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {recipientRole === 'guide' ? 'Talking to your guide' : recipientRole === 'admin' ? 'Talking to admin' : 'Booking support'}
              </p>
            </div>
            {unreadCount > 0 && <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">{unreadCount}</span>}
            <Button type="button" size="icon" variant="secondary" className="h-8 w-8 shrink-0 border border-border/40" onClick={() => onOpenChange(false)} aria-label="Close booking chat">
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="flex flex-wrap gap-1.5 border-b border-border/20 bg-background/30 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {format(new Date(`${bookingDate}T00:00:00`), 'MMM d, yyyy')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" /> Booking support
            </span>
          </div>

          <div ref={scroller} className="min-h-0 flex-1 space-y-3 overscroll-contain overflow-y-auto px-3 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : msgs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hi 👋</p>
          ) : (
            msgs.filter((m) => m.kind === 'chat').map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {!mine && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><MessageCircle className="h-3.5 w-3.5" /></span>}
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed shadow-sm ${mine ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-secondary/60 text-foreground'}`}>
                    <div className="mb-0.5 text-[10px] font-medium uppercase opacity-70">{mine ? 'You' : m.sender_role}</div>
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <div className="mt-1 text-right text-[10px] opacity-60">{format(new Date(m.created_at), 'MMM d, HH:mm')}</div>
                  </div>
                </div>
              );
            })
          )}
          </div>

          <form className="flex min-w-0 shrink-0 gap-2 border-t border-border/30 bg-background/60 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <Input ref={inputRef} className="flex-1 rounded-xl border-border/30 bg-secondary/40 px-3 text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
              onFocus={() => window.setTimeout(() => inputRef.current?.scrollIntoView({ block: 'nearest' }), 50)} />
            <Button type="submit" className="h-9 w-9 shrink-0 rounded-xl" size="icon" aria-label="Send message" disabled={sending || !text.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>

        </motion.aside>
      )}
    </AnimatePresence>
  );
}

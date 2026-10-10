import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type BookingMessagePayload = {
  id?: string;
  booking_id?: string;
  sender_id?: string | null;
  recipient_role?: string | null;
};

/**
 * Keeps booking action buttons visibly current while a conversation is closed.
 * The database publication is the source of realtime events; the active chat
 * still loads the complete thread and de-duplicates any event it receives.
 */
export function useBookingMessageAlerts(bookingIds: string[], activeBookingId?: string | null) {
  const { user, role } = useAuth();
  const [unreadByBooking, setUnreadByBooking] = useState<Record<string, number>>({});
  const bookingKey = useMemo(() => [...new Set(bookingIds)].sort().join(','), [bookingIds]);
  const recipientRole = role === 'admin' || role === 'super_admin' ? 'admin' : role;

  useEffect(() => {
    if (!user || !recipientRole || !bookingKey || typeof (supabase as any).channel !== 'function') return;
    const ids = new Set(bookingKey.split(',').filter(Boolean));
    const channel = supabase
      .channel(`booking-message-alerts-${user.id}-${recipientRole}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages' }, (payload) => {
        const message = payload.new as BookingMessagePayload;
        if (!message.id || !message.booking_id || !ids.has(message.booking_id)) return;
        if (message.sender_id === user.id || message.recipient_role !== recipientRole) return;
        if (message.booking_id === activeBookingId) return;
        setUnreadByBooking((current) => ({
          ...current,
          [message.booking_id as string]: (current[message.booking_id as string] || 0) + 1,
        }));
        window.dispatchEvent(new CustomEvent('booking-message-alert', {
          detail: { bookingId: message.booking_id, messageId: message.id },
        }));
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [activeBookingId, bookingKey, recipientRole, user]);

  useEffect(() => {
    if (!activeBookingId) return;
    setUnreadByBooking((current) => {
      if (!current[activeBookingId]) return current;
      const next = { ...current };
      delete next[activeBookingId];
      return next;
    });
  }, [activeBookingId]);

  const clearBookingUnread = (bookingId: string) => {
    setUnreadByBooking((current) => {
      if (!current[bookingId]) return current;
      const next = { ...current };
      delete next[bookingId];
      return next;
    });
  };

  return {
    unreadByBooking,
    hasUnread: (bookingId: string) => Boolean(unreadByBooking[bookingId]),
    unreadCount: (bookingId: string) => unreadByBooking[bookingId] || 0,
    clearBookingUnread,
  };
}

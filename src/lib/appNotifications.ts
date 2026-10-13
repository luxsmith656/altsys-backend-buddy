import { supabase } from '@/integrations/supabase/client';

export type AppNotificationCategory = 'announcement' | 'booking' | 'system' | 'alert';

export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: AppNotificationCategory;
  link?: string | null;
  read: boolean;
  createdAt: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: AppNotificationCategory;
  link: string | null;
  read: boolean;
  created_at: string;
};

const toNotification = (row: NotificationRow): AppNotification => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  body: row.body,
  category: row.category || 'system',
  link: row.link,
  read: Boolean(row.read),
  createdAt: row.created_at,
});

const sortNewest = (items: AppNotification[]) => items
  .slice()
  .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

/**
 * Durable, authenticated notification write. The database RPC validates that
 * the caller is allowed to notify the booking participant before inserting.
 */
export async function createAppNotification(
  userId: string,
  payload: {
    title: string;
    body: string;
    category?: AppNotificationCategory;
    link?: string | null;
    bookingId?: string | null;
  },
): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc('create_app_notification', {
    p_user_id: userId,
    p_title: payload.title,
    p_body: payload.body,
    p_category: payload.category ?? 'system',
    p_link: payload.link ?? null,
    p_booking_id: payload.bookingId ?? null,
  });
  if (error) {
    console.warn('[Supabase notifications] Delivery failed:', error.message);
    return null;
  }
  return typeof data === 'string' ? data : data?.id ?? null;
}

/** Subscribe to the signed-in user's durable notifications and hydrate first. */
export function subscribeAppNotifications(
  userId: string,
  onUpdate: (items: AppNotification[]) => void,
  onError?: (error: Error) => void,
): () => void {
  let active = true;
  let items: AppNotification[] = [];

  const emit = () => {
    if (active) onUpdate(sortNewest(items));
  };

  void (async () => {
    const { data, error } = await (supabase as any)
      .from('app_notifications')
      .select('id,user_id,title,body,category,link,read,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!active) return;
    if (error) {
      onError?.(new Error(error.message));
      return;
    }
    items = ((data || []) as NotificationRow[]).map(toNotification);
    emit();
  })();

  const channel = (supabase as any)
    .channel(`app-notifications-${userId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'app_notifications',
      filter: `user_id=eq.${userId}`,
    }, (payload: { eventType?: string; new?: NotificationRow; old?: NotificationRow }) => {
      if (!active) return;
      if (payload.eventType === 'DELETE' && payload.old?.id) {
        items = items.filter((item) => item.id !== payload.old?.id);
      } else if (payload.new?.id) {
        const next = toNotification(payload.new);
        items = [next, ...items.filter((item) => item.id !== next.id)];
      }
      emit();
    })
    .subscribe((status: string, error?: Error) => {
      if (status === 'CHANNEL_ERROR') onError?.(error || new Error('Notification realtime channel failed'));
    });

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

export async function markAppNotificationRead(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('app_notifications')
    .update({ read: true })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAppNotification(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('app_notifications')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

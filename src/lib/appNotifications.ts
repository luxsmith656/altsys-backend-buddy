import { supabase } from '@/integrations/supabase/client';

export type AppNotificationCategory = 'announcement' | 'booking' | 'system' | 'alert';

export type AppNotification = {
  id: string;
  userId: string;
  senderId?: string | null;
  type?: string | null;
  referenceId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
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
  sender_id?: string | null;
  type?: string | null;
  reference_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  route?: string | null;
  title: string;
  body: string;
  category: AppNotificationCategory;
  link: string | null;
  read: boolean;
  is_read?: boolean | null;
  created_at: string;
};

const toNotification = (row: NotificationRow): AppNotification => ({
  id: row.id,
  userId: row.user_id,
  senderId: row.sender_id,
  type: row.type,
  referenceId: row.reference_id,
  targetType: row.target_type || row.type,
  targetId: row.target_id || row.reference_id,
  title: row.title,
  body: row.body,
  category: row.category || 'system',
  link: row.link || row.route,
  read: Boolean(row.read ?? row.is_read),
  createdAt: row.created_at,
});

const sortNewest = (items: AppNotification[]) => items.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

type NotificationStore = {
  items: AppNotification[];
  listeners: Set<(items: AppNotification[]) => void>;
  errorListeners: Set<(error: Error) => void>;
  channel: any;
};

// One cache and one realtime channel per user keeps the navbar and notification
// page on the same source of truth, even when both are mounted together.
const stores = new Map<string, NotificationStore>();

function emitStore(store: NotificationStore) {
  const next = sortNewest(store.items);
  store.listeners.forEach((listener) => listener(next));
}

function getStore(userId: string) {
  const existing = stores.get(userId);
  if (existing) return existing;
  const store: NotificationStore = { items: [], listeners: new Set(), errorListeners: new Set(), channel: null };
  stores.set(userId, store);
  const channel = (supabase as any).channel(`app-notifications-${encodeURIComponent(userId)}`);
  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` },
      (payload: { eventType?: string; new?: NotificationRow; old?: NotificationRow }) => {
        if (payload.eventType === 'DELETE' && payload.old?.id) {
          store.items = store.items.filter((item) => item.id !== payload.old?.id);
        } else if (payload.new?.id) {
          const next = toNotification(payload.new);
          store.items = [next, ...store.items.filter((item) => item.id !== next.id)];
        }
        emitStore(store);
      })
    .subscribe((status: string, error?: Error) => {
      if (status === 'CHANNEL_ERROR') store.errorListeners.forEach((listener) => listener(error || new Error('Notification realtime channel failed')));
    });
  store.channel = channel;
  void (async () => {
    const { data, error } = await (supabase as any)
      .from('app_notifications')
      .select('id,user_id,sender_id,type,reference_id,target_type,target_id,title,body,category,link,route,read,is_read,created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    if (error) {
      const cause = new Error(error.message);
      console.warn('[Supabase notifications] Feed hydration failed:', cause.message);
      store.errorListeners.forEach((listener) => listener(cause));
      return;
    }
    const merged = [...store.items, ...((data || []) as NotificationRow[]).map(toNotification)].reduce<AppNotification[]>((all, item) => {
      const index = all.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) all[index] = item; else all.push(item);
      return all;
    }, []);
    const changed = merged.length !== store.items.length || merged.some((item, index) => {
      const previous = store.items[index];
      return !previous || previous.id !== item.id || previous.read !== item.read || previous.body !== item.body;
    });
    store.items = merged;
    if (changed) emitStore(store);
  })();
  return store;
}

/** Durable, authenticated notification write. */
export async function createAppNotification(userId: string, payload: {
  title: string;
  body: string;
  category?: AppNotificationCategory;
  link?: string | null;
  bookingId?: string | null;
}): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc('create_app_notification', {
    p_user_id: userId, p_title: payload.title, p_body: payload.body,
    p_category: payload.category ?? 'system', p_link: payload.link ?? null,
    p_booking_id: payload.bookingId ?? null,
  });
  if (error) { console.warn('[Supabase notifications] Delivery failed:', error.message); return null; }
  return typeof data === 'string' ? data : data?.id ?? null;
}

/** Subscribe to the single signed-in user's durable notification feed. */
export function subscribeAppNotifications(userId: string, onUpdate: (items: AppNotification[]) => void, onError?: (error: Error) => void): () => void {
  const store = getStore(userId);
  store.listeners.add(onUpdate);
  if (onError) store.errorListeners.add(onError);
  onUpdate(sortNewest(store.items));
  return () => {
    store.listeners.delete(onUpdate);
    if (onError) store.errorListeners.delete(onError);
    if (store.listeners.size === 0) {
      if (store.channel) void supabase.removeChannel(store.channel);
      stores.delete(userId);
    }
  };
}

export async function markAppNotificationRead(id: string): Promise<void> {
  const previous: Array<{ store: NotificationStore; item: AppNotification }> = [];
  stores.forEach((store) => {
    const item = store.items.find((candidate) => candidate.id === id);
    if (!item) return;
    previous.push({ store, item });
    store.items = store.items.map((candidate) => candidate.id === id ? { ...candidate, read: true } : candidate);
    emitStore(store);
  });
  const { error } = await (supabase as any).from('app_notifications').update({ read: true, is_read: true }).eq('id', id);
  if (error) {
    previous.forEach(({ store, item }) => { store.items = store.items.map((candidate) => candidate.id === id ? item : candidate); emitStore(store); });
    throw new Error(error.message);
  }
}

export async function deleteAppNotification(id: string): Promise<void> {
  const previous = new Map<NotificationStore, AppNotification[]>();
  stores.forEach((store) => {
    if (!store.items.some((item) => item.id === id)) return;
    previous.set(store, store.items);
    store.items = store.items.filter((item) => item.id !== id);
    emitStore(store);
  });
  const { error } = await (supabase as any).from('app_notifications').delete().eq('id', id);
  if (error) {
    previous.forEach((items, store) => { store.items = items; emitStore(store); });
    throw new Error(error.message);
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeUserNotifications, markFsNotificationRead, deleteFsNotification, type FsNotification } from '@/lib/firestoreNotifications';
import { loadRemovedNotificationIds, loadSeenNotificationIds } from '@/lib/notifications';

export type UnifiedNotification = FsNotification;

/** Single durable feed shared by the navbar and notification center. */
export function useAppNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<UnifiedNotification[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setError(null);
      return;
    }
    const legacySeen = new Set(loadSeenNotificationIds(userId));
    const legacyRemoved = new Set(loadRemovedNotificationIds(userId));
    const stop = subscribeUserNotifications(userId, (next) => {
      setItems(next.filter((item) => !legacyRemoved.has(item.id)).map((item) => legacySeen.has(item.id) ? { ...item, read: true } : item));
    }, setError);
    return stop;
  }, [userId]);

  const markRead = useCallback(async (id: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
    try {
      await markFsNotificationRead(id);
    } catch (cause) {
      setItems((current) => current.map((item) => item.id === id ? { ...item, read: false } : item));
      throw cause;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const unread = items.filter((item) => !item.read);
    if (!unread.length) return;
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    const results = await Promise.allSettled(unread.map((item) => markFsNotificationRead(item.id)));
    if (results.some((result) => result.status === 'rejected')) throw new Error('Some notifications could not be marked as read.');
  }, [items]);

  const remove = useCallback(async (id: string) => {
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== id));
    try { await deleteFsNotification(id); }
    catch (cause) { setItems(previous); throw cause; }
  }, [items]);

  const unreadCount = useMemo(() => items.reduce((count, item) => count + (item.read ? 0 : 1), 0), [items]);
  return { items, unreadCount, markRead, markAllRead, remove, error };
}

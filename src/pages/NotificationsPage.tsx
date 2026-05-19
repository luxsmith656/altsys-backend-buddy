import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, Megaphone, CalendarCheck, AlertTriangle, CheckCheck, Trash2 } from 'lucide-react';
import { loadAnnouncements } from '@/lib/announcements';
import { loadRemovedNotificationIds, loadSeenNotificationIds, markNotificationRemoved, saveSeenNotificationIds } from '@/lib/notifications';
import {
  deleteFsNotification,
  markFsNotificationRead,
  subscribeUserNotifications,
  type FsNotification,
} from '@/lib/firestoreNotifications';

type AppNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  category: 'announcement' | 'booking' | 'system' | 'alert';
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);

  const [fsNotifs, setFsNotifs] = useState<FsNotification[]>([]);

  // Realtime Firestore subscription
  useEffect(() => {
    if (!user) {
      setFsNotifs([]);
      return;
    }
    const unsub = subscribeUserNotifications(user.id, setFsNotifs);
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setSeen(loadSeenNotificationIds(user.id));
    setRemoved(loadRemovedNotificationIds(user.id));

    const loadAll = async () => {
      const removedIds = new Set(loadRemovedNotificationIds(user.id));
      const anns = loadAnnouncements().map((a) => ({
        id: `ann:${a.id}`,
        title: a.title,
        body: a.body,
        createdAt: a.created_at,
        category: 'announcement' as const,
      }));

      const { data } = await supabase
        .from('bookings')
        .select('id,status,booking_date,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      const bookingNotifs = (data || []).map((b) => ({
        id: `booking:${b.id}:${b.status}`,
        title: `Booking ${b.status}`,
        body: `Your hike booking for ${b.booking_date} is now marked as ${b.status}.`,
        createdAt: b.created_at,
        category: 'booking' as const,
      }));

      const fsItems: AppNotification[] = fsNotifs.map((n) => ({
        id: `fs:${n.id}`,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        category: n.category,
      }));

      setItems(
        [...anns, ...bookingNotifs, ...fsItems]
          .filter((item) => !removedIds.has(item.id))
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
      );
    };

    void loadAll();
  }, [user, fsNotifs]);

  const unread = useMemo(
    () => items.filter((i) => !seen.includes(i.id) && !removed.includes(i.id)).length,
    [items, seen, removed],
  );

  const markAllSeen = () => {
    if (!user) return;
    const ids = items.map((i) => i.id);
    setSeen(ids);
    saveSeenNotificationIds(user.id, ids);
  };

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="container max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">All Notifications</h1>
            <p className="text-muted-foreground text-sm mt-1">Announcements, booking updates, and important alerts.</p>
          </div>
          <Button variant="outline" onClick={markAllSeen} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            Mark all as seen
          </Button>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Notifications ({unread} unread)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">No notifications yet.</p>
            ) : (
              <div className="space-y-3">
                {items.map((n) => {
                  const isUnread = !seen.includes(n.id);
                  return (
                    <div
                      key={n.id}
                      className={`rounded-xl border p-4 ${isUnread ? 'border-primary/40 bg-primary/5' : 'border-border/20 bg-secondary/20'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {n.category === 'announcement' ? (
                          <Megaphone className="h-4 w-4 text-primary" />
                        ) : (
                          <CalendarCheck className="h-4 w-4 text-sky-500" />
                        )}
                        <p className="font-semibold text-sm">{n.title}</p>
                        {isUnread && (
                          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{n.body}</p>
                      <p className="text-xs text-muted-foreground/80 mt-2">{new Date(n.createdAt).toLocaleString()}</p>
                      <div className="mt-2 flex items-center gap-2">
                        {isUnread && user && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              const next = [...seen, n.id];
                              setSeen(next);
                              saveSeenNotificationIds(user.id, next);
                            }}
                          >
                            Mark as seen
                          </Button>
                        )}
                        {user && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              setItems((prev) => prev.filter((x) => x.id !== n.id));
                              setRemoved((prev) => (prev.includes(n.id) ? prev : [...prev, n.id]));
                              markNotificationRemoved(user.id, n.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          Important weather or closure announcements are highlighted and also surfaced on dashboards.
        </div>
      </div>
    </div>
  );
}

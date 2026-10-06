import { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fetchAnnouncementsFromDb, visibleAnnouncements, type AdminAnnouncement } from '@/lib/announcements';
import { loadRemovedNotificationIds, markNotificationRemoved } from '@/lib/notifications';

export default function ImportantAnnouncements() {
  const { user, role } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const refresh = useCallback(async () => {
    const stored = await fetchAnnouncementsFromDb();
    const removed = new Set(userId ? loadRemovedNotificationIds(userId) : []);
    setItems(visibleAnnouncements(stored, role).filter((item) =>
      item.isImportant && !removed.has(`ann:${item.id}`),
    ));
  }, [role, userId]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel(`important-announcements-${userId ?? 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, userId]);

  if (!items.length) return null;

  return (
    <Card className="glass-card mb-6 border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5 text-destructive" /> Important Announcements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm">{item.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>
                {item.source && <p className="mt-2 text-xs font-medium text-primary">Source: {item.source}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(new Date(item.created_at), 'MMM d, yyyy · h:mm a')}
                </p>
              </div>
              {userId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label={`Dismiss announcement: ${item.title}`}
                  title="Dismiss for this account"
                  onClick={() => {
                    markNotificationRemoved(userId, `ann:${item.id}`);
                    setItems((current) => current.filter((entry) => entry.id !== item.id));
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

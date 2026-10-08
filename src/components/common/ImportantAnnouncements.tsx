import { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fetchAnnouncementsFromDb, scopeAnnouncementsByBookingLocations, visibleAnnouncements, type AdminAnnouncement } from '@/lib/announcements';
import { loadRemovedNotificationIds, markNotificationRemoved } from '@/lib/notifications';

export default function ImportantAnnouncements() {
  const { user, role } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const refresh = useCallback(async () => {
    const stored = await fetchAnnouncementsFromDb();
    const removed = new Set(userId ? loadRemovedNotificationIds(userId) : []);
    let visible = visibleAnnouncements(stored, role);
    if (role === 'hiker' && userId) {
      const { data: bookings, error: bookingError } = await supabase
        .from('bookings')
        .select('location_id,status')
        .eq('user_id', userId)
        .not('status', 'in', '(cancelled,completed,ended,rejected,declined)');
      if (bookingError) {
        // Fail closed for local notices when booking scope cannot be verified.
        visible = visible.filter((item) => !item.location_id);
      } else {
        const activeLocations = (bookings ?? [])
          .map((booking) => booking.location_id)
          .filter((locationId): locationId is string => Boolean(locationId));
        visible = scopeAnnouncementsByBookingLocations(visible, activeLocations);
      }
    }
    setItems(visible.filter((item) => item.isImportant && !removed.has(`ann:${item.id}`)));
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
    <Card className="glass-card mb-4 border-destructive/30">
      <CardHeader className="px-4 pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-destructive" /> Important Announcements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-3">
        {items.slice(0, 2).map((item) => (
          <article key={item.id} className="rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm leading-5">{item.title}</h3>
                <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{item.body}</p>
                {item.source && <p className="mt-1 text-[11px] font-medium text-primary">Source: {item.source}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {format(new Date(item.created_at), 'MMM d, yyyy · h:mm a')}
                </p>
              </div>
              {userId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
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

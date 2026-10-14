import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAppNotifications } from '@/hooks/useAppNotifications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, CalendarCheck, CheckCheck, X } from 'lucide-react';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, unreadCount, markRead, markAllRead, remove } = useAppNotifications();

  const openNotification = async (id: string, link?: string | null) => {
    try { await markRead(id); } catch { /* keep the item visible when the server is unavailable */ }
    if (link) navigate(link);
  };

  return (
    <div className="min-h-screen px-4 pb-12 pt-20">
      <div className="container mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><h1 className="text-2xl font-bold sm:text-3xl">All Notifications</h1><p className="mt-1 text-sm text-muted-foreground">Messages, booking updates, and important alerts.</p></div>
          <Button variant="outline" onClick={() => void markAllRead().catch(() => null)} disabled={!unreadCount} className="w-full gap-2 sm:w-auto"><CheckCheck className="h-4 w-4" /> Mark all as read</Button>
        </div>
        <Card className="glass-card">
          <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Notifications ({unreadCount} unread)</CardTitle></CardHeader>
          <CardContent>
            {!items.length ? <p className="py-10 text-center text-sm text-muted-foreground">No notifications yet.</p> : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className={`rounded-xl border p-4 transition-colors ${item.read ? 'border-border/20 bg-secondary/20' : 'border-primary/40 bg-primary/10'} ${item.link ? 'cursor-pointer hover:border-primary/60' : ''}`} onClick={() => void openNotification(item.id, item.link)}>
                    <div className="flex items-start gap-2">
                      <CalendarCheck className={`mt-0.5 h-4 w-4 shrink-0 ${item.read ? 'text-sky-500' : 'text-primary'}`} />
                      <div className="min-w-0 flex-1"><p className={`break-words text-sm ${item.read ? 'font-medium' : 'font-bold'}`}>{item.title}</p><p className="mt-1 break-words text-sm text-muted-foreground">{item.body}</p><p className="mt-2 text-xs text-muted-foreground/80">{new Date(item.createdAt).toLocaleString()}</p>{!item.read && <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); void markRead(item.id).catch(() => null); }}>Mark as seen</Button>}</div>
                      {!item.read && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-destructive" aria-label="Unread" />}
                      {user && <Button aria-label="Delete notification" title="Delete notification" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={(event) => { event.stopPropagation(); void remove(item.id).catch(() => null); }}><X className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

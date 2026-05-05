/**
 * SOSAlertsPanel — listens for active SOS alerts on the admin / LGU dashboard.
 * - Shows alerts in real time via Supabase Realtime.
 * - Plays a toast/sonner ping when a new alert arrives.
 * - Highlights escalated alerts (>=1h unresolved).
 * - Lets admins acknowledge or resolve.
 *
 * `locationId` filters to a specific trailhead. Pass `null` for "all".
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, MapPin, Check, ExternalLink, Loader2, Siren } from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

interface SOSAlert {
  id: string;
  user_id: string;
  location_id: string | null;
  latitude: number | null;
  longitude: number | null;
  message: string;
  status: 'active' | 'acknowledged' | 'resolved' | 'escalated';
  created_at: string;
  escalated_at: string | null;
}

export default function SOSAlertsPanel({ locationId = null }: { locationId?: string | null }) {
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('sos_alerts' as any)
      .select('*')
      .in('status', ['active', 'acknowledged', 'escalated'])
      .order('created_at', { ascending: false })
      .limit(30);
    if (locationId) q = q.eq('location_id', locationId);
    const { data } = await q;
    setAlerts((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`sos-${locationId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, (payload) => {
        const row = payload.new as SOSAlert | undefined;
        if (payload.eventType === 'INSERT' && row) {
          if (!locationId || row.location_id === locationId) {
            toast.error(`🆘 New SOS alert at ${row.latitude?.toFixed(4)}, ${row.longitude?.toFixed(4)}`, { duration: 12000 });
          }
        }
        if (payload.eventType === 'UPDATE' && row?.status === 'escalated') {
          if (!locationId || row.location_id === locationId) {
            toast.warning(`⚠ SOS escalated — unresolved >1h`, { duration: 12000 });
          }
        }
        void load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const updateStatus = async (id: string, status: 'acknowledged' | 'resolved') => {
    const patch: any = { status };
    if (status === 'acknowledged') patch.acknowledged_at = new Date().toISOString();
    if (status === 'resolved') patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from('sos_alerts' as any).update(patch).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success(`Marked ${status}`); void load(); }
  };

  return (
    <Card className="glass-card border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Siren className="h-5 w-5 text-destructive" />
          SOS Alerts
          {alerts.length > 0 && <Badge variant="destructive">{alerts.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin mx-auto" />}
        {!loading && alerts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No active SOS alerts.</p>
        )}
        {alerts.map((a) => {
          const isEscalated = a.status === 'escalated';
          return (
            <div
              key={a.id}
              className={`rounded-lg border p-3 text-sm space-y-2 ${
                isEscalated ? 'border-destructive bg-destructive/10 animate-pulse' : 'border-border/40 bg-secondary/20'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${isEscalated ? 'text-destructive' : 'text-orange-500'}`} />
                  <span className="font-semibold capitalize">{a.status}</span>
                  {isEscalated && <Badge variant="destructive" className="text-[10px]">⚠ &gt;1h</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{a.message}</p>
              {a.latitude && a.longitude && (
                <a
                  href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <MapPin className="h-3 w-3" />
                  {a.latitude.toFixed(5)}, {a.longitude.toFixed(5)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <div className="flex gap-1 pt-1">
                {a.status !== 'acknowledged' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(a.id, 'acknowledged')}>
                    Acknowledge
                  </Button>
                )}
                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => updateStatus(a.id, 'resolved')}>
                  <Check className="h-3 w-3" /> Resolve
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

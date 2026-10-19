import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BellRing, Check, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { loadEmergencyAlerts } from '@/lib/emergencyAlerts';
import { parseMeta } from '@/lib/bookingMeta';
import { formatPeso } from '@/lib/payments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

type Props = { locationId?: string | null };

export default function ActiveSupportAlerts({ locationId }: Props) {
  const [sos, setSos] = useState<any[]>([]);
  const [horse, setHorse] = useState<{ bookingId: string; name: string; station: string; fee: number; requestedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLoadError(null);
      const alerts = await loadEmergencyAlerts(locationId);
      setSos(alerts);
      let query = supabase.from('bookings').select('id,booking_date,location_id,notes,status,emergency_contact_name')
        .not('status', 'in', '(cancelled,completed)');
      if (locationId) query = query.eq('location_id', locationId);
      const { data, error } = await query.limit(100);
      if (error) throw error;
      const requests: typeof horse = [];
      ((data as any[]) || []).forEach((booking) => {
        const meta = parseMeta(booking.notes);
        (meta.horseHelpRequests || []).filter((item) => item.status === 'requested').forEach((item) => requests.push({
          bookingId: booking.id,
          name: meta.fullName || booking.emergency_contact_name || 'Hiker group',
          station: item.stationLabel || item.station,
          fee: Number(item.fee) || 0,
          requestedAt: item.requestedAt,
        }));
      });
      setHorse(requests);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Support alerts could not be loaded.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    void load();
    const channel = supabase.channel(`admin-support-alerts-${locationId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, () => void load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages' }, () => void load())
      .subscribe();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [load, locationId]);

  const updateAlert = async (id: string, status: 'acknowledged' | 'resolved') => {
    const { error } = await supabase.from('emergency_alerts' as any).update({
      status,
      ...(status === 'acknowledged' ? { acknowledged_at: new Date().toISOString() } : { resolved_at: new Date().toISOString() }),
    }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  if (!loading && sos.length === 0 && horse.length === 0 && !loadError) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/[0.03]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-destructive" />Active support alerts</CardTitle>
        <Button variant="ghost" size="icon" aria-label="Refresh support alerts" title="Refresh support alerts" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {loadError && <p role="alert" className="text-sm text-destructive md:col-span-2">Emergency alerts could not be loaded. Use refresh to retry.</p>}
        {sos.map((alert) => (
          <div key={alert.id} className="rounded-lg border border-destructive/30 bg-background p-3 text-sm">
            <div className="flex items-start justify-between gap-2"><p className="flex items-center gap-1.5 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> SOS · {alert.reporter_role}</p><Badge variant="destructive">{alert.status}</Badge></div>
            <p className="mt-1 text-xs text-muted-foreground">Pushed: {new Date(alert.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
            <p className="text-xs">Reporter: {alert.reporter_role} · Account {String(alert.user_id).slice(0, 8)}</p>
            {alert.booking_id && <p className="text-xs">Booking: {String(alert.booking_id).slice(0, 8)}</p>}
            {alert.pushed_latitude != null && <p className="text-xs">Push location: {Number(alert.pushed_latitude).toFixed(5)}, {Number(alert.pushed_longitude).toFixed(5)}</p>}
            {alert.latitude != null && <p className="text-xs">Latest location: {Number(alert.latitude).toFixed(5)}, {Number(alert.longitude).toFixed(5)}{alert.last_location_at ? ` · ${new Date(alert.last_location_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}` : ''}</p>}
            <div className="mt-2 flex gap-2">
              {alert.booking_id && <Button size="sm" variant="outline" asChild><Link to={`/admin?tab=operations&bookingId=${alert.booking_id}`}>View booking</Link></Button>}
              {alert.status === 'open' && <Button size="sm" variant="outline" onClick={() => void updateAlert(alert.id, 'acknowledged')}>Acknowledge</Button>}
              <Button size="sm" variant="outline" onClick={() => void updateAlert(alert.id, 'resolved')}><Check className="mr-1 h-3.5 w-3.5" /> Resolve</Button>
            </div>
          </div>
        ))}
        {horse.map((request) => (
          <div key={`${request.bookingId}-${request.station}`} className="rounded-lg border border-amber-400/40 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/20">
            <p className="font-semibold text-amber-700 dark:text-amber-300">🐴 Horse help requested</p>
            <p className="mt-1">{request.name} · {request.station}</p>
            <p className="text-xs text-muted-foreground">Additional payment due: {formatPeso(request.fee)} · {new Date(request.requestedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

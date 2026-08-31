import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Loader2 } from 'lucide-react';

interface AccessLog {
  id: string;
  mdrrmo_user_id: string;
  booking_id: string | null;
  location_id: string | null;
  access_type: string;
  accessed_at: string;
}

export default function MDRRMOAccessAudit({ locationId }: { locationId: string | null }) {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const query = supabase
      .from('mdrrmo_access_logs' as any)
      .select('id,mdrrmo_user_id,booking_id,location_id,access_type,accessed_at')
      .order('accessed_at', { ascending: false })
      .limit(25);
    const { data, error: queryError } = locationId ? await query.eq('location_id', locationId) : await query;
    if (queryError) setError(queryError.message);
    else setLogs((data as unknown as AccessLog[] | null) ?? []);
    setLoading(false);
  }, [locationId]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> MDRRMO access log</CardTitle>
        <p className="text-xs text-muted-foreground">Recent emergency-directory views recorded for administrator review.</p>
      </CardHeader>
      <CardContent>
        {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading log</div> : error ? <p className="text-sm text-muted-foreground">Access log unavailable until its database migration is applied.</p> : logs.length === 0 ? <p className="text-sm text-muted-foreground">No MDRRMO access has been recorded.</p> : <div className="space-y-2">{logs.map((log) => <div key={log.id} className="flex flex-col gap-1 rounded-md border border-border/40 bg-background/30 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"><div><span className="font-medium">{log.access_type === 'consent_accepted' ? 'Agreement accepted' : 'Directory viewed'}</span><span className="ml-2 text-muted-foreground">MDRRMO {log.mdrrmo_user_id.slice(0, 8)}</span>{log.booking_id && <span className="ml-2 text-muted-foreground">Booking {log.booking_id.slice(0, 8)}</span>}</div><Badge variant="outline" className="w-fit font-normal">{new Date(log.accessed_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</Badge></div>)}</div>}
      </CardContent>
    </Card>
  );
}

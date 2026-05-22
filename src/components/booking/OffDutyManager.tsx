import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, CalendarOff, Check, X } from 'lucide-react';
import { format } from 'date-fns';

export function GuideOffDutyForm({ guideId, onChange }: { guideId: string; onChange?: () => void }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase.from('guide_off_duty_requests' as any)
      .select('*').eq('guide_id', guideId).order('created_at', { ascending: false });
    setMine((data as any) ?? []);
  };
  useEffect(() => { if (guideId) void load(); }, [guideId]);

  const submit = async () => {
    if (!start || !end) { toast.error('Pick start and end dates'); return; }
    if (end < start) { toast.error('End must be after start'); return; }
    setBusy(true);
    const { error } = await supabase.from('guide_off_duty_requests' as any)
      .insert({ guide_id: guideId, start_date: start, end_date: end, reason });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Off-duty request submitted');
    setStart(''); setEnd(''); setReason(''); void load(); onChange?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CalendarOff className="h-5 w-5" /> Request off-duty</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} min={new Date().toISOString().slice(0,10)} />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} min={start || new Date().toISOString().slice(0,10)} />
        </div>
        <Textarea rows={2} placeholder="Reason (medical, personal, training…)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit request'}
        </Button>

        {mine.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Your requests</p>
            {mine.map((r) => (
              <div key={r.id} className="border rounded-md p-2 text-sm flex items-center justify-between">
                <div>
                  <p>{format(new Date(r.start_date), 'MMM d')} – {format(new Date(r.end_date), 'MMM d, yyyy')}</p>
                  <p className="text-xs text-muted-foreground">{r.reason || 'No reason given'}</p>
                </div>
                <Badge variant={r.status === 'approved' ? 'default' : r.status === 'rejected' ? 'destructive' : 'secondary'}>
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminOffDutyApprovals() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('guide_off_duty_requests' as any)
      .select('*').order('created_at', { ascending: false }).limit(100);
    const list = (data as any[]) ?? [];
    // hydrate guide names
    const gids = Array.from(new Set(list.map((r) => r.guide_id)));
    let nameMap: Record<string, string> = {};
    if (gids.length) {
      const { data: gs } = await supabase.from('guides').select('id, full_name').in('id', gids);
      nameMap = Object.fromEntries(((gs as any[]) ?? []).map((g) => [g.id, g.full_name]));
    }
    setRows(list.map((r) => ({ ...r, guide_name: nameMap[r.guide_id] || r.guide_id })));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase.from('guide_off_duty_requests' as any)
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Request ${status}`);
    void load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CalendarOff className="h-5 w-5" /> Guide off-duty requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> :
          rows.length === 0 ? <p className="text-sm text-muted-foreground">No requests.</p> :
          rows.map((r) => (
            <div key={r.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
              <div className="text-sm">
                <p className="font-medium">{r.guide_name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(r.start_date), 'MMM d')} – {format(new Date(r.end_date), 'MMM d, yyyy')}
                </p>
                {r.reason && <p className="text-xs italic">"{r.reason}"</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.status === 'approved' ? 'default' : r.status === 'rejected' ? 'destructive' : 'secondary'}>
                  {r.status}
                </Badge>
                {r.status === 'pending' && (
                  <>
                    <Button size="sm" variant="default" onClick={() => decide(r.id, 'approved')}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => decide(r.id, 'rejected')}><X className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            </div>
          ))
        }
      </CardContent>
    </Card>
  );
}

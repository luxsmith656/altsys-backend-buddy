import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Props { guideId: string; locationId: string }

export default function GuideIncidentsPanel({ guideId, locationId }: Props) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('injury');
  const [severity, setSeverity] = useState('minor');
  const [desc, setDesc] = useState('');
  const [bookingRef, setBookingRef] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('guide_incidents' as any)
      .select('*')
      .eq('guide_id', guideId)
      .order('occurred_at', { ascending: false });
    setList((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [guideId]);

  const submit = async () => {
    const u = (await supabase.auth.getUser()).data.user;
    if (!u) return toast.error('Sign in required');
    const { error } = await supabase.from('guide_incidents' as any).insert({
      guide_id: guideId,
      location_id: locationId,
      booking_id: bookingRef.trim() || null,
      incident_type: type,
      severity,
      description: desc,
      reported_by: u.id,
    } as any);
    if (error) return toast.error(error.message);
    toast.success('Incident recorded');
    setDesc(''); setBookingRef('');
    void load();
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-orange-500" /> Incident tracking
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Log injuries, ankle sprains, slips or other concerns from the trail. Visible to LGU and your trailhead admin.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-4 gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="injury">Injury</SelectItem>
              <SelectItem value="ankle">Ankle / sprain</SelectItem>
              <SelectItem value="slip">Slip / fall</SelectItem>
              <SelectItem value="exhaustion">Exhaustion</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="minor">Minor</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="severe">Severe</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Booking ID (optional)" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} className="sm:col-span-2" />
          <Textarea placeholder="What happened?" value={desc} onChange={(e) => setDesc(e.target.value)} className="sm:col-span-4" rows={2} />
          <Button onClick={submit} className="sm:col-span-4"><Plus className="h-4 w-4 mr-1" /> Submit incident</Button>
        </div>

        {loading ? (
          <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto opacity-50" /></div>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No incidents reported. Stay safe!</p>
        ) : (
          <div className="space-y-1 max-h-[260px] overflow-auto">
            {list.map((i) => (
              <div key={i.id} className="text-xs p-2 rounded border border-border/20 bg-secondary/20">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${i.severity === 'severe' ? 'bg-destructive/20 text-destructive' : i.severity === 'moderate' ? 'bg-amber-500/20 text-amber-600' : 'bg-muted'}`}>
                      {i.severity}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{i.incident_type}</Badge>
                    <span className="text-muted-foreground">{format(new Date(i.occurred_at), 'MMM d, h:mm a')}</span>
                  </div>
                  {i.resolved && <Badge variant="outline" className="text-[10px] text-emerald-500">resolved</Badge>}
                </div>
                {i.description && <p className="mt-1 text-muted-foreground">{i.description}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

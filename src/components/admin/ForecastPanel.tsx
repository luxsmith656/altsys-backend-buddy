import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { aggregateDaily, forecast, findPeaks, type EventEffect, type ForecastPoint, type DailyPoint } from '@/lib/forecasting';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, ComposedChart } from 'recharts';
import { TrendingUp, CalendarPlus, Loader2, Trash2, AlertTriangle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Props { locationId: string | null; readOnly?: boolean }

export default function ForecastPanel({ locationId, readOnly = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<DailyPoint[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [horizon, setHorizon] = useState<'weekly' | 'monthly'>('weekly');
  const [predictions, setPredictions] = useState<ForecastPoint[]>([]);

  // event form
  const [evTitle, setEvTitle] = useState('');
  const [evType, setEvType] = useState('holiday');
  const [evEffect, setEvEffect] = useState<'boost' | 'drop'>('boost');
  const [evMag, setEvMag] = useState('0.3');
  const [evStart, setEvStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [evEnd, setEvEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

  const load = async () => {
    setLoading(true);
    let bq = supabase.from('bookings').select('booking_date,group_size,location_id,status').neq('status', 'cancelled');
    if (locationId) bq = bq.eq('location_id', locationId);
    const { data: bookings } = await bq;

    let eq = supabase.from('events_calendar' as any).select('*').order('start_date', { ascending: false });
    if (locationId) eq = eq.or(`location_id.eq.${locationId},location_id.is.null`);
    const { data: evs } = await eq;

    const daily = aggregateDaily((bookings ?? []) as any);
    setSeries(daily);
    setEvents((evs as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [locationId]);

  useEffect(() => {
    const eventEffects: EventEffect[] = events.map((e) => ({
      start_date: e.start_date,
      end_date: e.end_date,
      effect: e.effect,
      effect_magnitude: Number(e.effect_magnitude ?? 0),
      title: e.title,
    }));
    const days = horizon === 'weekly' ? 14 : 60;
    setPredictions(forecast(series, eventEffects, days));
  }, [series, events, horizon]);

  const peaks = useMemo(() => findPeaks(series), [series]);

  const chartData = useMemo(() => {
    const histTail = series.slice(-30).map((p) => ({ date: p.date, actual: p.count }));
    const fut = predictions.map((p) => ({
      date: p.date,
      yhat: Math.round(p.yhat * 10) / 10,
      lower: Math.round(p.yhat_lower * 10) / 10,
      upper: Math.round(p.yhat_upper * 10) / 10,
      events: p.eventTitles.join(', '),
    }));
    return [...histTail, ...fut];
  }, [series, predictions]);

  const upcomingPeak = useMemo(() => {
    if (predictions.length === 0) return null;
    return predictions.reduce((a, b) => (b.yhat > a.yhat ? b : a));
  }, [predictions]);

  const addEvent = async () => {
    if (!evTitle.trim()) return toast.error('Title required');
    const { error } = await supabase.from('events_calendar' as any).insert({
      title: evTitle,
      event_type: evType,
      effect: evEffect,
      effect_magnitude: Number(evMag),
      start_date: evStart,
      end_date: evEnd,
      location_id: locationId,
    } as any);
    if (error) return toast.error(error.message);
    toast.success('Event added — forecast updated');
    setEvTitle('');
    void load();
  };

  const removeEvent = async (id: string) => {
    const { error } = await supabase.from('events_calendar' as any).delete().eq('id', id);
    if (error) return toast.error(error.message);
    void load();
  };

  if (loading) {
    return <Card className="glass-card"><CardContent className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <PeakCard label="Peak Month" value={peaks.peakMonth?.[0] ?? '—'} sub={peaks.peakMonth ? `${peaks.peakMonth[1]} hikers` : 'No data yet'} />
        <PeakCard label="Peak Week" value={peaks.peakWeek?.[0] ?? '—'} sub={peaks.peakWeek ? `${peaks.peakWeek[1]} hikers` : 'No data yet'} />
        <PeakCard label="Peak Year" value={peaks.peakYear?.[0] ?? '—'} sub={peaks.peakYear ? `${peaks.peakYear[1]} hikers` : 'No data yet'} />
      </div>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Booking forecast
            <Badge variant="outline" className="ml-2 text-[10px]">trend × weekly × events</Badge>
          </CardTitle>
          <Select value={horizon} onValueChange={(v) => setHorizon(v as any)}>
            <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Next 14 days</SelectItem>
              <SelectItem value="monthly">Next 60 days</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {series.length < 3 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Forecast will improve as more bookings come in (need at least 3 days of history).
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="actual" fill="hsl(var(--primary))" name="Actual" />
                <Area dataKey="upper" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.08} name="Upper bound" />
                <Area dataKey="lower" stroke="none" fill="hsl(var(--background))" fillOpacity={1} name="Lower bound" />
                <Line dataKey="yhat" stroke="#22c55e" strokeWidth={2} dot={false} name="Predicted" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          {upcomingPeak && (
            <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-amber-500" />
              Predicted peak: <strong className="text-foreground">{upcomingPeak.date}</strong> ≈ {Math.round(upcomingPeak.yhat)} hikers
              {upcomingPeak.eventTitles.length > 0 && <span>(driver: {upcomingPeak.eventTitles.join(', ')})</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" /> Events affecting prediction
            {readOnly && <Badge variant="outline" className="text-[10px]">read-only</Badge>}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Add holidays, transport strikes, fires or emergencies. The model multiplies the baseline by (1 ± magnitude) on those dates.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!readOnly && (
            <div className="grid sm:grid-cols-6 gap-2">
              <Input placeholder="Title" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} className="sm:col-span-2" />
              <Select value={evType} onValueChange={setEvType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="holiday">Holiday</SelectItem>
                  <SelectItem value="strike">Transport strike</SelectItem>
                  <SelectItem value="fire">Fire / emergency</SelectItem>
                  <SelectItem value="weather">Severe weather</SelectItem>
                  <SelectItem value="festival">Festival</SelectItem>
                </SelectContent>
              </Select>
              <Select value={evEffect} onValueChange={(v) => setEvEffect(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="boost">Boost ↑</SelectItem>
                  <SelectItem value="drop">Drop ↓</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" step="0.05" min="0" max="2" value={evMag} onChange={(e) => setEvMag(e.target.value)} placeholder="0.3" />
              <Input type="date" value={evStart} onChange={(e) => setEvStart(e.target.value)} />
              <Input type="date" value={evEnd} onChange={(e) => setEvEnd(e.target.value)} className="sm:col-span-2" />
              <Button onClick={addEvent} className="sm:col-span-2"><CalendarPlus className="h-4 w-4 mr-1" /> Add event</Button>
            </div>
          )}

          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No events configured.</p>
          ) : (
            <div className="space-y-1 max-h-[260px] overflow-auto">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs p-2 rounded border border-border/20 bg-secondary/20">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">{e.event_type}</Badge>
                    <Badge className={`text-[10px] ${e.effect === 'boost' ? 'bg-emerald-500/20 text-emerald-600' : 'bg-destructive/20 text-destructive'}`}>
                      {e.effect === 'boost' ? '↑' : '↓'} {Math.round(Number(e.effect_magnitude) * 100)}%
                    </Badge>
                    <span className="font-medium">{e.title}</span>
                    <span className="text-muted-foreground">{e.start_date} → {e.end_date}</span>
                  </div>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={() => removeEvent(e.id)} aria-label="Remove">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PeakCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

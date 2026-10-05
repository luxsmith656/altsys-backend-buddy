import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { summarizeHikeAnalytics, type AnalyticsBooking } from '@/lib/hikeAnalytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw } from 'lucide-react';

export default function HikeAnalytics({ locationIds }: { locationIds: string[] }) {
  const [from, setFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }));
  const valid = Boolean(from && to && from <= to);
  const query = useQuery({
    queryKey: ['hike-analytics', locationIds, from, to],
    enabled: valid && locationIds.length > 0,
    queryFn: async ({ signal }) => {
      const records: AnalyticsBooking[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('bookings').select('id,location_id,status,group_size,notes')
          .in('location_id', locationIds).gte('booking_date', from).lte('booking_date', to)
          .in('status', ['confirmed', 'approved', 'active', 'completed'])
          .order('id').range(offset, offset + 499).abortSignal(signal);
        if (result.error) throw result.error;
        records.push(...result.data);
        if (result.data.length < 500) break;
      }
      return summarizeHikeAnalytics(records);
    },
  });
  const data = valid ? query.data : undefined;
  return <section className="border-t border-border pt-6 space-y-4" aria-labelledby="hike-analytics-title">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <div><h2 id="hike-analytics-title" className="text-lg font-semibold">Visitor & Hike Analytics</h2><p className="text-xs text-muted-foreground">Confirmed and completed groups at the selected trailheads. Dates in Manila time.</p></div>
      <Button aria-label="Refresh hike analytics" title="Refresh hike analytics" variant="outline" size="icon" disabled={query.isFetching || !valid} onClick={() => void query.refetch()}><RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} /></Button>
    </div>
    <div className="flex flex-wrap gap-3"><div><Label htmlFor="analytics-from">From</Label><Input id="analytics-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><Label htmlFor="analytics-to">To</Label><Input id="analytics-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
    {!valid && <p role="alert" className="text-sm text-destructive">Choose a valid date range.</p>}
    {query.isPending && valid && <p role="status">Loading hike analytics...</p>}
    {query.isError && <p role="alert" className="text-sm text-destructive">Could not load analytics. {query.error.message}</p>}
    {data && !query.isError && <>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div><dt className="text-sm text-muted-foreground">Foreign : Local visitors</dt><dd className="text-xl font-semibold">{data.foreign} : {data.local}</dd><p className="text-xs text-muted-foreground">Local = Filipino nationality</p></div>
        <div><dt className="text-sm text-muted-foreground">Nationality not recorded</dt><dd className="text-xl font-semibold">{data.unknown}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Average hikers / booking</dt><dd className="text-xl font-semibold">{data.groupSize.average?.toFixed(1) ?? 'Not recorded'}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Typical group (median)</dt><dd className="text-xl font-semibold">{data.groupSize.median ?? 'Not recorded'}</dd><p className="text-xs text-muted-foreground">{data.groupSize.count} groups</p></div>
      </dl>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><caption className="text-left text-xs text-muted-foreground py-3">Actual recorded durations, per group. Missing or reversed timestamps are excluded; planned durations are never substituted.</caption><thead><tr className="border-b"><th className="py-2">Phase</th><th>Average</th><th>Median</th><th>Groups</th></tr></thead><tbody>{([['Ascent', data.ascent], ['Summit stay', data.summit], ['Descent', data.descent]] as const).map(([name, value]) => <tr key={name} className="border-b border-border/50"><th className="py-3 font-medium">{name}</th><td>{value.average === null ? 'Not recorded' : `${Math.round(value.average)} min`}</td><td>{value.median === null ? 'Not recorded' : `${Math.round(value.median)} min`}</td><td>{value.count}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { summarizeAdminOverview } from '@/lib/adminOverview';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CalendarCheck, MapPin, Loader2, RefreshCw, Wallet, Users, ScanLine } from 'lucide-react';
import { formatPeso } from '@/lib/payments';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import DemographicsTab from '@/components/admin/DemographicsTab';

const empty = summarizeAdminOverview([], [], '');

export default function OverviewDashboard({ locationId }: { locationId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [stats, setStats] = useState(empty);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [demoTab, setDemoTab] = useState<'age' | 'origin'>('age');

  useEffect(() => {
    let current = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        let bookingsQuery = supabase.from('bookings').select('id,booking_date,status,group_size,notes')
          .or(`booking_date.eq.${today},status.in.(confirmed,active,approved)`);
        let sessionsQuery = supabase.from('hiker_sessions').select('id,booking_id,participant_role,status,start_time,end_time').eq('status', 'active');
        let capacityQuery = supabase.from('daily_capacity').select('max_capacity').eq('date', today);
        if (locationId) {
          bookingsQuery = bookingsQuery.eq('location_id', locationId);
          sessionsQuery = sessionsQuery.eq('location_id', locationId);
          capacityQuery = capacityQuery.eq('location_id', locationId);
        }
        const bookings = await bookingsQuery;
        if (bookings.error) throw bookings.error;
        const sessions = await sessionsQuery;
        if (sessions.error) throw sessions.error;
        const limits = await capacityQuery;
        if (limits.error) throw limits.error;
        if (!current) return;
        setStats(summarizeAdminOverview(bookings.data || [], sessions.data || [], today));
        setCapacity(limits.data?.length ? limits.data.reduce((total, row) => total + row.max_capacity, 0) : null);
      } catch (cause) {
        if (current) setError(cause instanceof Error ? cause.message : 'Unable to load live dashboard data.');
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => { current = false; };
  }, [locationId, revision]);

  useEffect(() => {
    const filter = locationId ? `location_id=eq.${locationId}` : undefined;
    const channel = supabase.channel(`overview-${locationId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter }, () => setRevision((n) => n + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hiker_sessions', filter }, () => setRevision((n) => n + 1))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [locationId]);

  const chart = demoTab === 'age' ? stats.ageData : stats.originData;
  const cards = [
    { label: 'Total Bookings Today', value: stats.totalBookings, detail: 'Scheduled today, Manila time', icon: CalendarCheck },
    { label: 'Active on Trail', value: stats.activeHikers, detail: 'Hikers in checked-in groups', icon: Users },
    { label: 'Daily Capacity', value: capacity === null ? 'Not set' : capacity, detail: 'Configured hiker limit for today', icon: MapPin },
    { label: "Collected for Today's Hikes", value: formatPeso(stats.todayRevenue), detail: `${stats.collectionRate}% of expected fees collected`, icon: Wallet },
  ];

  return (
    <div className="space-y-6" aria-busy={loading}>
      <div className="flex items-center justify-end gap-3">
        {loading && <span role="status" className="text-sm text-muted-foreground">Loading live data...</span>}
        <Button variant="outline" size="icon" aria-label="Refresh overview" title="Refresh overview" disabled={loading} onClick={() => setRevision((n) => n + 1)}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">Dashboard unavailable. {error}</p>}
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <Card key={label} className="glass-card min-w-0">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-muted-foreground font-medium">{label}</p>
                <Icon className="h-4 w-4 shrink-0 text-primary" />
              </div>
              <p className="text-2xl font-bold break-words">{error ? 'Unavailable' : loading ? '...' : value}</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {!error && !loading && <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold">Visitor Demographics</h2>
              <p className="text-xs text-muted-foreground">Today's confirmed visitors</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Dialog>
                <DialogTrigger asChild><button className="text-xs text-primary hover:underline">View Detailed Demographics</button></DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[85dvh] overflow-y-auto">
                  <DialogTitle>Visitor Demographics</DialogTitle>
                  <DialogDescription>Confirmed visits in your location.</DialogDescription>
                  <DemographicsTab locationId={locationId} />
                </DialogContent>
              </Dialog>
              <div role="group" aria-label="Demographic view" className="flex bg-secondary/40 rounded-md p-1">
                {(['age', 'origin'] as const).map((tab) => <button key={tab} aria-pressed={demoTab === tab} className={`px-3 py-2 text-xs rounded-md capitalize ${demoTab === tab ? 'bg-secondary' : 'text-muted-foreground'}`} onClick={() => setDemoTab(tab)}>{tab}</button>)}
              </div>
            </div>
          </div>
          {chart.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">No confirmed visitor data for today.</p> : <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Bar dataKey="value" name="Visitors" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={48} />
            </BarChart>
          </ResponsiveContainer>}
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-4">Live Check-ins</h2>
          {stats.recentLogs.length === 0 && <p className="text-sm text-muted-foreground">No active check-ins.</p>}
          <ul className="divide-y divide-border">
            {stats.recentLogs.map((log) => <li key={log.id} className="flex gap-3 py-3">
              <ScanLine className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 text-sm"><p className="font-medium break-words">{log.name}</p><p className="text-xs text-muted-foreground">{log.groupSize} hikers · {new Date(log.startTime).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT</p></div>
            </li>)}
          </ul>
          <Link to="/admin?tab=scan" className="inline-flex items-center gap-2 text-sm text-primary mt-4"><ScanLine className="h-4 w-4" />Open Check-in</Link>
        </section>
      </div>}
    </div>
  );
}

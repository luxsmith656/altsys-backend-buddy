import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { DollarSign, RefreshCw, Loader2, Receipt, FileDown } from 'lucide-react';
import { format, startOfMonth, subMonths } from 'date-fns';
import { exportToExcelMultiSheet } from '@/lib/excel-export';
import { useLocations } from '@/hooks/useLocations';

interface Props { locationId: string | null }

const peso = (n: number) => `₱${Math.round(n).toLocaleString()}`;

export default function LGUFinancialPanel({ locationId }: Props) {
  const { locations } = useLocations();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    let bq = supabase.from('bookings').select('*').not('status', 'eq', 'cancelled');
    if (locationId) bq = bq.eq('location_id', locationId);
    const { data: b } = await bq;
    setBookings(b ?? []);

    let gq = supabase.from('guides' as any).select('*');
    if (locationId) gq = gq.eq('location_id', locationId);
    const { data: g } = await gq;
    setGuides((g as any[]) ?? []);

    let iq = supabase.from('guide_incidents' as any).select('*');
    if (locationId) iq = iq.eq('location_id', locationId);
    const { data: i } = await iq;
    setIncidents((i as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [locationId]);

  const data = useMemo(() => {
    const totalRevenue = bookings.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const entryFees = bookings.reduce((s, b) => s + Number(b.entry_fee || 0) * (b.group_size || 1), 0);
    const guideFees = bookings.reduce((s, b) => s + Number(b.guide_fee || 0), 0);
    const envFees = Math.max(0, totalRevenue - entryFees - guideFees);
    const paid = bookings.filter((b) => b.payment_status === 'paid').length;
    const partial = bookings.filter((b) => b.payment_status === 'partial').length;
    const unpaid = bookings.filter((b) => b.payment_status === 'unpaid').length;

    // Monthly revenue (last 6 months)
    const months: { month: string; revenue: number; bookings: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i));
      const key = format(d, 'MMM yy');
      months.push({ month: key, revenue: 0, bookings: 0 });
    }
    for (const b of bookings) {
      if (!b.booking_date) continue;
      const key = format(new Date(b.booking_date), 'MMM yy');
      const m = months.find((x) => x.month === key);
      if (m) { m.revenue += Number(b.total_amount || 0); m.bookings += 1; }
    }

    // Per-guide payouts
    const guideMap: Record<string, { id: string; name: string; bookings: number; gross: number; incidents: number; payout: number }> = {};
    for (const g of guides) {
      guideMap[g.id] = { id: g.id, name: g.full_name, bookings: 0, gross: 0, incidents: 0, payout: 0 };
    }
    for (const b of bookings) {
      if (!b.preferred_guide_id || !guideMap[b.preferred_guide_id]) continue;
      guideMap[b.preferred_guide_id].bookings += 1;
      guideMap[b.preferred_guide_id].gross += Number(b.guide_fee || 0);
    }
    for (const inc of incidents) {
      if (guideMap[inc.guide_id]) guideMap[inc.guide_id].incidents += 1;
    }
    const guidePayouts = Object.values(guideMap).map((g) => {
      // simple incident-adjusted payout: -5% per incident, max -25%
      const factor = Math.max(0.75, 1 - 0.05 * g.incidents);
      return { ...g, payout: g.gross * factor };
    }).sort((a, b) => b.payout - a.payout);

    return { totalRevenue, entryFees, guideFees, envFees, paid, partial, unpaid, months, guidePayouts };
  }, [bookings, guides, incidents]);

  const exportCsv = () => {
    const summary = [
      { Metric: 'Scope', Value: locationId ? (locations.find((l) => l.id === locationId)?.name ?? 'Single location') : 'All locations' },
      { Metric: 'Generated', Value: new Date().toLocaleString('en-PH') },
      { Metric: 'Total Revenue (PHP)', Value: data.totalRevenue },
      { Metric: 'Entry Fees', Value: data.entryFees },
      { Metric: 'Guide Fees', Value: data.guideFees },
      { Metric: 'Env / Other Fees', Value: data.envFees },
      { Metric: 'Paid Bookings', Value: data.paid },
      { Metric: 'Partial', Value: data.partial },
      { Metric: 'Unpaid', Value: data.unpaid },
    ];
    const guideRows = data.guidePayouts.map((g) => ({
      Guide: g.name, Bookings: g.bookings,
      'Gross Fees (PHP)': g.gross, Incidents: g.incidents, 'Adjusted Payout (PHP)': Math.round(g.payout),
    }));
    const monthly = data.months.map((m) => ({ Month: m.month, Bookings: m.bookings, 'Revenue (PHP)': m.revenue }));
    exportToExcelMultiSheet(
      [
        { name: 'Summary', rows: summary },
        { name: 'Monthly Revenue', rows: monthly },
        { name: 'Guide Payouts', rows: guideRows },
      ],
      `lgu-financial-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  const feeSplit = [
    { name: 'Entry Fees', value: data.entryFees },
    { name: 'Guide Fees', value: data.guideFees },
    { name: 'Env / Other', value: data.envFees },
  ];
  const splitColors = ['#22c55e', '#3b82f6', '#f59e0b'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold">Financial Report</h3>
          <p className="text-xs text-muted-foreground">Read-only LGU oversight. No edits permitted.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="gap-1"><RefreshCw className="h-3 w-3" /> Refresh</Button>
          <Button size="sm" onClick={exportCsv} className="gap-1"><FileDown className="h-3 w-3" /> Export Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: peso(data.totalRevenue) },
          { label: 'Entry Fees', value: peso(data.entryFees) },
          { label: 'Guide Fees', value: peso(data.guideFees) },
          { label: 'Env / Other', value: peso(data.envFees) },
        ].map((s) => (
          <Card key={s.label} className="glass-card"><CardContent className="p-3 flex items-center gap-3">
            <DollarSign className="h-6 w-6 text-emerald-500 opacity-60" />
            <div><p className="text-[11px] text-muted-foreground">{s.label}</p><p className="text-lg font-bold">{s.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Revenue (last 6mo)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.months}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(v: any) => peso(Number(v))} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-sm">Fee Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={feeSplit} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${peso(value as number)}`}>
                  {feeSplit.map((_, i) => <Cell key={i} fill={splitColors[i]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => peso(Number(v))} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-around text-xs mt-2">
              <Badge variant="outline" className="gap-1">✅ {data.paid} paid</Badge>
              <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/30">◐ {data.partial} partial</Badge>
              <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">○ {data.unpaid} unpaid</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Guide Payouts (incident-adjusted)</CardTitle>
          <p className="text-[10px] text-muted-foreground">−5% per incident (capped at −25%)</p>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[280px] overflow-y-auto">
          {data.guidePayouts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No guide bookings yet.</p>}
          {data.guidePayouts.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-xs p-2 rounded bg-secondary/30">
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{g.name}</span>
                <span className="text-[10px] text-muted-foreground">{g.bookings} bookings • {g.incidents} incidents</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground line-through opacity-60">{peso(g.gross)}</span>
                <span className="font-bold text-emerald-500">{peso(g.payout)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseMeta } from '@/lib/bookingMeta';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Users, Globe, MapPin, Loader2, RefreshCw } from 'lucide-react';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#f97316', '#64748b'];

interface Props { locationId: string | null }

function ageGroup(age: string | undefined | null): string {
  const n = parseInt(String(age ?? '0'));
  if (!n) return 'Unknown';
  if (n < 18) return '<18';
  if (n < 26) return '18–25';
  if (n < 36) return '26–35';
  if (n < 46) return '36–45';
  if (n < 61) return '46–60';
  return '61+';
}

function toChartData(record: Record<string, number>, limit = 10) {
  return Object.entries(record).sort(([, a], [, b]) => b - a).slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

export default function LGUDemographicsPanel({ locationId }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    let q = supabase.from('bookings').select('*').not('status', 'eq', 'cancelled');
    if (locationId) q = q.eq('location_id', locationId);
    const { data } = await q;
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [locationId]);

  const stats = useMemo(() => {
    const byAge: Record<string, number> = {};
    const bySex: Record<string, number> = {};
    const byNat: Record<string, number> = {};
    const byCity: Record<string, number> = {};
    let total = 0;

    for (const b of rows) {
      const meta = parseMeta(b.notes);
      total += b.group_size || 1;
      const ag = ageGroup(meta.age ?? b.age_bracket);
      byAge[ag] = (byAge[ag] || 0) + 1;
      const sex = meta.sex === 'male' ? 'Male' : meta.sex === 'female' ? 'Female' : (b.gender || 'Unspecified');
      bySex[sex] = (bySex[sex] || 0) + 1;
      const nat = meta.nationality || 'Filipino';
      byNat[nat] = (byNat[nat] || 0) + 1;
      const city = [meta.city, meta.province].filter(Boolean).join(', ') || b.origin_city || 'Unspecified';
      byCity[city] = (byCity[city] || 0) + 1;

      for (const c of (meta.companionDetails || [])) {
        byAge[ageGroup(c.age)] = (byAge[ageGroup(c.age)] || 0) + 1;
        const cs = c.sex === 'male' ? 'Male' : c.sex === 'female' ? 'Female' : 'Unspecified';
        bySex[cs] = (bySex[cs] || 0) + 1;
        byNat[c.nationality || 'Filipino'] = (byNat[c.nationality || 'Filipino'] || 0) + 1;
        if (c.city) byCity[c.city] = (byCity[c.city] || 0) + 1;
      }
    }
    return { total, byAge, bySex, byNat, byCity };
  }, [rows]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Visitor Demographics</h3>
          <p className="text-xs text-muted-foreground">Read-only view {locationId ? 'for selected location' : 'across all locations'}.</p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="gap-1">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Visitors', value: stats.total, icon: Users },
          { label: 'Bookings', value: rows.length, icon: Users },
          { label: 'Nationalities', value: Object.keys(stats.byNat).length, icon: Globe },
          { label: 'Origin Cities', value: Object.keys(stats.byCity).length, icon: MapPin },
        ].map((s) => (
          <Card key={s.label} className="glass-card"><CardContent className="p-3 flex items-center gap-3">
            <s.icon className="h-6 w-6 text-primary opacity-60" />
            <div><p className="text-[11px] text-muted-foreground">{s.label}</p><p className="text-lg font-bold">{s.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-sm">By Age Group</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={toChartData(stats.byAge)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="name" width={70} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-sm">By Sex</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={toChartData(stats.bySex)} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {toChartData(stats.bySex).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-sm">Nationality (Top 10)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={toChartData(stats.byNat, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={10} angle={-30} textAnchor="end" height={60} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="value" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-sm">Top Origin Cities (Top 10)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {toChartData(stats.byCity, 10).map(({ name, value }, i) => {
                const max = toChartData(stats.byCity, 1)[0]?.value || 1;
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 tabular-nums">{i + 1}.</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium truncate">{name}</span>
                        <Badge variant="outline" className="text-[10px]">{value}</Badge>
                      </div>
                      <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500/70 rounded-full" style={{ width: `${(value / max) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {toChartData(stats.byCity, 10).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No data yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

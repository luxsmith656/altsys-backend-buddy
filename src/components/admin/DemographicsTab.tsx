import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseMeta } from '@/lib/bookingMeta';
import { exportToExcelMultiSheet } from '@/lib/excel-export';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Users, Globe, MapPin, BarChart2, Loader2, FileDown, RefreshCw, PieChart as PieChartIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#f97316', '#64748b'];

interface DemoStats {
  total: number;
  byAgeGroup: Record<string, number>;
  bySex: Record<string, number>;
  byNationality: Record<string, number>;
  byCity: Record<string, number>;
}

function ageGroup(age: string | undefined): string {
  const n = parseInt(age ?? '0');
  if (!n) return 'Unknown';
  if (n < 13) return 'Child (0-12)';
  if (n < 18) return 'Teen (13-17)';
  if (n < 26) return 'Young Adult (18-25)';
  if (n < 36) return 'Adult (26-35)';
  if (n < 46) return 'Adult (36-45)';
  if (n < 61) return 'Middle Age (46-60)';
  return 'Senior (61+)';
}

function toChartData(record: Record<string, number>, limit = 10) {
  return Object.entries(record)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

export default function DemographicsTab() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DemoStats | null>(null);
  const [rawRows, setRawRows] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      // Get bookings from the last 90 days that are not cancelled/declined
      const minDate = new Date();
      minDate.setDate(minDate.getDate() - 90);

      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .gte('booking_date', minDate.toISOString().slice(0, 10))
        .in('status', ['approved', 'completed', 'active']);

      if (error) throw error;

      let total = 0;
      const byAgeGroup: Record<string, number> = {};
      const bySex: Record<string, number> = {};
      const byNat: Record<string, number> = {};
      const byCity: Record<string, number> = {};
      const rows: any[] = [];

      const inc = (rec: Record<string, number>, key: string) => {
        rec[key] = (rec[key] || 0) + 1;
      };

      for (const b of (data || [])) {
        const meta = parseMeta(b.notes);
        // Process hiker
        const n = (b as any).hiker_name || meta.fullName || 'Unknown';
        if (n && n !== 'Unknown') {
          total++;
          const age = meta.age || 'Unknown';
          inc(byAgeGroup, ageGroup(age));
          inc(bySex, meta.sex || 'Unknown');
          inc(byNat, meta.nationality || 'Philippines');
          inc(byCity, meta.city || 'Unknown');
          rows.push({ role: 'Lead Hiker', name: n, age, sex: meta.sex || 'Unknown', nationality: meta.nationality || 'Philippines', city: meta.city || 'Unknown' });
        }

        // Process companions
        if (meta.companionDetails && Array.isArray(meta.companionDetails)) {
          for (const c of meta.companionDetails) {
            if (!c.name) continue;
            total++;
            inc(byAgeGroup, ageGroup(c.age));
            inc(bySex, c.sex || 'Unknown');
            inc(byNat, c.nationality || 'Philippines');
            inc(byCity, c.city || 'Unknown');
            rows.push({ role: 'Companion', name: c.name, age: c.age || 'Unknown', sex: c.sex || 'Unknown', nationality: c.nationality || 'Philippines', city: c.city || 'Unknown' });
          }
        }
      }

      setRawRows(rows);
      setStats({ total, byAgeGroup, bySex, byNationality: byNat, byCity });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleExport = () => {
    if (!stats || rawRows.length === 0) return;
    const summaryRows = [
      { Metric: 'Total Visitors', Value: stats.total },
      { Metric: 'Unique Nationalities', Value: Object.keys(stats.byNationality).length },
      { Metric: 'Unique Local Cities', Value: Object.keys(stats.byCity).length },
    ];
    const ageRows = Object.entries(stats.byAgeGroup).map(([k, v]) => ({ 'Age Group': k, Count: v }));
    const sexRows = Object.entries(stats.bySex).map(([k, v]) => ({ Sex: k, Count: v }));
    const natRows = Object.entries(stats.byNationality).map(([k, v]) => ({ Nationality: k, Count: v }));
    const cityRows = Object.entries(stats.byCity).map(([k, v]) => ({ City: k, Count: v }));

    exportToExcelMultiSheet([
      { name: 'Summary', rows: summaryRows },
      { name: 'All Visitors', rows: rawRows },
      { name: 'By Age', rows: ageRows },
      { name: 'By Sex', rows: sexRows },
      { name: 'By Nationality', rows: natRows },
      { name: 'By Location', rows: cityRows },
    ], `mt-kalisungan-demographics-${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <Card className="glass-card flex flex-col h-[500px] border-primary/20">
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <PieChartIcon className="h-5 w-5 text-primary" /> Visitor Demographics
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Breakdown of started/onsite-confirmed visitors.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 h-8">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={handleExport} disabled={!stats} className="gap-1.5 h-8">
            <FileDown className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col min-h-0 pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-20 flex-1">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
            <TabsList className="bg-secondary/40 self-start mb-4">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="age">Age & Sex</TabsTrigger>
              <TabsTrigger value="origin">Nationality & Origin</TabsTrigger>
            </TabsList>
            
            <TabsContent value="summary" className="flex-1 mt-0">
              <div className="grid grid-cols-2 gap-4 h-full content-start">
                {[
                  { label: 'Total Visitors', value: stats.total, icon: Users, color: 'text-primary' },
                  { label: 'Nationalities', value: Object.keys(stats.byNationality).length, icon: Globe, color: 'text-sky-500' },
                  { label: 'Origin Cities', value: Object.keys(stats.byCity).length, icon: MapPin, color: 'text-amber-500' },
                  { label: 'Started Bookings', value: rawRows.length, icon: BarChart2, color: 'text-purple-500' },
                ].map((s) => (
                  <div key={s.label} className="bg-secondary/30 rounded-lg p-4 border border-border/50 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                      <p className="text-2xl font-bold mt-1">{s.value}</p>
                    </div>
                    <s.icon className={cn('h-8 w-8 opacity-40', s.color)} />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="age" className="flex-1 mt-0">
              <div className="grid sm:grid-cols-2 gap-6 h-full content-start">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Age Groups
                  </h4>
                  <div className="bg-secondary/20 rounded-lg border border-border/50 p-2">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={toChartData(stats.byAgeGroup)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(155 15% 18%)" />
                        <XAxis type="number" fontSize={11} stroke="hsl(150 10% 55%)" />
                        <YAxis type="category" dataKey="name" width={110} fontSize={10} stroke="hsl(150 10% 55%)" />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                        <Bar dataKey="value" name="Visitors" fill="hsl(152 60% 42%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-sky-500" /> By Sex
                  </h4>
                  <div className="bg-secondary/20 rounded-lg border border-border/50 p-2">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={toChartData(stats.bySex)} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                          {toChartData(stats.bySex).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="origin" className="flex-1 mt-0 overflow-y-auto custom-scrollbar pr-2">
              <div className="grid sm:grid-cols-2 gap-6 content-start">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4 text-amber-500" /> Top Nationalities
                  </h4>
                  <div className="bg-secondary/20 rounded-lg border border-border/50 p-2">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={toChartData(stats.byNationality)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(155 15% 18%)" />
                        <XAxis type="number" fontSize={11} stroke="hsl(150 10% 55%)" />
                        <YAxis type="category" dataKey="name" width={100} fontSize={10} stroke="hsl(150 10% 55%)" />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                        <Bar dataKey="value" name="Visitors" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-purple-500" /> Top Local Cities
                  </h4>
                  <div className="bg-secondary/20 rounded-lg border border-border/50 p-4 flex flex-col gap-3 min-h-[260px]">
                    {toChartData(stats.byCity).map(({ name, value }, i) => {
                      const maxVal = Math.max(...Object.values(stats.byCity));
                      return (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs font-medium truncate">{name}</span>
                              <Badge variant="outline" className="text-[10px] ml-2 shrink-0">{value}</Badge>
                            </div>
                            <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-purple-500/70"
                                style={{ width: `${(value / maxVal) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-20 text-muted-foreground flex-1 flex items-center justify-center">No data available.</div>
        )}
      </CardContent>
    </Card>
  );
}

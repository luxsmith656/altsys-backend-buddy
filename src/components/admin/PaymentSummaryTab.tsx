import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseMeta } from '@/lib/bookingMeta';
import { calculateFees, formatPeso } from '@/lib/payments';
import { exportToExcelMultiSheet } from '@/lib/excel-export';
import { fetchActivityLogs } from '@/lib/activity-log';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import {
  CreditCard, TrendingUp, Calendar, FileDown, RefreshCw, Loader2,
  ShieldCheck, History, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, startOfYear } from 'date-fns';
import { eachDayOfInterval, eachWeekOfInterval, endOfWeek, startOfWeek } from 'date-fns';

interface PaymentRow {
  bookingId: string;
  bookingDate: string;
  status: string;
  fullName: string;
  groupSize: number;
  paymentStatus: string;
  paymentMethod: string;
  amountPaid: number;
  totalFee: number;
  transactionId: string;
  createdAt: string;
  month: string;
  year: string;
}

export default function PaymentSummaryTab() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [trendMode, setTrendMode] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .not('status', 'eq', 'cancelled')
      .order('booking_date', { ascending: false });

    const payments: PaymentRow[] = (data || []).map((b) => {
      const meta = parseMeta(b.notes);
      const fees = calculateFees(b.group_size);
      const d = new Date(b.booking_date);
      return {
        bookingId: b.id,
        bookingDate: b.booking_date,
        status: b.status,
        fullName: meta.fullName || b.emergency_contact_name || '—',
        groupSize: b.group_size,
        paymentStatus: meta.paymentStatus || 'unpaid',
        paymentMethod: meta.paymentMethod || '—',
        amountPaid: meta.amountPaid ?? 0,
        totalFee: meta.totalFee ?? fees.totalFee,
        transactionId: meta.transactionId || '',
        createdAt: b.created_at,
        month: format(d, 'yyyy-MM'),
        year: format(d, 'yyyy'),
      };
    });
    setRows(payments);
    setLoading(false);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    const data = await fetchActivityLogs(undefined, 100);
    setLogs(data);
    setLogsLoading(false);
  };

  useEffect(() => { void load(); void loadLogs(); }, []);

  /* ── Aggregations ── */
  const summary = useMemo(() => {
    const totalCollected = rows.reduce((acc, r) => acc + r.amountPaid, 0);
    const totalDue = rows.reduce((acc, r) => acc + r.totalFee, 0);
    const paidCount = rows.filter((r) => r.paymentStatus === 'paid').length;
    const unpaidCount = rows.filter((r) => r.paymentStatus === 'unpaid').length;
    const partialCount = rows.filter((r) => r.paymentStatus === 'partial').length;
    return { totalCollected, totalDue, paidCount, unpaidCount, partialCount, outstanding: totalDue - totalCollected };
  }, [rows]);

  /* ── Monthly chart data ── */
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({ start: startOfMonth(subMonths(now, 11)), end: endOfMonth(now) });
    return months.map((m) => {
      const key = format(m, 'yyyy-MM');
      const monthRows = rows.filter((r) => r.month === key);
      const collected = monthRows.reduce((a, r) => a + r.amountPaid, 0);
      const due = monthRows.reduce((a, r) => a + r.totalFee, 0);
      return { month: format(m, 'MMM yy'), collected, due, bookings: monthRows.length };
    });
  }, [rows]);

  /* ── Yearly chart data ── */
  const yearlyData = useMemo(() => {
    const yearMap: Record<string, { collected: number; due: number; bookings: number }> = {};
    for (const r of rows) {
      if (!yearMap[r.year]) yearMap[r.year] = { collected: 0, due: 0, bookings: 0 };
      yearMap[r.year].collected += r.amountPaid;
      yearMap[r.year].due += r.totalFee;
      yearMap[r.year].bookings += 1;
    }
    return Object.entries(yearMap).sort(([a], [b]) => a.localeCompare(b)).map(([year, v]) => ({ year, ...v }));
  }, [rows]);

  const bookingRows = useMemo(() => rows.map((r) => ({ ...r, dateObj: new Date(r.bookingDate) })), [rows]);

  const trendData = useMemo(() => {
    const now = new Date();
    if (trendMode === 'day') {
      const days = eachDayOfInterval({ start: subMonths(now, 1), end: now });
      return days.map((d) => {
        const key = format(d, 'yyyy-MM-dd');
        const hit = bookingRows.filter((r) => format(r.dateObj, 'yyyy-MM-dd') === key);
        return { label: format(d, 'MMM d'), bookings: hit.length };
      });
    }
    if (trendMode === 'week') {
      const weeks = eachWeekOfInterval({ start: subMonths(now, 3), end: now });
      return weeks.map((w) => {
        const ws = startOfWeek(w);
        const we = endOfWeek(w);
        const hit = bookingRows.filter((r) => r.dateObj >= ws && r.dateObj <= we);
        return { label: `${format(ws, 'MMM d')}`, bookings: hit.length };
      });
    }
    if (trendMode === 'year') {
      return yearlyData.map((y) => ({ label: y.year, bookings: y.bookings }));
    }
    if (trendMode === 'custom' && customStart && customEnd) {
      const s = new Date(`${customStart}T00:00:00`);
      const e = new Date(`${customEnd}T23:59:59`);
      const days = eachDayOfInterval({ start: s, end: e });
      return days.map((d) => {
        const key = format(d, 'yyyy-MM-dd');
        const hit = bookingRows.filter((r) => format(r.dateObj, 'yyyy-MM-dd') === key);
        return { label: format(d, 'MMM d'), bookings: hit.length };
      });
    }
    return monthlyData.map((m) => ({ label: m.month, bookings: m.bookings }));
  }, [trendMode, bookingRows, monthlyData, yearlyData, customStart, customEnd]);

  const handleExport = () => {
    const paymentRows = rows.map((r) => ({
      'Booking ID': r.bookingId,
      'Booking Date': r.bookingDate,
      'Full Name': r.fullName,
      'Group Size': r.groupSize,
      'Booking Status': r.status,
      'Payment Status': r.paymentStatus,
      'Payment Method': r.paymentMethod,
      'Amount Paid (₱)': r.amountPaid,
      'Total Due (₱)': r.totalFee,
      'Outstanding (₱)': Math.max(0, r.totalFee - r.amountPaid),
      'Transaction ID': r.transactionId,
      'Created At': r.createdAt,
    }));

    const monthlyExport = monthlyData.map((m) => ({
      'Month': m.month,
      'Bookings': m.bookings,
      'Collected (₱)': m.collected,
      'Total Due (₱)': m.due,
    }));

    const yearlyExport = yearlyData.map((y) => ({
      'Year': y.year,
      'Bookings': y.bookings,
      'Collected (₱)': y.collected,
      'Total Due (₱)': y.due,
    }));

    const logExport = logs.map((l) => ({
      'Timestamp': l.created_at,
      'Action': l.action,
      'Entity Type': l.entity_type,
      'Entity ID': l.entity_id || '',
      'Actor': l.actor_id || 'System',
      'After State': l.after_state ? JSON.stringify(l.after_state) : '',
    }));

    const paymentStatusRows = Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        const k = r.paymentStatus || 'unpaid';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    ).map(([status, count]) => ({ 'Payment Status': status, 'Booking Count': count }));

    const paymentMethodRows = Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        const k = r.paymentMethod || 'unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    ).map(([method, count]) => ({ 'Payment Method': method, 'Booking Count': count }));

    const summaryRows = [
      { Metric: 'Generated At', Value: new Date().toLocaleString('en-PH') },
      { Metric: 'Total Bookings', Value: rows.length },
      { Metric: 'Total Collected', Value: summary.totalCollected },
      { Metric: 'Total Due', Value: summary.totalDue },
      { Metric: 'Outstanding', Value: summary.outstanding },
      { Metric: 'Trend View', Value: trendMode },
      { Metric: 'Trend From', Value: customStart || '' },
      { Metric: 'Trend To', Value: customEnd || '' },
    ];

    const bookingTrendExport = trendData.map((t) => ({
      'Label': t.label,
      'Total Bookings': t.bookings,
      'View': trendMode,
      'From': customStart || '',
      'To': customEnd || '',
    }));

    exportToExcelMultiSheet([
      { name: 'Summary', rows: summaryRows },
      { name: 'All Payments', rows: paymentRows },
      { name: 'Booking Trends', rows: bookingTrendExport },
      { name: 'By Payment Status', rows: paymentStatusRows },
      { name: 'By Payment Method', rows: paymentMethodRows },
      { name: 'Monthly Summary', rows: monthlyExport },
      { name: 'Yearly Summary', rows: yearlyExport },
      { name: 'Activity Log', rows: logExport },
    ], `mt-kalisungan-payments-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const payStatusColors: Record<string, string> = {
    paid: 'bg-primary/20 text-primary',
    partial: 'bg-sky-500/20 text-sky-600 dark:text-sky-400',
    unpaid: 'bg-warning/20 text-warning',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Payment Summary & Reports</h2>
          <p className="text-sm text-muted-foreground">
            Revenue tracking per day, month, and year — with tamper-proof activity logs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { void load(); void loadLogs(); }} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
          <Button size="sm" onClick={handleExport} disabled={!rows.length} className="gap-1.5">
            <FileDown className="h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Collected', value: formatPeso(summary.totalCollected), icon: CreditCard, color: 'text-primary' },
          { label: 'Total Outstanding', value: formatPeso(summary.outstanding), icon: AlertTriangle, color: 'text-warning' },
          { label: 'Fully Paid', value: summary.paidCount, icon: CheckCircle2, color: 'text-emerald-500' },
          { label: 'Partial', value: summary.partialCount, icon: TrendingUp, color: 'text-sky-500' },
          { label: 'Unpaid', value: summary.unpaidCount, icon: AlertTriangle, color: 'text-warning' },
          { label: 'Total Bookings', value: rows.length, icon: Calendar, color: 'text-purple-500' },
        ].map((s) => (
          <Card key={s.label} className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold mt-1 tabular-nums">{s.value}</p>
                </div>
                <s.icon className={`h-6 w-6 opacity-60 ${s.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="monthly" className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-2 custom-scrollbar">
          <TabsList className="glass-card min-w-max gap-1 p-1">
            <TabsTrigger value="monthly" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Calendar className="h-3.5 w-3.5" /> Monthly
            </TabsTrigger>
            <TabsTrigger value="yearly" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <TrendingUp className="h-3.5 w-3.5" /> Yearly
            </TabsTrigger>
            <TabsTrigger value="details" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <CreditCard className="h-3.5 w-3.5" /> All Records
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <History className="h-3.5 w-3.5" /> Activity Log
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Monthly */}
        <TabsContent value="monthly" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Booking Overview + Exportable Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  ['day', 'Per Day'],
                  ['week', 'Per Week'],
                  ['month', 'Per Month'],
                  ['year', 'Per Year'],
                  ['custom', 'Custom'],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={trendMode === value ? 'default' : 'outline'}
                    onClick={() => setTrendMode(value as typeof trendMode)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {trendMode === 'custom' && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <input className="h-10 rounded-md border border-input bg-background px-3 text-sm" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                  <input className="h-10 rounded-md border border-input bg-background px-3 text-sm" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </div>
              )}
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(155 15% 18%)" />
                  <XAxis dataKey="label" fontSize={11} stroke="hsl(150 10% 55%)" />
                  <YAxis fontSize={11} stroke="hsl(150 10% 55%)" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="bookings" name="Total Bookings" fill="hsl(220 90% 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Monthly Collections (Last 12 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(155 15% 18%)" />
                  <XAxis dataKey="month" fontSize={11} stroke="hsl(150 10% 55%)" />
                  <YAxis fontSize={11} stroke="hsl(150 10% 55%)" tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                    formatter={(v: number) => formatPeso(v)}
                  />
                  <Bar dataKey="collected" name="Collected" fill="hsl(152 60% 42%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="due" name="Total Due" fill="hsl(152 30% 60%)" radius={[4, 4, 0, 0]} opacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly table */}
          <Card className="glass-card">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 text-muted-foreground">
                      <th className="text-left py-3 px-4">Month</th>
                      <th className="text-right py-3 px-4">Bookings</th>
                      <th className="text-right py-3 px-4">Collected</th>
                      <th className="text-right py-3 px-4">Total Due</th>
                      <th className="text-right py-3 px-4">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...monthlyData].reverse().map((m) => (
                      <tr key={m.month} className="border-b border-border/10 hover:bg-secondary/10">
                        <td className="py-2.5 px-4 font-medium">{m.month}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{m.bookings}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-primary tabular-nums">{formatPeso(m.collected)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{formatPeso(m.due)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-warning">{formatPeso(Math.max(0, m.due - m.collected))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/40 font-bold bg-secondary/20">
                      <td className="py-3 px-4">Total</td>
                      <td className="py-3 px-4 text-right tabular-nums">{rows.length}</td>
                      <td className="py-3 px-4 text-right text-primary tabular-nums">{formatPeso(summary.totalCollected)}</td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatPeso(summary.totalDue)}</td>
                      <td className="py-3 px-4 text-right text-warning tabular-nums">{formatPeso(summary.outstanding)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Yearly */}
        <TabsContent value="yearly" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Yearly Collections</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(155 15% 18%)" />
                  <XAxis dataKey="year" fontSize={12} stroke="hsl(150 10% 55%)" />
                  <YAxis fontSize={11} stroke="hsl(150 10% 55%)" tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                    formatter={(v: number) => formatPeso(v)}
                  />
                  <Line dataKey="collected" name="Collected" stroke="hsl(152 60% 42%)" strokeWidth={2} dot={{ fill: 'hsl(152 60% 42%)', r: 4 }} />
                  <Line dataKey="due" name="Total Due" stroke="hsl(150 30% 60%)" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Records */}
        <TabsContent value="details">
          <Card className="glass-card">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
                    <tr className="border-b border-border/30 text-muted-foreground">
                      <th className="text-left py-3 px-4">Name</th>
                      <th className="text-left py-3 px-4">Date</th>
                      <th className="text-left py-3 px-4">Status</th>
                      <th className="text-right py-3 px-4">Paid</th>
                      <th className="text-right py-3 px-4">Due</th>
                      <th className="text-left py-3 px-4">Method</th>
                      <th className="text-left py-3 px-4">Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.bookingId} className="border-b border-border/10 hover:bg-secondary/10">
                        <td className="py-2 px-4 font-medium max-w-[140px] truncate">{r.fullName}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.bookingDate}</td>
                        <td className="py-2 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${payStatusColors[r.paymentStatus] || ''}`}>
                            {r.paymentStatus.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-right font-semibold tabular-nums">{formatPeso(r.amountPaid)}</td>
                        <td className="py-2 px-4 text-right tabular-nums">{formatPeso(r.totalFee)}</td>
                        <td className="py-2 px-4 text-muted-foreground">{r.paymentMethod}</td>
                        <td className="py-2 px-4 font-mono text-xs text-muted-foreground">{r.transactionId || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Log */}
        <TabsContent value="logs">
          <Card className="glass-card border-border/30">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Tamper-Proof Activity Log
                </CardTitle>
                <Badge variant="outline" className="text-xs">Append-only</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                All payment and booking actions are recorded here. Records cannot be edited or deleted.
              </p>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <History className="h-10 w-10 opacity-20 mx-auto mb-2" />
                  <p className="text-sm">No activity logs yet.</p>
                  <p className="text-xs mt-1">
                    Run the SQL schema in <code className="bg-secondary px-1 rounded">src/lib/activity-log.ts</code> to enable logging.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {logs.map((log, i) => (
                    <div key={log.id || i} className="flex gap-3 p-3 rounded-xl border border-border/20 bg-secondary/10 text-xs">
                      <div className="w-1 rounded-full bg-primary/40 shrink-0" />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground capitalize">{log.action?.replace(/_/g, ' ')}</span>
                          <span className="text-muted-foreground">{log.entity_type}</span>
                          {log.entity_id && (
                            <code className="bg-secondary px-1.5 py-0.5 rounded text-[10px] font-mono truncate max-w-[120px]">
                              {log.entity_id.slice(0, 8)}…
                            </code>
                          )}
                        </div>
                        {log.after_state && (
                          <p className="text-muted-foreground truncate">
                            {JSON.stringify(log.after_state).slice(0, 120)}
                          </p>
                        )}
                        <p className="text-muted-foreground/60">
                          {log.created_at ? new Date(log.created_at).toLocaleString('en-PH') : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

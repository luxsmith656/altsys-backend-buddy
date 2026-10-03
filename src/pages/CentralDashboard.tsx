import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/integrations/supabase/client';
import { parseMeta } from '@/lib/bookingMeta';
import { getRecordedRevenue, formatPeso } from '@/lib/payments';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  MapPin,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CalendarCheck,
  Search,
  Megaphone,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import LocationSwitcher from '@/components/layout/LocationSwitcher';
import CentralAccountManagement from '@/components/admin/CentralAccountManagement';
import CentralPricingManagement from '@/components/admin/CentralPricingManagement';
import CentralAnnouncements from '@/components/admin/CentralAnnouncements';
import { format, startOfMonth } from 'date-fns';

interface LocStats {
  id: string;
  name: string;
  lgu: string;
  bookingsTotal: number;
  bookingsMonth: number;
  bookingsToday: number;
  totalHikers: number;
  activeHikers: number;
  revenue: number;
  monthRevenue: number;
}

interface BookingRecord {
  id: string;
  location_id: string;
  booking_date: string;
  status: string;
  group_size: number;
  notes?: string;
  created_at: string;
}

export default function CentralDashboard() {
  const { locations, activeLocationId, setActiveLocationId } = useLocations();

  // Strict jump-off stations only (Lamot 2, Lamot 1, Sto. Tomas) — exclude generic Mt. Kalisungan
  const jumpOffStations = useMemo(() => {
    return locations
      .filter((loc) => !loc.name.toLowerCase().includes('mount kalisungan') && loc.slug !== 'mt-kalisungan')
      .sort((a, b) => {
        const aText = `${a.slug} ${a.name}`.toLowerCase();
        const bText = `${b.slug} ${b.name}`.toLowerCase();
        const score = (t: string) => (t.includes('lamot') && t.includes('2') ? 1 : t.includes('lamot') && t.includes('1') ? 2 : 3);
        return score(aText) - score(bText);
      });
  }, [locations]);

  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<LocStats[]>([]);
  const [recentBookings, setRecentBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Booking ledger search & status filter
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'all' | 'confirmed' | 'active' | 'completed' | 'cancelled'>('all');

  const loadStats = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');

    try {
      const { data: bookings, error: bookingError } = await supabase
        .from('bookings')
        .select('id,location_id,booking_date,notes,status,created_at,group_size')
        .order('created_at', { ascending: false });
      if (bookingError) throw bookingError;

      const { data: sessions, error: sessionError } = await supabase
        .from('hiker_sessions')
        .select('id,location_id,booking_id,status,participant_role')
        .eq('status', 'active');
      if (sessionError) throw sessionError;

      const bookingList = (bookings ?? []) as BookingRecord[];
      setRecentBookings(bookingList);

      const bookingLocMap = new Map(bookingList.map((b) => [b.id, b.location_id]));

      // Only calculate stats for the real 3 jump-off stations
      const grouped: LocStats[] = jumpOffStations.map((loc) => {
        const locBookings = bookingList.filter((b) => b.location_id === loc.id);
        const validBookings = locBookings.filter((b) => b.status !== 'cancelled');
        const monthBookings = validBookings.filter((b) => b.booking_date >= monthStart);
        const todayBookings = validBookings.filter((b) => b.booking_date === today);

        const revenue = validBookings.reduce((sum, b) => sum + getRecordedRevenue(parseMeta(b.notes)), 0);
        const monthRevenue = monthBookings.reduce((sum, b) => sum + getRecordedRevenue(parseMeta(b.notes)), 0);
        const totalHikers = validBookings.reduce((sum, b) => sum + (Number(b.group_size) || 1), 0);

        const active = (sessions ?? []).filter((s) => {
          const locId = s.location_id || bookingLocMap.get(s.booking_id);
          return locId === loc.id && s.participant_role !== 'guide';
        }).length;

        return {
          id: loc.id,
          name: loc.name,
          lgu: loc.lgu,
          bookingsTotal: validBookings.length,
          bookingsMonth: monthBookings.length,
          bookingsToday: todayBookings.length,
          totalHikers,
          revenue,
          monthRevenue,
          activeHikers: active,
        };
      });

      setStats(grouped);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Could not load booking and session totals. Please retry.');
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, [jumpOffStations]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Displayed KPIs scoped by activeLocationId
  const activeStats = useMemo(() => {
    if (!activeLocationId) {
      return stats.reduce(
        (acc, s) => ({
          bookingsTotal: acc.bookingsTotal + s.bookingsTotal,
          bookingsMonth: acc.bookingsMonth + s.bookingsMonth,
          bookingsToday: acc.bookingsToday + s.bookingsToday,
          totalHikers: acc.totalHikers + s.totalHikers,
          revenue: acc.revenue + s.revenue,
          activeHikers: acc.activeHikers + s.activeHikers,
        }),
        { bookingsTotal: 0, bookingsMonth: 0, bookingsToday: 0, totalHikers: 0, revenue: 0, activeHikers: 0 }
      );
    }
    const found = stats.find((s) => s.id === activeLocationId);
    return (
      found || {
        bookingsTotal: 0,
        bookingsMonth: 0,
        bookingsToday: 0,
        totalHikers: 0,
        revenue: 0,
        activeHikers: 0,
      }
    );
  }, [stats, activeLocationId]);

  const activeLocationName = useMemo(() => {
    if (!activeLocationId) return 'All Trailheads';
    const loc = jumpOffStations.find((l) => l.id === activeLocationId);
    return loc ? loc.name : 'Selected Trailhead';
  }, [jumpOffStations, activeLocationId]);

  const getLocationName = (locId: string) => {
    const loc = jumpOffStations.find((l) => l.id === locId);
    return loc ? loc.name : 'Station';
  };

  // Filtered bookings for the audit table
  const filteredBookings = useMemo(() => {
    return recentBookings.filter((b) => {
      if (activeLocationId && b.location_id !== activeLocationId) return false;
      if (ledgerStatusFilter !== 'all' && b.status !== ledgerStatusFilter) return false;
      if (ledgerSearch.trim()) {
        const q = ledgerSearch.toLowerCase();
        const meta = parseMeta(b.notes);
        const name = (meta.fullName || '').toLowerCase();
        const loc = getLocationName(b.location_id).toLowerCase();
        if (!name.includes(q) && !b.id.toLowerCase().includes(q) && !loc.includes(q) && !b.booking_date.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [recentBookings, activeLocationId, ledgerStatusFilter, ledgerSearch]);

  return (
    <div className="min-h-screen px-4 pb-16 pt-20 lg:px-8 bg-gradient-to-b from-background via-background/95 to-secondary/10">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Executive Command Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border/30">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary border-primary/20">
                  Municipal Command
                </Badge>
                <span className="text-xs text-muted-foreground">Laguna Tourism &amp; DRRM Oversight</span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">
                Central <span className="text-gradient">Operations Console</span>
              </h1>
              <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
                Unified multi-trailhead oversight, municipal tourism regulation, and cross-station directory.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <LocationSwitcher allowAll />
              <Button
                variant="outline"
                size="sm"
                onClick={loadStats}
                disabled={loading}
                className="gap-1.5 text-xs h-9 font-semibold"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Syncing...' : 'Refresh'}
              </Button>
            </div>
          </div>

          {loadError && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}
        </motion.div>

        {/* Hero KPIs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: activeLocationId ? `Total Bookings (${activeLocationName})` : 'Total Bookings (All Stations)',
              value: activeStats.bookingsTotal,
              subtext: `${activeStats.totalHikers.toLocaleString()} registered hikers`,
              icon: Users,
              color: 'text-primary',
              bgGlow: 'from-primary/10 to-transparent',
            },
            {
              label: 'Scheduled This Month',
              value: activeStats.bookingsMonth,
              subtext: `${activeStats.bookingsToday} ascents scheduled today`,
              icon: TrendingUp,
              color: 'text-sky-500',
              bgGlow: 'from-sky-500/10 to-transparent',
            },
            {
              label: 'Recorded Tourism Revenue',
              value: `₱${activeStats.revenue.toLocaleString()}`,
              subtext: 'Collected municipal & guide receipts',
              icon: DollarSign,
              color: 'text-emerald-500',
              bgGlow: 'from-emerald-500/10 to-transparent',
            },
            {
              label: 'Active Hikers On-Trail',
              value: activeStats.activeHikers,
              subtext: 'Live checked-in GPS telemetry',
              icon: MapPin,
              color: 'text-orange-500',
              bgGlow: 'from-orange-500/10 to-transparent',
            },
          ].map((kpi, idx) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="glass-card relative overflow-hidden border-border/30 hover:border-primary/40 transition-all">
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${kpi.bgGlow} pointer-events-none rounded-full blur-2xl -mr-10 -mt-10`} />
                <CardContent className="p-4 flex items-center gap-3.5 relative">
                  <div className={`h-11 w-11 rounded-2xl bg-secondary/40 border border-border/30 grid place-items-center shrink-0 ${kpi.color}`}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground truncate">{kpi.label}</p>
                    <p className="text-xl lg:text-2xl font-extrabold tracking-tight mt-0.5">
                      {loading ? '...' : kpi.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">{kpi.subtext}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* ──────────────── TABS LAYOUT: SIDEBAR NAVIGATION LIKE STATION OVERVIEW ──────────────── */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex w-full flex-col gap-6 md:flex-row"
        >
          {/* Sidebar Nav */}
          <div className="w-full md:w-64 shrink-0 md:sticky md:top-24 h-max">
            <TabsList className="glass-card flex flex-row md:flex-col p-2 gap-1.5 h-auto w-full items-stretch justify-start overflow-x-auto md:overflow-visible border border-border/30">
              <TabsTrigger
                value="overview"
                className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap rounded-xl text-xs font-semibold text-left transition-all"
              >
                <Building2 className="h-4 w-4 shrink-0" />
                <div className="text-left hidden sm:block">
                  <div className="font-bold">Station Overview</div>
                  <div className="text-[10px] text-muted-foreground font-normal">Ledger &amp; trailheads</div>
                </div>
                <span className="sm:hidden">Overview</span>
              </TabsTrigger>

              <TabsTrigger
                value="accounts"
                className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap rounded-xl text-xs font-semibold text-left transition-all"
              >
                <Users className="h-4 w-4 shrink-0" />
                <div className="text-left hidden sm:block">
                  <div className="font-bold">Account Management</div>
                  <div className="text-[10px] text-muted-foreground font-normal">Admins, guides &amp; hikers</div>
                </div>
                <span className="sm:hidden">Accounts</span>
              </TabsTrigger>

              <TabsTrigger
                value="pricing"
                className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap rounded-xl text-xs font-semibold text-left transition-all"
              >
                <DollarSign className="h-4 w-4 shrink-0" />
                <div className="text-left hidden sm:block">
                  <div className="font-bold">Fare &amp; Capacity</div>
                  <div className="text-[10px] text-muted-foreground font-normal">Fees &amp; daily quotas</div>
                </div>
                <span className="sm:hidden">Fare &amp; Capacity</span>
              </TabsTrigger>

              <TabsTrigger
                value="announcements"
                className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap rounded-xl text-xs font-semibold text-left transition-all"
              >
                <Megaphone className="h-4 w-4 shrink-0" />
                <div className="text-left hidden sm:block">
                  <div className="font-bold">Announcements</div>
                  <div className="text-[10px] text-muted-foreground font-normal">Broadcast advisories</div>
                </div>
                <span className="sm:hidden">Broadcasts</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {/* ──────────────── TAB 1: STATION OVERVIEW & LEDGER ──────────────── */}
            <TabsContent value="overview" className="space-y-6 mt-0">
              {/* Trailhead Station Cards Grid */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-primary" /> Official Jump-Off Stations (Mt. Kalisungan)
                  </h3>
                  <span className="text-xs text-muted-foreground">3 Official Active Stations</span>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  {stats
                    .filter((s) => !activeLocationId || s.id === activeLocationId)
                    .map((s) => {
                      const isSelected = activeLocationId === s.id;
                      return (
                        <Card
                          key={s.id}
                          className={`glass-card transition-all flex flex-col justify-between ${
                            isSelected ? 'ring-2 ring-primary border-primary/50' : 'hover:border-border/60'
                          }`}
                        >
                          <CardHeader className="pb-3 border-b border-border/20">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <CardTitle className="text-base font-bold flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-primary" /> {s.name}
                                </CardTitle>
                                <CardDescription className="text-xs mt-0.5">
                                  Brgy. {s.name.replace(' Trailhead', '')}, Calauan, Laguna
                                </CardDescription>
                              </div>
                              {isSelected ? (
                                <Badge className="text-[10px] bg-primary text-primary-foreground">
                                  Active Filter
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                  Operational
                                </Badge>
                              )}
                            </div>
                          </CardHeader>

                          <CardContent className="py-3 text-xs space-y-2">
                            <Row label="Total Bookings (All Time)" value={s.bookingsTotal} />
                            <Row label="Current Month Ascents" value={s.bookingsMonth} />
                            <Row label="Scheduled Today" value={s.bookingsToday} />
                            <Row label="Total hikers (pax)" value={s.totalHikers} />
                            <Row label="Recorded Tourism Revenue" value={`₱${s.revenue.toLocaleString()}`} />
                            <Row label="Active Hikers on Trail Now" value={
                              <span className="font-bold text-orange-500">{s.activeHikers}</span>
                            } />
                          </CardContent>

                          <div className="p-3 pt-0 border-t border-border/20 mt-1 flex items-center justify-between bg-secondary/10 rounded-b-xl">
                            <button
                              type="button"
                              onClick={() => setActiveLocationId(isSelected ? null : s.id)}
                              className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                            >
                              {isSelected ? 'Overview All' : 'Select Station'}
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        </Card>
                      );
                    })}
                </div>
              </div>

              {/* Actual Bookings Audit Ledger */}
              <Card className="glass-card overflow-hidden border-border/30">
                <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <CalendarCheck className="h-4 w-4 text-primary" />
                        Actual Bookings Record — {activeLocationName}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Showing records for {activeLocationName} ({filteredBookings.length} bookings)
                      </CardDescription>
                    </div>

                    {/* Search and Status filter controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search hiker, ID, date..."
                          value={ledgerSearch}
                          onChange={(e) => setLedgerSearch(e.target.value)}
                          className="pl-8 text-xs h-8 w-44 lg:w-56"
                        />
                      </div>

                      <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border/30">
                        {(['all', 'confirmed', 'active', 'completed', 'cancelled'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setLedgerStatusFilter(st)}
                            className={`px-2 py-1 text-[11px] font-semibold rounded-md capitalize transition-all ${
                              ledgerStatusFilter === st
                                ? st === 'completed'
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-secondary/30 text-muted-foreground border-b border-border/20 font-semibold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Station</th>
                          <th className="px-4 py-3">Hiker Lead</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Group Size</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Revenue</th>
                          <th className="px-4 py-3">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/10">
                        {filteredBookings.map((b) => {
                          const meta = parseMeta(b.notes);
                          const fee = getRecordedRevenue(meta);
                          const isCompleted = b.status === 'completed';
                          const isConfirmed = b.status === 'confirmed';

                          return (
                            <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 font-semibold flex items-center gap-1.5">
                                <MapPin className="h-3 w-3 text-primary shrink-0" />
                                <span className="truncate max-w-[130px]">{getLocationName(b.location_id)}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-foreground truncate max-w-[150px]">
                                  {meta.fullName || 'Lead Hiker'}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                  {meta.phoneNumber || b.id.slice(0, 8)}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-muted-foreground">{b.booking_date}</td>
                              <td className="px-4 py-3 font-bold">{b.group_size || 1} pax</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                    isCompleted
                                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                                      : isConfirmed
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                      : b.status === 'active'
                                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30'
                                      : b.status === 'cancelled'
                                      ? 'bg-destructive/15 text-destructive border-destructive/30'
                                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                  }`}
                                >
                                  {b.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                                {fee > 0 ? formatPeso(fee) : '—'}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-[11px]">
                                {b.created_at ? format(new Date(b.created_at), 'MMM d, yyyy') : '—'}
                              </td>
                            </tr>
                          );
                        })}

                        {filteredBookings.length === 0 && !loading && (
                          <tr>
                            <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                              No matching booking records found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ──────────────── TAB 2: UNIFIED ACCOUNT MANAGEMENT (ROSTER LIST) ──────────────── */}
            <TabsContent value="accounts" className="mt-0">
              <CentralAccountManagement />
            </TabsContent>

            {/* ──────────────── TAB 3: FARE & CAPACITY CONTROL ──────────────── */}
            <TabsContent value="pricing" className="mt-0">
              <CentralPricingManagement />
            </TabsContent>

            {/* ──────────────── TAB 4: ANNOUNCEMENTS ──────────────── */}
            <TabsContent value="announcements" className="mt-0">
              <CentralAnnouncements />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/20 last:border-0 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

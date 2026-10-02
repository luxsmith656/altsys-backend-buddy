import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/integrations/supabase/client';
import { parseMeta } from '@/lib/bookingMeta';
import { getRecordedRevenue, formatPeso } from '@/lib/payments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { Building2, Users, DollarSign, TrendingUp, MapPin, Loader2, AlertTriangle, RefreshCw, Filter, CalendarCheck } from 'lucide-react';
import LocationSwitcher from '@/components/layout/LocationSwitcher';
import RealtimeMonitorMap from '@/components/admin/RealtimeMonitorMap';
import CentralAdminManagement from '@/components/admin/CentralAdminManagement';
import CentralPricingManagement from '@/components/admin/CentralPricingManagement';
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
  const [stats, setStats] = useState<LocStats[]>([]);
  const [recentBookings, setRecentBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

      const grouped: LocStats[] = locations.map((loc) => {
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
  }, [locations]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Compute displayed KPIs based on activeLocationId filter
  const activeStats = useMemo(() => {
    if (!activeLocationId) {
      // Aggregated across all trailheads
      return stats.reduce(
        (acc, s) => ({
          bookingsTotal: acc.bookingsTotal + s.bookingsTotal,
          bookingsMonth: acc.bookingsMonth + s.bookingsMonth,
          bookingsToday: acc.bookingsToday + s.bookingsToday,
          totalHikers: acc.totalHikers + s.totalHikers,
          revenue: acc.revenue + s.revenue,
          activeHikers: acc.activeHikers + s.activeHikers,
        }),
        { bookingsTotal: 0, bookingsMonth: 0, bookingsToday: 0, totalHikers: 0, revenue: 0, activeHikers: 0 },
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
    const loc = locations.find((l) => l.id === activeLocationId);
    return loc ? loc.name : 'Selected Trailhead';
  }, [locations, activeLocationId]);

  // Filter recent bookings list per selected trailhead
  const filteredBookings = useMemo(() => {
    if (!activeLocationId) return recentBookings.slice(0, 15);
    return recentBookings.filter((b) => b.location_id === activeLocationId).slice(0, 15);
  }, [recentBookings, activeLocationId]);

  const getLocationName = (locId: string) => {
    const loc = locations.find((l) => l.id === locId);
    return loc ? loc.name : locId;
  };

  return (
    <div className="min-h-screen px-3 pb-12 pt-20 sm:px-4">
      <div className="container max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">
                Central <span className="text-gradient">LGU Dashboard</span>
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Cross-location oversight of bookings, revenue and live monitoring across all Mt. Kalisungan trailheads.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <LocationSwitcher allowAll />
              <Button variant="outline" size="icon" onClick={loadStats} aria-label="Refresh" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Trailhead Quick Filter Pills */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-secondary/30 border border-border/30 w-fit">
            <button
              type="button"
              onClick={() => setActiveLocationId(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                !activeLocationId
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              All Trailheads
            </button>
            {locations.map((loc) => {
              const isSelected = activeLocationId === loc.id;
              const locStat = stats.find((s) => s.id === loc.id);
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setActiveLocationId(loc.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  }`}
                >
                  <MapPin className="h-3 w-3" />
                  <span>{loc.name}</span>
                  {locStat && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                        isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {locStat.bookingsTotal}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>

        {loadError && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {loadError}
          </div>
        )}

        {/* Filter status header badge */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">
              Scope:{' '}
              <span className="text-foreground font-bold">
                {activeLocationName}
              </span>
            </span>
          </div>
          {activeLocationId && (
            <button
              type="button"
              onClick={() => setActiveLocationId(null)}
              className="text-xs text-primary hover:underline font-medium"
            >
              Reset to All Trailheads
            </button>
          )}
        </div>

        {/* KPIs — Filtered by active trailhead */}
        <div className="mb-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-4 md:gap-4">
          {[
            {
              label: activeLocationId ? `Total Bookings (${activeLocationName})` : 'Total Bookings (All)',
              value: activeStats.bookingsTotal,
              subtext: `${activeStats.totalHikers} registered hikers`,
              icon: Users,
              color: 'text-primary',
            },
            {
              label: 'Bookings This Month',
              value: activeStats.bookingsMonth,
              subtext: `${activeStats.bookingsToday} scheduled today`,
              icon: TrendingUp,
              color: 'text-sky-500',
            },
            {
              label: 'Recorded Revenue',
              value: `₱${activeStats.revenue.toLocaleString()}`,
              subtext: 'Actual collected payments',
              icon: DollarSign,
              color: 'text-emerald-500',
            },
            {
              label: 'Active Hikers Now',
              value: activeStats.activeHikers,
              subtext: 'Currently checked in on trail',
              icon: MapPin,
              color: 'text-orange-500',
            },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="glass-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <s.icon className={`h-7 w-7 ${s.color} opacity-60 shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                    <p className="break-words text-lg font-bold sm:text-xl">
                      {loading ? 'Loading...' : loadError ? 'Unavailable' : s.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">{s.subtext}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Tabs defaultValue="overview">
          <div className="-mx-1 overflow-x-auto px-1 pb-2 custom-scrollbar">
            <TabsList className="glass-card min-w-max">
              <TabsTrigger value="overview">Overview by location</TabsTrigger>
              <TabsTrigger value="monitor">Live monitor</TabsTrigger>
              <TabsTrigger value="admins">Admin Management</TabsTrigger>
              <TabsTrigger value="pricing">Fare & Pricing Control</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4 space-y-6">
            {/* Trailhead cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats
                .filter((s) => !activeLocationId || s.id === activeLocationId)
                .map((s) => {
                  const isCurrentFilter = activeLocationId === s.id;
                  return (
                    <Card
                      key={s.id}
                      className={`glass-card transition-all ${
                        isCurrentFilter ? 'ring-2 ring-primary border-primary/40' : ''
                      }`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" /> {s.name}
                          </CardTitle>
                          {isCurrentFilter && (
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                              Active Filter
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{s.lgu}</p>
                      </CardHeader>
                      <CardContent className="text-sm space-y-2">
                        <Row label="Total bookings" value={s.bookingsTotal} />
                        <Row label="This month" value={s.bookingsMonth} />
                        <Row label="Scheduled today" value={s.bookingsToday} />
                        <Row label="Total hikers (pax)" value={s.totalHikers} />
                        <Row label="Recorded revenue" value={`₱${s.revenue.toLocaleString()}`} />
                        <Row label="Active hikers on trail" value={s.activeHikers} />
                        {!isCurrentFilter && (
                          <div className="pt-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-full text-xs font-semibold"
                              onClick={() => setActiveLocationId(s.id)}
                            >
                              Filter to {s.name}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              {stats.length === 0 && !loading && (
                <Card className="glass-card md:col-span-3">
                  <CardContent className="p-8 text-center text-muted-foreground text-sm">
                    <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    No locations yet.
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Actual Bookings Breakdown Table */}
            <Card className="glass-card overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold">
                      Actual Bookings Record — {activeLocationName}
                    </CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs font-normal">
                    {filteredBookings.length} bookings shown
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground border-b border-border/20">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Trailhead</th>
                        <th className="px-4 py-2.5 font-semibold">Booking Date</th>
                        <th className="px-4 py-2.5 font-semibold">Group Size</th>
                        <th className="px-4 py-2.5 font-semibold">Status</th>
                        <th className="px-4 py-2.5 font-semibold">Revenue Collected</th>
                        <th className="px-4 py-2.5 font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/10">
                      {filteredBookings.map((b) => {
                        const fee = getRecordedRevenue(parseMeta(b.notes));
                        return (
                          <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5 font-medium flex items-center gap-1.5">
                              <MapPin className="h-3 w-3 text-primary shrink-0" />
                              <span className="truncate max-w-[140px]">{getLocationName(b.location_id)}</span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{b.booking_date}</td>
                            <td className="px-4 py-2.5 font-semibold">{b.group_size || 1} pax</td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  b.status === 'confirmed' || b.status === 'completed'
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                    : b.status === 'active'
                                    ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                                    : b.status === 'cancelled'
                                    ? 'bg-destructive/15 text-destructive'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {b.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-semibold">{fee > 0 ? formatPeso(fee) : '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground text-[11px]">
                              {b.created_at ? format(new Date(b.created_at), 'MMM d, yyyy') : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredBookings.length === 0 && !loading && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                            No bookings recorded for this trailhead yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="monitor" className="mt-4">
            <RealtimeMonitorMap locationId={activeLocationId} canAddCheckpoints={false} />
          </TabsContent>

          <TabsContent value="admins" className="mt-4">
            <CentralAdminManagement />
          </TabsContent>

          <TabsContent value="pricing" className="mt-4">
            <CentralPricingManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/20 last:border-0 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

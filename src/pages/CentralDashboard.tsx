import { useEffect, useState } from 'react';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/integrations/supabase/client';
import { ADMIN_CHECKIN_TOKEN_PREFIX } from '@/lib/tracking/sessionAuthorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
import { Building2, Users, DollarSign, TrendingUp, MapPin, Loader2, AlertTriangle, RefreshCw, UserPlus } from 'lucide-react';
import LocationSwitcher from '@/components/layout/LocationSwitcher';
import RealtimeMonitorMap from '@/components/admin/RealtimeMonitorMap';
import AdminWalkInRegistrationDialog from '@/components/admin/AdminWalkInRegistrationDialog';
import { format, subDays, startOfMonth } from 'date-fns';

interface LocStats {
  id: string;
  name: string;
  lgu: string;
  bookingsTotal: number;
  bookingsMonth: number;
  revenue: number;
  activeHikers: number;
}

export default function CentralDashboard() {
  const { locations, activeLocationId } = useLocations();
  const [stats, setStats] = useState<LocStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id,location_id,booking_date,total_amount,status,created_at');

    const { data: sessions } = await supabase
      .from('hiker_sessions' as any)
      .select('id,location_id,status')
      .eq('status', 'active')
      .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`);

    const grouped: LocStats[] = locations.map((loc) => {
      const locBookings = (bookings ?? []).filter((b: any) => b.location_id === loc.id);
      const monthBookings = locBookings.filter((b: any) => b.booking_date >= monthStart);
      const revenue = locBookings
        .filter((b: any) => b.status !== 'cancelled')
        .reduce((sum: number, b: any) => sum + Number(b.total_amount || 0), 0);
      const active = ((sessions as any[]) ?? []).filter((s) => s.location_id === loc.id).length;
      return {
        id: loc.id,
        name: loc.name,
        lgu: loc.lgu,
        bookingsTotal: locBookings.length,
        bookingsMonth: monthBookings.length,
        revenue,
        activeHikers: active,
      };
    });

    setStats(grouped);
    setLoading(false);
  };

  useEffect(() => { void loadStats(); }, [locations]);

  const totals = stats.reduce(
    (acc, s) => ({
      bookings: acc.bookings + s.bookingsTotal,
      monthBookings: acc.monthBookings + s.bookingsMonth,
      revenue: acc.revenue + s.revenue,
      active: acc.active + s.activeHikers,
    }),
    { bookings: 0, monthBookings: 0, revenue: 0, active: 0 },
  );

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
              <Button
                size="sm"
                onClick={() => setWalkInOpen(true)}
                className="gap-1.5 bg-primary text-primary-foreground text-xs font-semibold shadow-sm"
              >
                <UserPlus className="h-4 w-4" />
                + Register Walk-In
              </Button>
              <LocationSwitcher allowAll />
              <Button variant="outline" size="icon" onClick={loadStats} aria-label="Refresh">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* KPIs */}
        <div className="mb-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-4 md:gap-4">
          {[
            { label: 'Total Bookings', value: totals.bookings, icon: Users, color: 'text-primary' },
            { label: 'Bookings This Month', value: totals.monthBookings, icon: TrendingUp, color: 'text-sky-500' },
            { label: 'Revenue (₱)', value: `₱${totals.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-500' },
            { label: 'Hikers Active Now', value: totals.active, icon: MapPin, color: 'text-orange-500' },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="glass-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <s.icon className={`h-7 w-7 ${s.color} opacity-60`} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="break-words text-lg font-bold sm:text-xl">{s.value}</p>
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
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.map((s) => (
                <Card key={s.id} className="glass-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" /> {s.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{s.lgu}</p>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <Row label="Total bookings" value={s.bookingsTotal} />
                    <Row label="This month" value={s.bookingsMonth} />
                    <Row label="Revenue" value={`₱${s.revenue.toLocaleString()}`} />
                    <Row label="Active hikers" value={s.activeHikers} />
                  </CardContent>
                </Card>
              ))}
              {stats.length === 0 && !loading && (
                <Card className="glass-card md:col-span-3">
                  <CardContent className="p-8 text-center text-muted-foreground text-sm">
                    <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    No locations yet.
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="monitor" className="mt-4">
            <RealtimeMonitorMap locationId={activeLocationId} canAddCheckpoints />
          </TabsContent>
        </Tabs>

        <AdminWalkInRegistrationDialog
          open={walkInOpen}
          onClose={() => setWalkInOpen(false)}
          locationId={activeLocationId}
          onSuccess={() => void loadStats()}
        />
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

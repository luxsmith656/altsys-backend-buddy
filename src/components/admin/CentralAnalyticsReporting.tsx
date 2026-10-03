import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocations } from '@/hooks/useLocations';
import { usePricing } from '@/hooks/usePricing';
import { parseMeta } from '@/lib/bookingMeta';
import { bookingReceipt } from '@/lib/bookingReceipt';
import { formatPeso } from '@/lib/payments';
import { exportToExcelMultiSheet } from '@/lib/excel-export';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Users,
  Compass,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  Search,
  MapPin,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  isWithinInterval,
  parseISO,
  getDay,
} from 'date-fns';
import { toast } from 'sonner';

interface BookingData {
  id: string;
  location_id: string;
  booking_date: string;
  status: string;
  group_size: number;
  notes?: string | null;
  created_at: string;
  emergency_contact_name?: string | null;
}

interface GuideProfile {
  id: string;
  full_name: string;
  phone?: string;
  location_id?: string;
  is_active?: boolean;
  specialty?: string;
  status?: string;
}

interface ProcessedBooking {
  id: string;
  locationId: string;
  locationName: string;
  bookingDate: string;
  status: string;
  groupSize: number;
  hikeType: string;
  fullName: string;
  phone: string;
  assignedGuide: string;
  assignedGuideId: string | null;
  paymentMethod: string;
  paymentStatus: string;
  entryFee: number;
  envFee: number;
  guideFee: number;
  extrasFee: number;
  totalFee: number;
  amountPaid: number;
  createdAt: string;
}

export default function CentralAnalyticsReporting() {
  const { locations, activeLocationId, setActiveLocationId } = useLocations();
  const { pricing } = usePricing();

  // Strict jump-off stations (Lamot 2, Lamot 1, Sto. Tomas)
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

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [guides, setGuides] = useState<GuideProfile[]>([]);
  const [activeSessionsCount, setActiveSessionsCount] = useState(0);

  // Filter state
  const [dateRangeMode, setDateRangeMode] = useState<'all' | 'today' | '7d' | '30d' | 'month' | 'year' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedStation, setSelectedStation] = useState<string>('all');
  const [guideSearch, setGuideSearch] = useState('');

  // Fetch all real database records
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bookingsRes, guidesRes, sessionsRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, location_id, booking_date, status, group_size, notes, created_at, emergency_contact_name')
          .order('booking_date', { ascending: false }),
        supabase
          .from('guides' as any)
          .select('id, full_name, phone, location_id, is_active, specialty, status'),
        supabase
          .from('hiker_sessions')
          .select('id, status')
          .eq('status', 'active'),
      ]);

      if (bookingsRes.error) throw bookingsRes.error;
      setBookings((bookingsRes.data as unknown as BookingData[]) || []);
      setGuides((guidesRes.data as unknown as GuideProfile[]) || []);
      setActiveSessionsCount(sessionsRes.data ? sessionsRes.data.length : 0);
    } catch (err: any) {
      console.error('Error fetching analytics reporting data:', err);
      toast.error('Failed to load operational analytics: ' + (err.message || 'Database error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Synchronize local station selector with Central activeLocationId if set
  useEffect(() => {
    if (activeLocationId) {
      setSelectedStation(activeLocationId);
    } else {
      setSelectedStation('all');
    }
  }, [activeLocationId]);

  const handleStationChange = (val: string) => {
    setSelectedStation(val);
    if (val === 'all') {
      setActiveLocationId(null);
    } else {
      setActiveLocationId(val);
    }
  };

  // Helper to map location ID to name
  const getLocationName = useCallback((locId: string) => {
    const found = jumpOffStations.find((s) => s.id === locId);
    return found ? found.name : 'Jump-Off Station';
  }, [jumpOffStations]);

  // Process raw bookings into financial and operational entities
  const processedBookings: ProcessedBooking[] = useMemo(() => {
    return bookings.map((b) => {
      const meta = parseMeta(b.notes);
      const receipt = bookingReceipt(b);

      const entryLine = receipt.baseLines.find((l) => l.label.toLowerCase().includes('registration'));
      const envLine = receipt.baseLines.find((l) => l.label.toLowerCase().includes('environmental'));
      const guideLine = receipt.baseLines.find((l) => l.label.toLowerCase().includes('guide'));

      const entryFee = entryLine ? entryLine.amount : (pricing.entryFee * (b.group_size || 1));
      const envFee = envLine ? envLine.amount : (pricing.envFee * (b.group_size || 1));
      const guideFee = guideLine ? guideLine.amount : (receipt.base - entryFee - envFee);
      const extrasFee = receipt.extras.reduce((sum, item) => sum + item.amount, 0);

      return {
        id: b.id,
        locationId: b.location_id,
        locationName: getLocationName(b.location_id),
        bookingDate: b.booking_date,
        status: b.status || 'confirmed',
        groupSize: Number(b.group_size) || 1,
        hikeType: meta.hikeType || 'morning',
        fullName: meta.fullName || b.emergency_contact_name || 'Hiker Group',
        phone: meta.phoneNumber || '—',
        assignedGuide: meta.assignedGuide || (meta.assignedGuideId ? 'Assigned Mountain Guide' : 'Unassigned'),
        assignedGuideId: meta.assignedGuideId || null,
        paymentMethod: meta.paymentMethod || 'Onsite / Cash',
        paymentStatus: meta.paymentStatus || (b.status === 'confirmed' || b.status === 'completed' ? 'paid' : 'pending'),
        entryFee,
        envFee,
        guideFee: Math.max(0, guideFee),
        extrasFee,
        totalFee: receipt.total,
        amountPaid: receipt.paid || receipt.total,
        createdAt: b.created_at,
      };
    });
  }, [bookings, getLocationName, pricing]);

  // Determine active date range window
  const dateInterval = useMemo(() => {
    const today = new Date();
    switch (dateRangeMode) {
      case 'today': {
        const todayStr = format(today, 'yyyy-MM-dd');
        return { start: parseISO(todayStr), end: parseISO(todayStr) };
      }
      case '7d': {
        return { start: subDays(today, 7), end: today };
      }
      case '30d': {
        return { start: subDays(today, 30), end: today };
      }
      case 'month': {
        return { start: startOfMonth(today), end: endOfMonth(today) };
      }
      case 'year': {
        return { start: startOfYear(today), end: today };
      }
      case 'custom': {
        return {
          start: customStartDate ? parseISO(customStartDate) : subDays(today, 30),
          end: customEndDate ? parseISO(customEndDate) : today,
        };
      }
      case 'all':
      default:
        return null;
    }
  }, [dateRangeMode, customStartDate, customEndDate]);

  // Filter bookings based on selected station and date interval
  const filteredBookings = useMemo(() => {
    return processedBookings.filter((b) => {
      // Station filter
      if (selectedStation !== 'all' && b.locationId !== selectedStation) {
        return false;
      }

      // Date interval filter
      if (dateInterval) {
        try {
          const bookingD = parseISO(b.bookingDate);
          if (!isWithinInterval(bookingD, dateInterval)) {
            return false;
          }
        } catch {
          return true;
        }
      }

      return true;
    });
  }, [processedBookings, selectedStation, dateInterval]);

  // Aggregate Key Performance Indicators (KPIs)
  const kpis = useMemo(() => {
    const validBookings = filteredBookings.filter((b) => b.status !== 'cancelled');
    const totalBookings = validBookings.length;
    const totalHikers = validBookings.reduce((sum, b) => sum + b.groupSize, 0);

    const totalRevenue = validBookings.reduce((sum, b) => sum + b.amountPaid, 0);
    const totalEnvFee = validBookings.reduce((sum, b) => sum + b.envFee, 0);
    const totalEntryFee = validBookings.reduce((sum, b) => sum + b.entryFee, 0);
    const totalGuideFees = validBookings.reduce((sum, b) => sum + b.guideFee, 0);
    const totalExtras = validBookings.reduce((sum, b) => sum + b.extrasFee, 0);

    const completedCount = validBookings.filter((b) => b.status === 'completed').length;
    const confirmedCount = validBookings.filter((b) => b.status === 'confirmed').length;
    const activeCount = validBookings.filter((b) => b.status === 'active').length;
    const cancelledCount = filteredBookings.filter((b) => b.status === 'cancelled').length;

    const completionRate = totalBookings > 0 ? Math.round((completedCount / totalBookings) * 100) : 0;
    const avgGroupSize = totalBookings > 0 ? (totalHikers / totalBookings).toFixed(1) : '0';

    return {
      totalBookings,
      totalHikers,
      totalRevenue,
      totalEnvFee,
      totalEntryFee,
      totalGuideFees,
      totalExtras,
      completedCount,
      confirmedCount,
      activeCount,
      cancelledCount,
      completionRate,
      avgGroupSize,
    };
  }, [filteredBookings]);

  // Time-series Chart Data (Grouping by Date)
  const timeSeriesData = useMemo(() => {
    const map = new Map<string, { date: string; revenue: number; envFee: number; guideFee: number; hikers: number }>();

    filteredBookings
      .filter((b) => b.status !== 'cancelled')
      .forEach((b) => {
        const key = b.bookingDate;
        if (!map.has(key)) {
          map.set(key, { date: key, revenue: 0, envFee: 0, guideFee: 0, hikers: 0 });
        }
        const item = map.get(key)!;
        item.revenue += b.amountPaid;
        item.envFee += b.envFee;
        item.guideFee += b.guideFee;
        item.hikers += b.groupSize;
      });

    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-20) // Show up to the last 20 recorded days
      .map((d) => ({
        ...d,
        label: format(parseISO(d.date), 'MMM d'),
      }));
  }, [filteredBookings]);

  // Station Comparison Data
  const stationBreakdownData = useMemo(() => {
    return jumpOffStations.map((station) => {
      const stationBookings = filteredBookings.filter((b) => b.locationId === station.id && b.status !== 'cancelled');
      const hikers = stationBookings.reduce((sum, b) => sum + b.groupSize, 0);
      const revenue = stationBookings.reduce((sum, b) => sum + b.amountPaid, 0);
      const guideFees = stationBookings.reduce((sum, b) => sum + b.guideFee, 0);
      const envShare = stationBookings.reduce((sum, b) => sum + b.envFee, 0);

      return {
        id: station.id,
        name: station.name.replace(' Trailhead', ''),
        fullName: station.name,
        lgu: station.lgu,
        bookings: stationBookings.length,
        hikers,
        revenue,
        guideFees,
        envShare,
      };
    });
  }, [filteredBookings, jumpOffStations]);

  // Day-of-week volume distribution (Peak Saturday/Sunday analysis)
  const dayOfWeekData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const revenueByDay = [0, 0, 0, 0, 0, 0, 0];

    filteredBookings
      .filter((b) => b.status !== 'cancelled')
      .forEach((b) => {
        try {
          const d = parseISO(b.bookingDate);
          const dayIndex = getDay(d);
          counts[dayIndex] += b.groupSize;
          revenueByDay[dayIndex] += b.amountPaid;
        } catch {}
      });

    return days.map((day, idx) => ({
      day,
      hikers: counts[idx],
      revenue: revenueByDay[idx],
    }));
  }, [filteredBookings]);

  // Mountain Guides Ledger & Earnings Aggregation
  const mountainGuidesLedger = useMemo(() => {
    const guideMap = new Map<
      string,
      {
        id: string;
        name: string;
        station: string;
        phone: string;
        completedHikes: number;
        totalHikers: number;
        totalEarned: number;
      }
    >();

    // Seed from registered guide profiles
    guides.forEach((g) => {
      guideMap.set(g.id, {
        id: g.id,
        name: g.full_name,
        station: getLocationName(g.location_id || ''),
        phone: g.phone || '—',
        completedHikes: 0,
        totalHikers: 0,
        totalEarned: 0,
      });
    });

    // Populate real stats from bookings
    filteredBookings.forEach((b) => {
      if (b.status === 'cancelled') return;
      if (b.assignedGuideId && guideMap.has(b.assignedGuideId)) {
        const item = guideMap.get(b.assignedGuideId)!;
        item.completedHikes += 1;
        item.totalHikers += b.groupSize;
        item.totalEarned += b.guideFee;
      } else if (b.assignedGuide && b.assignedGuide !== 'Unassigned' && b.assignedGuide !== 'Assigned Mountain Guide') {
        // Fallback matching by name if ID was not attached
        const found = Array.from(guideMap.values()).find((item) => item.name.toLowerCase() === b.assignedGuide.toLowerCase());
        if (found) {
          found.completedHikes += 1;
          found.totalHikers += b.groupSize;
          found.totalEarned += b.guideFee;
        }
      }
    });

    return Array.from(guideMap.values())
      .filter((g) => {
        if (!guideSearch.trim()) return true;
        const q = guideSearch.toLowerCase();
        return g.name.toLowerCase().includes(q) || g.station.toLowerCase().includes(q);
      })
      .sort((a, b) => b.totalEarned - a.totalEarned);
  }, [guides, filteredBookings, getLocationName, guideSearch]);

  // Export to Excel handler
  const handleExportExcel = () => {
    try {
      const activeStationName = selectedStation === 'all' ? 'All Stations' : getLocationName(selectedStation);
      const filename = `Mt_Kalisungan_Central_Analytics_${format(new Date(), 'yyyy-MM-dd')}`;

      // Sheet 1: Executive KPI Summary
      const summaryRows = [
        {
          Metric: 'Report Scope',
          Value: activeStationName,
        },
        {
          Metric: 'Date Interval',
          Value: dateRangeMode.toUpperCase(),
        },
        {
          Metric: 'Total Valid Bookings',
          Value: kpis.totalBookings,
        },
        {
          Metric: 'Total Hikers Accommodated',
          Value: kpis.totalHikers,
        },
        {
          Metric: 'Gross Tourism Revenue (PHP)',
          Value: kpis.totalRevenue,
        },
        {
          Metric: 'LGU Environmental / DSPA Share (PHP)',
          Value: kpis.totalEnvFee,
        },
        {
          Metric: 'Municipal Tourism Entry Share (PHP)',
          Value: kpis.totalEntryFee,
        },
        {
          Metric: 'Mountain Guide Earnings (PHP)',
          Value: kpis.totalGuideFees,
        },
        {
          Metric: 'Porters & Extra Fees (PHP)',
          Value: kpis.totalExtras,
        },
        {
          Metric: 'Permit Completion Rate (%)',
          Value: `${kpis.completionRate}%`,
        },
        {
          Metric: 'Average Group Size (Pax)',
          Value: kpis.avgGroupSize,
        },
      ];

      // Sheet 2: Bookings Audit Ledger
      const bookingRows = filteredBookings.map((b) => ({
        'Booking ID': b.id,
        'Jump-Off Station': b.locationName,
        'Lead Hiker': b.fullName,
        'Contact Phone': b.phone,
        'Hike Date': b.bookingDate,
        'Group Size': b.groupSize,
        'Hike Type': b.hikeType,
        'Assigned Mountain Guide': b.assignedGuide,
        'Registration Fee': b.entryFee,
        'Environmental Fee': b.envFee,
        'Mountain Guide Fee': b.guideFee,
        'Total Collected (PHP)': b.amountPaid,
        'Payment Method': b.paymentMethod,
        'Status': b.status,
      }));

      // Sheet 3: Mountain Guides Ledger
      const guideRows = mountainGuidesLedger.map((g) => ({
        'Mountain Guide': g.name,
        'Home Station': g.station,
        'Contact Phone': g.phone,
        'Total Guided Trips': g.completedHikes,
        'Hikers Accommodated': g.totalHikers,
        'Total Mountain Guide Earnings (PHP)': g.totalEarned,
      }));

      // Sheet 4: Station Breakdown
      const stationRows = stationBreakdownData.map((s) => ({
        'Station Name': s.fullName,
        'LGU Municipality': s.lgu,
        'Bookings Count': s.bookings,
        'Total Hikers': s.hikers,
        'Total Revenue (PHP)': s.revenue,
        'LGU Environmental Share (PHP)': s.envShare,
        'Mountain Guide Fees (PHP)': s.guideFees,
      }));

      exportToExcelMultiSheet(
        [
          { name: 'KPI Summary', rows: summaryRows },
          { name: 'Bookings Audit', rows: bookingRows },
          { name: 'Mountain Guides Ledger', rows: guideRows },
          { name: 'Station Breakdown', rows: stationRows },
        ],
        filename
      );

      toast.success('Executive Analytics & Reporting workbook exported successfully!');
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Failed to generate Excel report: ' + err.message);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* ──────────────── TOP CONTROL BAR: FILTERS, DATE INTERVAL & ACTIONS ──────────────── */}
      <Card className="glass-card border-border/30 overflow-hidden">
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Station Dropdown */}
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <Select value={selectedStation} onValueChange={handleStationChange}>
                <SelectTrigger className="h-8 text-xs w-44 font-semibold bg-background/80">
                  <SelectValue placeholder="All Trailheads" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-semibold">
                    🌐 All Trailheads (Combined)
                  </SelectItem>
                  {jumpOffStations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id} className="text-xs">
                      🏔️ {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timeframe Presets */}
            <div className="flex items-center gap-1 bg-secondary/30 p-0.5 rounded-lg border border-border/20 text-xs">
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: '7d', label: '7 Days' },
                  { id: '30d', label: '30 Days' },
                  { id: 'month', label: 'This Month' },
                  { id: 'year', label: 'Year' },
                  { id: 'all', label: 'All Time' },
                  { id: 'custom', label: 'Custom' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDateRangeMode(preset.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                    dateRangeMode === preset.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Range Inputs */}
            {dateRangeMode === 'custom' && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-8 text-xs w-32 bg-background/80"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-8 text-xs w-32 bg-background/80"
                />
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="gap-1.5 text-xs h-8 font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync Data
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintReport}
              className="gap-1.5 text-xs h-8 font-semibold"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>

            <Button
              size="sm"
              onClick={handleExportExcel}
              className="gap-1.5 text-xs h-8 font-semibold glow-primary"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel (.xlsx)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ──────────────── EXECUTIVE FINANCIAL & OPERATIONAL KPIS ──────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <Card className="glass-card border-border/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full blur-2xl" />
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Gross Tourism Revenue</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-extrabold tracking-tight text-foreground">
                {formatPeso(kpis.totalRevenue)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                From {kpis.totalBookings} booked permit reservations
              </p>
            </div>
            <div className="pt-2 border-t border-border/20 grid grid-cols-2 gap-1 text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px]">LGU DSPA Fund</span>
                <span className="font-bold text-foreground">{formatPeso(kpis.totalEnvFee)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Mountain Guide Fees</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatPeso(kpis.totalGuideFees)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Hikers Accommodated */}
        <Card className="glass-card border-border/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-primary/10 to-transparent rounded-full blur-2xl" />
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Hikers Accommodated</span>
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-extrabold tracking-tight text-foreground">
                {kpis.totalHikers.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">pax</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Avg group size: <strong className="text-foreground">{kpis.avgGroupSize}</strong> hikers
              </p>
            </div>
            <div className="pt-2 border-t border-border/20 grid grid-cols-2 gap-1 text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px]">Completed Trips</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{kpis.completedCount} groups</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Live On-Trail</span>
                <span className="font-bold text-orange-500">{activeSessionsCount} active</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mountain Guide Operations */}
        <Card className="glass-card border-border/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-full blur-2xl" />
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Mountain Guides Deployed</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Compass className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-extrabold tracking-tight text-foreground">
                {formatPeso(kpis.totalGuideFees)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Total paid out to licensed mountain guides
              </p>
            </div>
            <div className="pt-2 border-t border-border/20 grid grid-cols-2 gap-1 text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px]">Guide Roster</span>
                <span className="font-bold text-foreground">{guides.length} mountain guides</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Max Ratio</span>
                <span className="font-bold text-foreground">1 : {pricing.maxPaxPerGuide || 5} pax</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Permit Completion Rate */}
        <Card className="glass-card border-border/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-sky-500/10 to-transparent rounded-full blur-2xl" />
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Permit Fulfillment Rate</span>
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-extrabold tracking-tight text-foreground">
                {kpis.completionRate}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Successful ascent completion ratio
              </p>
            </div>
            <div className="pt-2 border-t border-border/20 grid grid-cols-2 gap-1 text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px]">Confirmed Awaiting</span>
                <span className="font-bold text-foreground">{kpis.confirmedCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Cancellations</span>
                <span className="font-bold text-destructive">{kpis.cancelledCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ──────────────── VISUAL CHARTS SECTION ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Revenue Timeline (Area Chart) */}
        <Card className="glass-card border-border/30 overflow-hidden">
          <CardHeader className="pb-2 border-b border-border/20 bg-secondary/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" /> Revenue &amp; Tariff Trends
                </CardTitle>
                <CardDescription className="text-xs">
                  Real daily collection timeline (Total Revenue vs Mountain Guide Share)
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                Live Data
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-64 w-full">
              {timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorGuide" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#88888820" />
                    <XAxis dataKey="label" stroke="#888888" fontSize={11} tickLine={false} />
                    <YAxis stroke="#888888" fontSize={11} tickLine={false} tickFormatter={(val) => `₱${val}`} />
                    <Tooltip
                      formatter={(val: number) => [formatPeso(val), '']}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Area type="monotone" dataKey="revenue" name="Total Revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" />
                    <Area type="monotone" dataKey="guideFee" name="Mountain Guide Fees" stroke="#f59e0b" fillOpacity={1} fill="url(#colorGuide)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  No revenue records found for this period.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Jump-Off Station Comparison (Bar Chart) */}
        <Card className="glass-card border-border/30 overflow-hidden">
          <CardHeader className="pb-2 border-b border-border/20 bg-secondary/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" /> Hiker Volume by Jump-Off Station
                </CardTitle>
                <CardDescription className="text-xs">
                  Sitio Lamot 2, Sitio Lamot 1, and Brgy. Sto. Tomas traffic
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                3 Trailheads
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stationBreakdownData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#88888820" />
                  <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} />
                  <YAxis stroke="#888888" fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(val: number, name: string) => [
                      name === 'revenue' ? formatPeso(val) : `${val} pax`,
                      name === 'revenue' ? 'Revenue' : 'Hikers',
                    ]}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="hikers" name="Hikers (Pax)" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="bookings" name="Permits" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ──────────────── PEAK SURGE & DAY-OF-WEEK DISTRIBUTION ──────────────── */}
      <Card className="glass-card border-border/30 overflow-hidden">
        <CardHeader className="pb-2 border-b border-border/20 bg-secondary/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-sky-500" /> Day-of-Week Influx &amp; Carrying Capacity
              </CardTitle>
              <CardDescription className="text-xs">
                Identify weekend surges to roster on-duty mountain guides and checkpoint rangers.
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" /> Safe Days
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 ml-2" /> Weekend Surge
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayOfWeekData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#88888820" />
                <XAxis dataKey="day" stroke="#888888" fontSize={11} tickLine={false} />
                <YAxis stroke="#888888" fontSize={11} tickLine={false} />
                <Tooltip
                  formatter={(val: number) => [`${val} hikers`, 'Volume']}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                />
                <Bar dataKey="hikers" name="Hiker Traffic" fill="#0284c7" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ──────────────── MOUNTAIN GUIDES PERFORMANCE & EARNINGS LEDGER ──────────────── */}
      <Card className="glass-card border-border/30 overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Compass className="h-4 w-4 text-primary" />
                Mountain Guides Ledger &amp; Tariff Earnings
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time tracking of licensed mountain guides, guided groups, and guide fees disbursed.
              </CardDescription>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search mountain guide..."
                value={guideSearch}
                onChange={(e) => setGuideSearch(e.target.value)}
                className="pl-8 text-xs h-8 w-56 bg-background/80"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/30 text-muted-foreground border-b border-border/20 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Mountain Guide</th>
                  <th className="px-4 py-3">Home Trailhead Station</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Guided Trips</th>
                  <th className="px-4 py-3">Hikers Guided</th>
                  <th className="px-4 py-3">Total Mountain Guide Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {mountainGuidesLedger.map((guide) => (
                  <tr key={guide.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold flex items-center gap-2">
                      <div className="p-1 rounded-md bg-primary/10 text-primary">
                        <Compass className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-foreground">{guide.name}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{guide.station}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{guide.phone}</td>
                    <td className="px-4 py-3 font-bold">{guide.completedHikes} hikes</td>
                    <td className="px-4 py-3">{guide.totalHikers} pax</td>
                    <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                      {guide.totalEarned > 0 ? formatPeso(guide.totalEarned) : '—'}
                    </td>
                  </tr>
                ))}

                {mountainGuidesLedger.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No mountain guides matching your search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ──────────────── OFFICIAL JUMP-OFF STATIONS REVENUE BREAKDOWN ──────────────── */}
      <Card className="glass-card border-border/30 overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Jump-Off Stations Financial &amp; Carrying Capacity Audit
          </CardTitle>
          <CardDescription className="text-xs">
            Official summary across Sitio Lamot 2, Sitio Lamot 1, and Brgy. Sto. Tomas.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/30 text-muted-foreground border-b border-border/20 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Station Name</th>
                  <th className="px-4 py-3">LGU Jurisdiction</th>
                  <th className="px-4 py-3">Total Bookings</th>
                  <th className="px-4 py-3">Hikers (Pax)</th>
                  <th className="px-4 py-3">LGU Env / DSPA Share</th>
                  <th className="px-4 py-3">Mountain Guide Fees</th>
                  <th className="px-4 py-3">Gross Collections</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {stationBreakdownData.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-primary shrink-0" />
                      <span>{s.fullName}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.lgu}</td>
                    <td className="px-4 py-3 font-mono">{s.bookings}</td>
                    <td className="px-4 py-3 font-bold">{s.hikers} pax</td>
                    <td className="px-4 py-3 font-semibold">{formatPeso(s.envShare)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">{formatPeso(s.guideFees)}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">{formatPeso(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-secondary/40 font-bold border-t border-border/30">
                <tr>
                  <td className="px-4 py-3 text-foreground" colSpan={2}>Grand Total (All Stations)</td>
                  <td className="px-4 py-3">{kpis.totalBookings}</td>
                  <td className="px-4 py-3">{kpis.totalHikers} pax</td>
                  <td className="px-4 py-3">{formatPeso(kpis.totalEnvFee)}</td>
                  <td className="px-4 py-3 text-amber-600 dark:text-amber-400">{formatPeso(kpis.totalGuideFees)}</td>
                  <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">{formatPeso(kpis.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

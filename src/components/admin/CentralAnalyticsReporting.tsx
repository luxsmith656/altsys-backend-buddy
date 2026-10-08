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
  PieChart,
  Pie,
  Cell,
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
  Globe,
  UserCheck,
  HeartPulse,
  User,
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
  leadAge?: string;
  leadSex?: string;
  leadCity?: string;
  leadNationality?: string;
  companionDetails?: Array<{
    name?: string;
    age?: string | number;
    sex?: string;
    city?: string;
    nationality?: string;
  }>;
}

export interface VisitorRecord {
  role: 'Lead Hiker' | 'Companion';
  name: string;
  age: number | null;
  ageBracket: string;
  sex: 'Male' | 'Female' | 'Other / Unspecified';
  city: string;
  nationality: string;
  locationId: string;
  locationName: string;
  bookingDate: string;
}

function getAgeBracket(age: number | null | undefined): string {
  if (age === null || age === undefined || isNaN(age) || age <= 0) return 'Unspecified';
  if (age <= 12) return 'Children (0–12)';
  if (age <= 17) return 'Youth (13–17)';
  if (age <= 25) return 'Young Adults (18–25)';
  if (age <= 35) return 'Adults (26–35)';
  if (age <= 45) return 'Mid Adults (36–45)';
  if (age <= 60) return 'Mature (46–60)';
  return 'Seniors (61+)';
}

function normalizeSex(sex: string | undefined): 'Male' | 'Female' | 'Other / Unspecified' {
  if (!sex) return 'Other / Unspecified';
  const s = sex.toLowerCase().trim();
  if (s === 'male' || s === 'm') return 'Male';
  if (s === 'female' || s === 'f') return 'Female';
  return 'Other / Unspecified';
}

function normalizeCity(city: string | undefined): string {
  if (!city || !city.trim()) return 'Laguna (General)';
  const c = city.trim();
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export default function CentralAnalyticsReporting({ locationIds }: { locationIds?: string[] } = {}) {
  const { locations, activeLocationId, setActiveLocationId } = useLocations();
  const { pricing } = usePricing();
  const scopedLocationIds = useMemo(() => new Set((locationIds ?? []).filter(Boolean)), [locationIds]);
  const isScoped = scopedLocationIds.size > 0;

  // Strict jump-off stations (Lamot 2, Lamot 1, Sto. Tomas)
  const jumpOffStations = useMemo(() => {
    return locations
      .filter((loc) => !loc.name.toLowerCase().includes('mount kalisungan') && loc.slug !== 'mt-kalisungan')
      .filter((loc) => !isScoped || scopedLocationIds.has(loc.id))
      .sort((a, b) => {
        const aText = `${a.slug} ${a.name}`.toLowerCase();
        const bText = `${b.slug} ${b.name}`.toLowerCase();
        const score = (t: string) => (t.includes('lamot') && t.includes('2') ? 1 : t.includes('lamot') && t.includes('1') ? 2 : 3);
        return score(aText) - score(bText);
      });
  }, [locations, isScoped, scopedLocationIds]);

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
  const [visitorSearch, setVisitorSearch] = useState('');

  // Fetch all real database records
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bookingsRes, guidesRes, sessionsRes] = await Promise.all([
        (() => {
          let query = supabase
            .from('bookings')
            .select('id, location_id, booking_date, status, group_size, notes, created_at, emergency_contact_name')
            .order('booking_date', { ascending: false });
          if (isScoped) query = query.in('location_id', [...scopedLocationIds]);
          return query;
        })(),
        (() => {
          let query = supabase
            .from('guides' as any)
            .select('id, full_name, phone, location_id, is_active, specialty, status');
          if (isScoped) query = query.in('location_id', [...scopedLocationIds]);
          return query;
        })(),
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
  }, [isScoped, scopedLocationIds]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Synchronize local station selector with Central activeLocationId if set
  useEffect(() => {
    if (isScoped) {
      setSelectedStation('all');
    } else if (activeLocationId) {
      setSelectedStation(activeLocationId);
    } else {
      setSelectedStation('all');
    }
  }, [activeLocationId, isScoped]);

  const handleStationChange = (val: string) => {
    if (isScoped && val !== 'all' && !scopedLocationIds.has(val)) return;
    setSelectedStation(val);
    if (isScoped) return;
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
        leadAge: meta.age ? String(meta.age) : undefined,
        leadSex: meta.sex,
        leadCity: meta.city,
        leadNationality: meta.nationality,
        companionDetails: meta.companionDetails,
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
        const d = parseISO(b.bookingDate);
        if (Number.isNaN(d.getTime())) return;
        const dayIndex = getDay(d);
        counts[dayIndex] += b.groupSize;
        revenueByDay[dayIndex] += b.amountPaid;
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

  // ──────────────── VISITOR DEMOGRAPHICS & GEOGRAPHIC ORIGINS AGGREGATION ────────────────
  const demographics = useMemo(() => {
    const validBookings = filteredBookings.filter((b) => b.status !== 'cancelled');
    const visitors: VisitorRecord[] = [];

    validBookings.forEach((b) => {
      // 1. Lead Hiker
      const leadAgeNum = b.leadAge ? parseInt(b.leadAge, 10) : null;
      visitors.push({
        role: 'Lead Hiker',
        name: b.fullName,
        age: leadAgeNum && !isNaN(leadAgeNum) && leadAgeNum > 0 ? leadAgeNum : null,
        ageBracket: getAgeBracket(leadAgeNum),
        sex: normalizeSex(b.leadSex),
        city: normalizeCity(b.leadCity),
        nationality: b.leadNationality || 'Philippines',
        locationId: b.locationId,
        locationName: b.locationName,
        bookingDate: b.bookingDate,
      });

      // 2. Companions from manifest
      let companionCount = 0;
      if (Array.isArray(b.companionDetails)) {
        b.companionDetails.forEach((c, idx) => {
          if (!c) return;
          companionCount++;
          const cAge = c.age ? parseInt(String(c.age), 10) : null;
          visitors.push({
            role: 'Companion',
            name: c.name || `Companion ${idx + 1} (${b.fullName}'s group)`,
            age: cAge && !isNaN(cAge) && cAge > 0 ? cAge : null,
            ageBracket: getAgeBracket(cAge),
            sex: normalizeSex(c.sex),
            city: normalizeCity(c.city || b.leadCity),
            nationality: c.nationality || b.leadNationality || 'Philippines',
            locationId: b.locationId,
            locationName: b.locationName,
            bookingDate: b.bookingDate,
          });
        });
      }

      // 3. Fallback for unlisted companions to match groupSize total
      const missingCompanions = Math.max(0, b.groupSize - 1 - companionCount);
      for (let i = 0; i < missingCompanions; i++) {
        visitors.push({
          role: 'Companion',
          name: `Companion ${companionCount + i + 1} (${b.fullName}'s group)`,
          age: null,
          ageBracket: 'Unspecified',
          sex: 'Other / Unspecified',
          city: normalizeCity(b.leadCity),
          nationality: b.leadNationality || 'Philippines',
          locationId: b.locationId,
          locationName: b.locationName,
          bookingDate: b.bookingDate,
        });
      }
    });

    const totalVisitors = visitors.length;
    const validAges = visitors.filter((v) => v.age !== null).map((v) => v.age as number);
    const avgAge = validAges.length > 0 ? Math.round(validAges.reduce((a, b) => a + b, 0) / validAges.length) : null;
    const minAge = validAges.length > 0 ? Math.min(...validAges) : null;
    const maxAge = validAges.length > 0 ? Math.max(...validAges) : null;

    // Counts by sex
    const maleCount = visitors.filter((v) => v.sex === 'Male').length;
    const femaleCount = visitors.filter((v) => v.sex === 'Female').length;
    const otherSexCount = visitors.filter((v) => v.sex === 'Other / Unspecified').length;
    const malePct = totalVisitors > 0 ? Math.round((maleCount / totalVisitors) * 100) : 0;
    const femalePct = totalVisitors > 0 ? Math.round((femaleCount / totalVisitors) * 100) : 0;

    // Age distribution data
    const ageBrackets = [
      'Children (0–12)',
      'Youth (13–17)',
      'Young Adults (18–25)',
      'Adults (26–35)',
      'Mid Adults (36–45)',
      'Mature (46–60)',
      'Seniors (61+)',
      'Unspecified',
    ];
    const ageChartData = ageBrackets.map((bracket) => {
      const count = visitors.filter((v) => v.ageBracket === bracket).length;
      return {
        bracket,
        count,
        pct: totalVisitors > 0 ? Math.round((count / totalVisitors) * 100) : 0,
      };
    });

    // Gender Pie Data
    const sexChartData = [
      { name: 'Male', value: maleCount, color: '#3b82f6' },
      { name: 'Female', value: femaleCount, color: '#ec4899' },
      { name: 'Unspecified', value: otherSexCount, color: '#94a3b8' },
    ].filter((d) => d.value > 0);

    // Top originating feeder cities / provinces
    const cityMap = new Map<string, number>();
    visitors.forEach((v) => {
      cityMap.set(v.city, (cityMap.get(v.city) || 0) + 1);
    });
    const topCitiesData = Array.from(cityMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([city, count]) => ({
        city,
        count,
        pct: totalVisitors > 0 ? Math.round((count / totalVisitors) * 100) : 0,
      }));

    // Station Demographics Breakdown
    const stationDemo = jumpOffStations.map((station) => {
      const stationVisitors = visitors.filter((v) => v.locationId === station.id);
      const stValidAges = stationVisitors.filter((v) => v.age !== null).map((v) => v.age as number);
      const stAvgAge = stValidAges.length > 0 ? Math.round(stValidAges.reduce((a, b) => a + b, 0) / stValidAges.length) : '—';
      const stMale = stationVisitors.filter((v) => v.sex === 'Male').length;
      const stFemale = stationVisitors.filter((v) => v.sex === 'Female').length;
      const stTotal = stationVisitors.length;

      const stCityMap = new Map<string, number>();
      stationVisitors.forEach((v) => stCityMap.set(v.city, (stCityMap.get(v.city) || 0) + 1));
      const stTopCity = Array.from(stCityMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

      return {
        stationId: station.id,
        stationName: station.name,
        total: stTotal,
        avgAge: stAvgAge,
        topCity: stTopCity,
        malePct: stTotal > 0 ? Math.round((stMale / stTotal) * 100) : 0,
        femalePct: stTotal > 0 ? Math.round((stFemale / stTotal) * 100) : 0,
      };
    });

    return {
      visitors,
      totalVisitors,
      avgAge,
      minAge,
      maxAge,
      maleCount,
      femaleCount,
      malePct,
      femalePct,
      ageChartData,
      sexChartData,
      topCitiesData,
      stationDemo,
    };
  }, [filteredBookings, jumpOffStations]);

  // Search-filtered visitor manifest
  const filteredVisitors = useMemo(() => {
    if (!visitorSearch.trim()) return demographics.visitors.slice(0, 30);
    const q = visitorSearch.toLowerCase();
    return demographics.visitors
      .filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.city.toLowerCase().includes(q) ||
          v.locationName.toLowerCase().includes(q) ||
          v.role.toLowerCase().includes(q) ||
          v.nationality.toLowerCase().includes(q) ||
          v.ageBracket.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [demographics.visitors, visitorSearch]);

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
        {
          Metric: 'Average Visitor Age',
          Value: demographics.avgAge ?? 'N/A',
        },
        {
          Metric: 'Gender Balance',
          Value: `${demographics.malePct}% Male / ${demographics.femalePct}% Female`,
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

      // Sheet 5: Visitor Demographics
      const demographicsRows = demographics.visitors.map((v) => ({
        'Role': v.role,
        'Full Name': v.name,
        'Age': v.age !== null ? v.age : 'Unspecified',
        'Age Bracket': v.ageBracket,
        'Sex': v.sex,
        'Originating City / Province': v.city,
        'Nationality': v.nationality,
        'Jump-Off Station': v.locationName,
        'Booking Date': v.bookingDate,
      }));

      exportToExcelMultiSheet(
        [
          { name: 'KPI Summary', rows: summaryRows },
          { name: 'Bookings Audit', rows: bookingRows },
          { name: 'Mountain Guides Ledger', rows: guideRows },
          { name: 'Station Breakdown', rows: stationRows },
          { name: 'Visitor Demographics', rows: demographicsRows },
        ],
        filename
      );

      toast.success('Executive Analytics & Demographics workbook exported successfully!');
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

      {/* ──────────────── VISITOR DEMOGRAPHICS & GEOGRAPHIC ORIGINS ──────────────── */}
      <Card className="glass-card border-border/30 overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Visitor Demographics &amp; Geographic Origins
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time hiker profiling, age brackets, gender ratios, and feeder origins aggregated from verified bookings and companion manifests.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-medium">
                {demographics.totalVisitors} Total Visitors Profiled
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-6">
          {/* Quick Demographics Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-border/40 bg-card/60">
              <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mb-1">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                Average Hiker Age
              </div>
              <div className="text-2xl font-black text-foreground">
                {demographics.avgAge !== null ? `${demographics.avgAge} yrs` : '—'}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {demographics.minAge !== null && demographics.maxAge !== null
                  ? `Observed range: ${demographics.minAge} – ${demographics.maxAge} yrs`
                  : 'Derived from booking manifests'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border/40 bg-card/60">
              <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mb-1">
                <UserCheck className="h-3.5 w-3.5 text-pink-500" />
                Gender Ratio
              </div>
              <div className="text-xl font-bold text-foreground flex items-baseline gap-2">
                <span className="text-blue-500">{demographics.malePct}% M</span>
                <span className="text-muted-foreground text-sm font-normal">/</span>
                <span className="text-pink-500">{demographics.femalePct}% F</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {demographics.maleCount} male, {demographics.femaleCount} female hikers
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border/40 bg-card/60">
              <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mb-1">
                <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                Top Origin Feeder
              </div>
              <div className="text-lg font-bold text-foreground truncate" title={demographics.topCitiesData[0]?.city || 'N/A'}>
                {demographics.topCitiesData[0]?.city || '—'}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {demographics.topCitiesData[0]
                  ? `${demographics.topCitiesData[0].count} hikers (${demographics.topCitiesData[0].pct}% share)`
                  : 'No location metadata yet'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border/40 bg-card/60">
              <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mb-1">
                <Globe className="h-3.5 w-3.5 text-purple-500" />
                Dominant Nationality
              </div>
              <div className="text-lg font-bold text-foreground truncate">
                {demographics.visitors[0]?.nationality || 'Philippines'}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Domestic &amp; eco-tourist visitors
              </p>
            </div>
          </div>

          {/* Charts Row: Age Distribution, Gender Donut & Top Feeder Cities */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Age Bracket Distribution */}
            <div className="lg:col-span-5 p-4 rounded-xl border border-border/40 bg-card/40 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <HeartPulse className="h-3.5 w-3.5 text-primary" />
                  Age Bracket Distribution
                </h4>
                <span className="text-[11px] text-muted-foreground">Volume &amp; Share</span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={demographics.ageChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#88888820" horizontal={false} />
                    <XAxis type="number" stroke="#888888" fontSize={10} tickLine={false} />
                    <YAxis
                      dataKey="bracket"
                      type="category"
                      stroke="#888888"
                      fontSize={10}
                      tickLine={false}
                      width={85}
                      tickFormatter={(val) => val.split(' ')[0]}
                    />
                    <Tooltip
                      formatter={(val: number) => [`${val} hikers`, 'Hiker Count']}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderRadius: '12px',
                        border: '1px solid hsl(var(--border))',
                      }}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border/20 text-[11px]">
                {demographics.ageChartData.slice(0, 4).map((item) => (
                  <div key={item.bracket} className="flex justify-between items-center text-muted-foreground">
                    <span className="truncate">{item.bracket.split(' ')[0]}</span>
                    <span className="font-semibold text-foreground">{item.count} ({item.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Gender Pie Chart */}
            <div className="lg:col-span-3 p-4 rounded-xl border border-border/40 bg-card/40 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-primary" />
                  Gender Demographics
                </h4>
              </div>
              <div className="h-44 w-full flex items-center justify-center">
                {demographics.sexChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={demographics.sexChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={58}
                        paddingAngle={4}
                      >
                        {demographics.sexChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: number) => [`${val} hikers`, 'Count']}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          borderRadius: '12px',
                          border: '1px solid hsl(var(--border))',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-muted-foreground">No demographic gender data recorded</p>
                )}
              </div>
              <div className="space-y-1.5 mt-auto pt-2 border-t border-border/20 text-xs">
                {demographics.sexChartData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Feeder Origins */}
            <div className="lg:col-span-4 p-4 rounded-xl border border-border/40 bg-card/40 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Top Origin Municipalities / Feeder Cities
                </h4>
                <span className="text-[11px] text-muted-foreground">Share</span>
              </div>
              <div className="space-y-2.5 flex-1">
                {demographics.topCitiesData.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-8 text-center">No feeder location records available</p>
                ) : (
                  demographics.topCitiesData.map((c, idx) => (
                    <div key={c.city} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium flex items-center gap-1.5 text-foreground">
                          <span className="text-[10px] w-4 text-muted-foreground font-mono">#{idx + 1}</span>
                          {c.city}
                        </span>
                        <span className="text-muted-foreground font-mono">
                          {c.count} ({c.pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-secondary/50 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(4, c.pct)}%`,
                            backgroundColor: idx === 0 ? '#10b981' : idx === 1 ? '#06b6d4' : idx === 2 ? '#6366f1' : '#a855f7',
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Station Demographics Breakdown Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              Station Visitor Demographics Breakdown
            </h4>
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-secondary/30 border-b border-border/30 text-muted-foreground text-left">
                    <th className="p-2.5 font-semibold">Jump-off Station</th>
                    <th className="p-2.5 font-semibold text-right">Total Influx</th>
                    <th className="p-2.5 font-semibold text-center">Avg Hiker Age</th>
                    <th className="p-2.5 font-semibold text-center">Gender Split (M / F)</th>
                    <th className="p-2.5 font-semibold">Top Feeder City</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {demographics.stationDemo.map((st) => (
                    <tr key={st.stationId} className="hover:bg-secondary/10 transition-colors">
                      <td className="p-2.5 font-medium flex items-center gap-1.5 text-foreground">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        {st.stationName}
                      </td>
                      <td className="p-2.5 text-right font-bold text-foreground">
                        {st.total.toLocaleString()}
                      </td>
                      <td className="p-2.5 text-center text-muted-foreground">
                        {typeof st.avgAge === 'number' ? `${st.avgAge} yrs` : '—'}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-blue-500 font-semibold">{st.malePct}% M</span>
                        <span className="text-muted-foreground mx-1">/</span>
                        <span className="text-pink-500 font-semibold">{st.femalePct}% F</span>
                      </td>
                      <td className="p-2.5 text-foreground font-medium">
                        {st.topCity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visitor Roster Manifest Audit */}
          <div className="space-y-3 pt-2 border-t border-border/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-primary" />
                  Visitor Manifest &amp; Companion Audit ({filteredVisitors.length} shown)
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Individual profile records from confirmed lead hikers and companions.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter manifest (name, city)..."
                  value={visitorSearch}
                  onChange={(e) => setVisitorSearch(e.target.value)}
                  className="pl-8 text-xs h-8 bg-card/60"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary/80 backdrop-blur border-b border-border/30 text-muted-foreground text-left z-10">
                    <tr>
                      <th className="p-2.5 font-semibold">Visitor Name</th>
                      <th className="p-2.5 font-semibold">Role</th>
                      <th className="p-2.5 font-semibold">Age / Bracket</th>
                      <th className="p-2.5 font-semibold">Sex</th>
                      <th className="p-2.5 font-semibold">Origin City</th>
                      <th className="p-2.5 font-semibold">Station</th>
                      <th className="p-2.5 font-semibold text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {filteredVisitors.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          No visitor manifest records found matching filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredVisitors.map((v, i) => (
                        <tr key={`${v.name}-${v.bookingDate}-${i}`} className="hover:bg-secondary/10 transition-colors">
                          <td className="p-2.5 font-medium text-foreground">
                            {v.name}
                          </td>
                          <td className="p-2.5">
                            <Badge
                              variant={v.role === 'Lead Hiker' ? 'default' : 'secondary'}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {v.role}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {v.age !== null ? (
                              <span>
                                <strong className="text-foreground">{v.age}</strong> ({v.ageBracket})
                              </span>
                            ) : (
                              <span>{v.ageBracket}</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`text-[11px] font-medium ${
                                v.sex === 'Male'
                                  ? 'text-blue-500'
                                  : v.sex === 'Female'
                                  ? 'text-pink-500'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {v.sex}
                            </span>
                          </td>
                          <td className="p-2.5 text-foreground">
                            {v.city}
                          </td>
                          <td className="p-2.5 text-muted-foreground">
                            {v.locationName}
                          </td>
                          <td className="p-2.5 text-right font-mono text-[11px] text-muted-foreground">
                            {v.bookingDate ? format(parseISO(v.bookingDate), 'MMM dd, yyyy') : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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

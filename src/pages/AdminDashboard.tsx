import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  ADMIN_CHECKIN_TOKEN_PREFIX,
  isAdminAuthorizedSession,
  makeAdminCheckInToken,
} from '@/lib/tracking/sessionAuthorization';
import { useLocations } from '@/hooks/useLocations';
import RealtimeMonitorMap from '@/components/admin/RealtimeMonitorMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Mountain,
  CalendarCheck,
  Activity,
  MapPin,
  Megaphone,
  UserCog,
  LayoutDashboard,
  Loader2,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  ClipboardList,
  UserCheck,
  CalendarClock,
  XCircle,
  SlidersHorizontal,
  QrCode,
  ScanLine,
  CreditCard,
  Receipt,
  RefreshCw,
  Baby,
  BarChart2,
  ExternalLink,
  Search,
  ShieldCheck,
  FileText,
  DollarSign,
  UserPlus,
  ChevronDown,
  ChevronUp,
  MessageCircle,
} from 'lucide-react';
import BookingChat from '@/components/booking/BookingChat';
import ReassignGuideDialog from '@/components/booking/ReassignGuideDialog';
import EditBookingDialog from '@/components/booking/EditBookingDialog';
import { AdminOffDutyApprovals } from '@/components/booking/OffDutyManager';
import { useAuth } from '@/hooks/useAuth';
import { parseMeta, encodeMeta } from '@/lib/bookingMeta';
import { calculateFees, calculatePeakExtensionFee, formatPeso, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/payments';
import { addAnnouncement, loadAnnouncements, removeAnnouncement, type AdminAnnouncement } from '@/lib/announcements';
import { writeActivityLog } from '@/lib/activity-log';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { loadGuideRatings, renderStars, type GuideRating } from '@/lib/guideRatings';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import TrailRecorder from '@/components/map/TrailRecorder';
import QRCameraScanner from '@/components/admin/QRCameraScanner';
import DemographicsTab from '@/components/admin/DemographicsTab';
import OverviewDashboard from '@/components/admin/OverviewDashboard';
import PaymentSummaryTab from '@/components/admin/PaymentSummaryTab';
import ForecastingTab from '@/components/admin/forecasting/ForecastingTab';
import AppDownloadButton from '@/components/AppDownloadButton';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7'];

/* ── Mock guide data (replace with Supabase when guide profiles table is ready) ── */
const MOCK_GUIDES = [
  { id: 'g1', name: 'Rodel Manalansan', phone: '+63 912 345 6789', status: 'available', trail: 'Summit Trail', totalHikes: 48 },
  { id: 'g2', name: 'Bong Villarosa', phone: '+63 917 234 5678', status: 'on-duty', trail: 'Ridge Route', totalHikes: 62 },
  { id: 'g3', name: 'Nilo Santos', phone: '+63 918 876 5432', status: 'available', trail: 'Scenic Loop', totalHikes: 35 },
  { id: 'g4', name: 'Allan Reyes', phone: '+63 921 456 7890', status: 'off-duty', trail: '—', totalHikes: 27 },
];

const GUIDE_STATUS_STYLES: Record<string, string> = {
  available: 'bg-primary/20 text-primary',
  'on-duty': 'bg-sky-500/20 text-sky-600 dark:text-sky-400',
  'off-duty': 'bg-muted text-muted-foreground',
};

interface HikingExperienceReview {
  id: string;
  reviewer_name: string;
  rating: number;
  trail_name: string;
  review_text: string;
  created_at: string;
}

const ANNOUNCEMENT_TYPE_STYLES: Record<string, string> = {
  info: 'bg-primary/10 text-primary border-primary/30',
  warning: 'bg-warning/10 text-yellow-700 dark:text-yellow-400 border-warning/30',
  closure: 'bg-destructive/10 text-destructive border-destructive/30',
};

const getMappedTab = (tab: string) => {
  if (['overview', 'demographics'].includes(tab)) return 'overview';
  if (['operations', 'requests', 'scan', 'live-map'].includes(tab)) return 'operations';
  if (['management', 'guides', 'announcements', 'capacity'].includes(tab)) return 'management';
  if (['finance', 'payment-summary'].includes(tab)) return 'finance';
  return 'overview';
};

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeEditorRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState(getMappedTab(searchParams.get('tab') || 'overview'));
  const [operationsTab, setOperationsTab] = useState<'requests' | 'scan' | 'live-map'>(() => {
    const initialTab = searchParams.get('tab');
    return initialTab === 'scan' || initialTab === 'live-map' ? initialTab : 'requests';
  });
  /* ── Overview state ── */
  const [stats, setStats] = useState({ totalBookings: 0, activeHikers: 0, totalZones: 5, todayVisitors: 0 });
  const [bookings, setBookings] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);

  /* ── Announcements state ── */
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annType, setAnnType] = useState<'info' | 'warning' | 'closure'>('info');
  const [annImportant, setAnnImportant] = useState(false);
  const [annStartDate, setAnnStartDate] = useState('');
  const [annEndDate, setAnnEndDate] = useState('');
  const [annSending, setAnnSending] = useState(false);

  /* ── Guide state ── */
  /* ── Real guides loaded from DB, mapped to the legacy UI shape ── */
  const { activeLocationId, isSuperAdmin, locations } = useLocations();
  const { user: adminUser } = useAuth();
  type UIGuide = { id: string; name: string; phone: string; status: string; trail: string; totalHikes: number; user_id: string | null; per_trip_fee: number; location_id: string | null };
  const [guides, setGuides] = useState<UIGuide[]>([]);
  const [chatBooking, setChatBooking] = useState<{ id: string; date: string } | null>(null);
  const [reassignFor, setReassignFor] = useState<{ bookingId: string; guideName: string | null; guideId: string | null; locationId: string | null } | null>(null);
  const [editingBooking, setEditingBooking] = useState<any | null>(null);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const mappedTab = getMappedTab(tab || 'overview');
    if (mappedTab !== activeTab) setActiveTab(mappedTab);
    if (tab === 'requests' || tab === 'scan' || tab === 'live-map') {
      if (tab !== operationsTab) setOperationsTab(tab);
    }
  }, [activeTab, operationsTab, searchParams]);

  useEffect(() => {
    const openCalendar = () => setCalendarFloatingOpen(true);
    window.addEventListener('open-admin-booking-calendar', openCalendar);
    return () => window.removeEventListener('open-admin-booking-calendar', openCalendar);
  }, []);

  useEffect(() => {
    if (activeTab !== 'overview' || !searchParams.get('routeDraft')) return;
    const id = window.setTimeout(() => {
      routeEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
    return () => window.clearTimeout(id);
  }, [activeTab, searchParams]);

  /* ── All bookings (used by Bookings tab + Payments tab) ── */
  const [allTabBookings, setAllTabBookings] = useState<any[]>([]);
  const [allTabLoading, setAllTabLoading] = useState(false);

  /* ── Duplicate-week detection: same hiker, same ISO week ── */
  const isoWeekKey = (d: string) => {
    const dt = new Date(d);
    const day = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - day);
    return `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`;
  };
  const duplicateWeekIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const b of (allTabBookings ?? [])) {
      if (b.status === 'cancelled') continue;
      const k = `${b.user_id}|${isoWeekKey(b.booking_date)}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(b.id);
    }
    const dups = new Set<string>();
    for (const ids of map.values()) if (ids.length > 1) ids.forEach((id) => dups.add(id));
    return dups;
  }, [allTabBookings]);

  const sendDuplicateWeekReminder = async (b: any) => {
    const meta = parseMeta(b.notes);
    const msg = `Heads-up: you have more than one booking this week (current date ${b.booking_date}). Is this intentional, or would you like to reschedule one of them?`;
    await supabase.from('booking_messages' as any).insert({
      booking_id: b.id, sender_id: adminUser?.id, sender_role: 'admin', kind: 'system', content: msg,
    });
    toast.success(`Reminder sent to ${meta.fullName || b.emergency_contact_name || 'hiker'}`);
  };

  /* ── Bookings tab filter/search ── */
  const [bookingTabFilter, setBookingTabFilter] = useState<string>('all');
  const [bookingSearch, setBookingSearch] = useState('');

  /* ── Legacy pending state (used for dialogs only) ── */
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);


  /* ── QR Scan / Onsite Check-in state ── */
  const [qrInput, setQrInput] = useState('');
  const [scannedBooking, setScannedBooking] = useState<any | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [startingHike, setStartingHike] = useState(false);
  const [hikeStarted, setHikeStarted] = useState(false);
  const [checkInVerified, setCheckInVerified] = useState(false);
  const [checkInHeadcount, setCheckInHeadcount] = useState('');
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [checkOutVerified, setCheckOutVerified] = useState(false);
  const [checkOutHeadcount, setCheckOutHeadcount] = useState('');

  /* ── Reviews panel (shown after scan) ── */
  const [guideRatingForScan, setGuideRatingForScan] = useState<GuideRating | null>(null);
  const [hikingExperienceReviewsForScan, setHikingExperienceReviewsForScan] = useState<HikingExperienceReview[]>([]);
  const [reviewsLoadingForScan, setReviewsLoadingForScan] = useState(false);

  /* ── QR Scan: Payment recording ── */
  const [scanPayAmount, setScanPayAmount] = useState('');
  const [scanPayMethod, setScanPayMethod] = useState<PaymentMethod>('onsite');
  const [scanPayTxId, setScanPayTxId] = useState('');
  const [scanPaySaving, setScanPaySaving] = useState(false);
  const [showScanPayForm, setShowScanPayForm] = useState(false);

  /* ── Payments tab filter/search ── */
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');

  /* ── Capacity Management state ── */
  const [capDate, setCapDate] = useState('');
  const [capMax, setCapMax] = useState(100);
  const [capRangeStart, setCapRangeStart] = useState('');
  const [capRangeEnd, setCapRangeEnd] = useState('');
  const [capSaving, setCapSaving] = useState(false);
  const [upcomingCapacities, setUpcomingCapacities] = useState<any[]>([]);

  /* ── Guide management: history panel ── */
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [guideSearch, setGuideSearch] = useState('');
  const [guideHistoryBookings, setGuideHistoryBookings] = useState<any[]>([]);
  const [guideHistoryLoading, setGuideHistoryLoading] = useState(false);
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(new Date());
  const [calendarFloatingOpen, setCalendarFloatingOpen] = useState(false);
  const [newGuideName, setNewGuideName] = useState('');
  const [newGuidePhone, setNewGuidePhone] = useState('');
  
  const [newGuideEmail, setNewGuideEmail] = useState('');
  const [newGuidePassword, setNewGuidePassword] = useState('');
  const [newGuideFee, setNewGuideFee] = useState('500');
  const [addGuideSaving, setAddGuideSaving] = useState(false);
  const [removeGuideId, setRemoveGuideId] = useState<string | null>(null);
  const [removeGuidePassword, setRemoveGuidePassword] = useState('');

  // Accept flow
  const [acceptDialogId, setAcceptDialogId] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide] = useState('');
  const [selectedTrailZoneId, setSelectedTrailZoneId] = useState('');
  const [acceptSaving, setAcceptSaving] = useState(false);

  // Adjust flow
  const [adjustDialogId, setAdjustDialogId] = useState<string | null>(null);
  const [adjustDate, setAdjustDate] = useState('');
  const [adjustTime, setAdjustTime] = useState('06:00 AM');
  const [adjustSaving, setAdjustSaving] = useState(false);

  /* ── Computed: Derived lists ── */
  const filteredTabBookings = useMemo(() => {
    let list = allTabBookings;
    if (bookingTabFilter === 'started') {
      list = list.filter((b) => { const m = parseMeta(b.notes); return m.onsiteStartConfirmed; });
    } else if (bookingTabFilter === 'pending') {
      list = list.filter((b) => b.status === 'pending' || b.status === 'adjustment_pending');
    } else if (bookingTabFilter === 'confirmed') {
      list = list.filter((b) => b.status === 'confirmed' && !parseMeta(b.notes).onsiteStartConfirmed);
    } else if (bookingTabFilter === 'cancelled') {
      list = list.filter((b) => b.status === 'cancelled');
    }
    if (bookingSearch.trim()) {
      const q = bookingSearch.toLowerCase();
      list = list.filter((b) => {
        const m = parseMeta(b.notes);
        return (
          (m.fullName || b.emergency_contact_name || '').toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q) ||
          b.booking_date.includes(q)
        );
      });
    }
    return list;
  }, [allTabBookings, bookingTabFilter, bookingSearch]);

  const pendingCount = useMemo(
    () => allTabBookings.filter((b) => b.status === 'pending' || b.status === 'adjustment_pending').length,
    [allTabBookings],
  );

  const filteredPayments = useMemo(() => {
    let list = allTabBookings.filter((b) => b.status !== 'cancelled' || parseMeta(b.notes).paymentStatus === 'paid');
    if (paymentStatusFilter !== 'all') {
      list = list.filter((b) => (parseMeta(b.notes).paymentStatus || 'unpaid') === paymentStatusFilter);
    }
    if (paymentSearch.trim()) {
      const q = paymentSearch.toLowerCase();
      list = list.filter((b) => {
        const m = parseMeta(b.notes);
        return (
          (m.fullName || b.emergency_contact_name || '').toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [allTabBookings, paymentStatusFilter, paymentSearch]);

  const filteredGuides = useMemo(() => {
    if (!guideSearch.trim()) return guides;
    const q = guideSearch.toLowerCase();
    return guides.filter((g) => g.name.toLowerCase().includes(q) || g.trail.toLowerCase().includes(q));
  }, [guides, guideSearch]);

  useEffect(() => {
    loadData();
    loadAllTabBookings();
    loadPendingBookings();
    loadUpcomingCapacities();
    setAnnouncements(loadAnnouncements());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocationId]);

  useEffect(() => {
    if (!scannedBooking) {
      setGuideRatingForScan(null);
      setHikingExperienceReviewsForScan([]);
      setReviewsLoadingForScan(false);
      return;
    }

    const meta = parseMeta(scannedBooking.notes);
    const assignedGuide = meta.assignedGuide;

    // Guide reviews are stored in localStorage via guideRatings.ts
    if (assignedGuide) {
      const ratings = loadGuideRatings();
      const match = ratings.find((g) => g.guideName.toLowerCase() === assignedGuide.toLowerCase());
      setGuideRatingForScan(match ?? null);
    } else {
      setGuideRatingForScan(null);
    }

    // Hiking experience reviews are stored in Supabase (reviews table)
    let active = true;
    setReviewsLoadingForScan(true);
    void (async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, reviewer_name, rating, trail_name, review_text, created_at')
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(4);

      if (!active) return;
      if (!error && data) setHikingExperienceReviewsForScan(data as HikingExperienceReview[]);
      else setHikingExperienceReviewsForScan([]);
      setReviewsLoadingForScan(false);
    })();

    return () => {
      active = false;
    };
  }, [scannedBooking?.id]);

  /* ── Load all bookings (for Bookings tab + Payments tab) ── */
  const loadAllTabBookings = async () => {
    setAllTabLoading(true);
    let q: any = supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (activeLocationId) q = q.eq('location_id', activeLocationId);
    const { data } = await q;
    setAllTabBookings(data || []);
    setAllTabLoading(false);
  };

  /* ── Update daily_capacity.current_count on confirm/cancel ── */
  const updateDailySlots = async (bookingDate: string, groupSize: number, delta: number) => {
    try {
      const { data: cap } = await supabase
        .from('daily_capacity')
        .select('*')
        .eq('date', bookingDate)
        .maybeSingle();
      if (cap) {
        const newCount = Math.max(0, (cap.current_count ?? 0) + delta * groupSize);
        await supabase.from('daily_capacity').update({ current_count: newCount }).eq('id', cap.id);
      } else if (delta > 0) {
        await supabase
          .from('daily_capacity')
          .insert({ date: bookingDate, max_capacity: 100, current_count: groupSize });
      }
    } catch (err) {
      console.warn('[Slots] Update error:', err);
    }
  };

  /* ── QR Scan: lookup booking ── */
  const handleQrLookup = async () => {
    const q = qrInput.trim();
    if (!q) { toast.error('Enter QR code data, booking ID, or hiker name.'); return; }
    setScanLoading(true);
    setScannedBooking(null);
    setHikeStarted(false);
    setShowScanPayForm(false);

    let exactQuery = supabase
      .from('bookings')
      .select('*')
      .or(`qr_code_data.eq.${q},id.eq.${q}`)
      .limit(1);
    if (activeLocationId) exactQuery = exactQuery.eq('location_id', activeLocationId) as typeof exactQuery;
    const { data: exactData } = await exactQuery.maybeSingle();

    if (exactData) {
      setScannedBooking(exactData);
      setCheckInHeadcount(String(exactData.group_size));
      setCheckInVerified(false);
      setCheckOutHeadcount(String(exactData.group_size));
      setCheckOutVerified(false);
      setScanLoading(false);
      return;
    }

    let nameQuery = supabase
      .from('bookings')
      .select('*')
      .ilike('emergency_contact_name', `%${q}%`)
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1);
    if (activeLocationId) nameQuery = nameQuery.eq('location_id', activeLocationId) as typeof nameQuery;
    const { data: nameData } = await nameQuery.maybeSingle();

    if (nameData) {
      setScannedBooking(nameData);
      setCheckInHeadcount(String(nameData.group_size));
      setCheckInVerified(false);
      setCheckOutHeadcount(String(nameData.group_size));
      setCheckOutVerified(false);
      toast.info('Found booking by name match.');
    } else {
      toast.error('No booking found. Try the QR code, booking ID, or hiker name.');
    }
    setScanLoading(false);
  };

  /* ── QR Scan: start hike ── */
  const handleStartHike = async () => {
    if (!scannedBooking) return;
    if (!checkInVerified || Number(checkInHeadcount) !== Number(scannedBooking.group_size)) {
      toast.error('Verify every person and confirm the booked headcount before starting tracking.');
      return;
    }
    setStartingHike(true);
    const routeInfo = resolveAssignedTrail(scannedBooking);
    const meta = parseMeta(scannedBooking.notes);
    if (routeInfo.routes.length > 1 && !routeInfo.route) {
      toast.error('Assign one official route to this booking before starting the hike.');
      setStartingHike(false);
      return;
    }
    if (!routeInfo.route) {
      toast.error('No official route is available for this booking location. Publish a route first.');
      setStartingHike(false);
      return;
    }
    const { data: assignmentRows } = await supabase
      .from('booking_assignments' as any)
      .select('guide_id,status,created_at')
      .eq('booking_id', scannedBooking.id)
      .in('status', ['accepted', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1);
    const assignedGuideId = (assignmentRows as Array<{ guide_id?: string }> | null)?.[0]?.guide_id;
    let assignedGuide = assignedGuideId ? guides.find((guide) => guide.id === assignedGuideId) : null;
    if (!assignedGuide && assignedGuideId) {
      const { data: guideRows } = await supabase
        .from('guides' as any)
        .select('id,user_id,full_name')
        .eq('id', assignedGuideId)
        .limit(1);
      const guideRow = (guideRows as unknown as Array<{ id: string; user_id: string | null; full_name: string }> | null)?.[0];
      if (guideRow) {
        assignedGuide = {
          id: guideRow.id,
          name: guideRow.full_name,
          phone: '',
          status: 'on-duty',
          trail: routeInfo.route.name,
          totalHikes: 0,
          user_id: guideRow.user_id,
          per_trip_fee: 0,
          location_id: scannedBooking.location_id ?? activeLocationId,
        };
      }
    }
    if (!assignedGuide?.user_id) {
      toast.error('The assigned guide needs a linked guide account before this group can start.');
      setStartingHike(false);
      return;
    }

    const startTime = new Date().toISOString();
    const { data: existingRows } = await supabase
      .from('hiker_sessions')
      .select('id,user_id,participant_role,status,client_session_id')
      .eq('booking_id', scannedBooking.id)
      .eq('status', 'active');
    const existingSessions = (existingRows as Array<{
      id: string;
      user_id: string;
      participant_role?: string;
      client_session_id?: string | null;
    }> | null) ?? [];

    const createGroupSession = async (userId: string, participantRole: 'hiker' | 'guide') => {
      const existing = existingSessions.find((row) => row.user_id === userId);
      if (existing && isAdminAuthorizedSession(existing.client_session_id)) {
        return { data: existing, error: null, created: false };
      }
      if (existing) {
        const { error: closeError } = await supabase
          .from('hiker_sessions')
          .update({ status: 'cancelled', end_time: startTime })
          .eq('id', existing.id);
        if (closeError) return { data: null, error: closeError, created: false };
      }

      const clientSessionId = makeAdminCheckInToken(scannedBooking.id, userId, participantRole);
      let result = await supabase
        .from('hiker_sessions')
        .insert({
          client_session_id: clientSessionId,
          user_id: userId,
          booking_id: scannedBooking.id,
          location_id: scannedBooking.location_id ?? activeLocationId,
          trail_zone_id: routeInfo.route.id,
          participant_role: participantRole,
          tracking_phase: 'ascent',
          start_time: startTime,
          status: 'active',
          total_distance_km: 0,
        })
        .select()
        .single();
      if (result.error && (
        String(result.error.message).toLowerCase().includes('schema cache') ||
        String(result.error.message).toLowerCase().includes('could not find') ||
        String(result.error.message).toLowerCase().includes('column')
      )) {
        result = await supabase
          .from('hiker_sessions')
          .insert({
            client_session_id: clientSessionId,
            user_id: userId,
            booking_id: scannedBooking.id,
            trail_zone_id: routeInfo.route.id,
            start_time: startTime,
            status: 'active',
            total_distance_km: 0,
          })
          .select()
          .single();
      }
      return { ...result, created: !result.error };
    };

    const hikerResult = await createGroupSession(scannedBooking.user_id, 'hiker');
    let session = hikerResult.data;
    let guideSession: any = null;
    let sessionErr = hikerResult.error;
    if (!sessionErr) {
      const guideResult = await createGroupSession(assignedGuide.user_id, 'guide');
      guideSession = guideResult.data;
      if (guideResult.error) {
        if (hikerResult.created && session?.id) {
          await supabase.from('hiker_sessions').delete().eq('id', session.id);
        }
        session = null;
        sessionErr = guideResult.error;
      }
    }

    if (sessionErr) {
      toast.error('Failed to start the hiker and guide group: ' + sessionErr.message);
    } else {
      const updatedNotes = encodeMeta({
        ...meta,
        onsiteStartConfirmed: true,
        onsiteStartTime: startTime,
        checkinVerifiedAt: startTime,
        checkinHeadcount: Number(checkInHeadcount),
        groupPhase: 'ascent',
        hikerSessionId: session?.id,
        assignedTrailZoneId: routeInfo.route.id,
        assignedTrailName: routeInfo.route.name,
        assignedTrailAuto: routeInfo.auto || meta.assignedTrailAuto,
      });
      await supabase.from('bookings').update({ notes: updatedNotes }).eq('id', scannedBooking.id);
      const routePoints = Array.isArray(routeInfo.route.coordinates_json) ? routeInfo.route.coordinates_json : [];
      const firstPoint = routePoints[0] as { lat?: number; lng?: number } | undefined;
      if (firstPoint && Number.isFinite(Number(firstPoint.lat)) && Number.isFinite(Number(firstPoint.lng))) {
        const startPoints = [session?.id, guideSession?.id]
          .filter(Boolean)
          .map((sessionId) => ({
            session_id: sessionId,
            latitude: Number(firstPoint.lat),
            longitude: Number(firstPoint.lng),
            altitude: null,
            accuracy: 5,
            speed_m_s: 0,
            heading: null,
            segment: 'ascent',
            timestamp: startTime,
          }));
        if (startPoints.length) {
          const { error: startPointError } = await supabase.from('hiker_locations').insert(startPoints as any);
          if (startPointError) {
            const legacyPoints = startPoints.map(({ session_id, latitude, longitude, altitude, timestamp }) => ({
              session_id,
              latitude,
              longitude,
              altitude,
              timestamp,
            }));
            const { error: legacyStartPointError } = await supabase.from('hiker_locations').insert(legacyPoints as any);
            if (legacyStartPointError) console.warn('Could not seed trailhead location', legacyStartPointError);
          }
        }
      }
      toast.success(`✅ Hike started for ${meta.fullName || 'hiker'}! Session is now active.`);
      setHikeStarted(true);
      setScannedBooking({ ...scannedBooking, notes: updatedNotes });

      // Update guide status to on-duty
      const guideNameAssigned = meta.assignedGuide;
      if (guideNameAssigned) {
        setGuides((prev) =>
          prev.map((g) =>
            g.name.toLowerCase().includes(guideNameAssigned.toLowerCase())
              ? { ...g, status: 'on-duty' }
              : g,
          ),
        );
        void writeActivityLog({
          action: 'hike_started',
          entity_type: 'guide',
          entity_id: scannedBooking.id,
          after_state: {
            guideName: guideNameAssigned,
            guideStatus: 'on-duty',
            bookingId: scannedBooking.id,
            startTime,
          },
        });
      }
      // Log hike start for booking
      void writeActivityLog({
        action: 'hike_started',
        entity_type: 'booking',
        entity_id: scannedBooking.id,
        after_state: {
          onsiteStartConfirmed: true,
          startTime,
          assignedTrail: routeInfo.route.name,
        },
      });
      loadAllTabBookings();
    }
    setStartingHike(false);
  };

  const updateGroupPhase = async (phase: 'peak' | 'descent') => {
    if (!scannedBooking) return;
    setLifecycleSaving(true);
    const now = new Date().toISOString();
    const meta = parseMeta(scannedBooking.notes);
    const peakHours = Math.max(0, Number(meta.peakExtensionHours ?? 0));
    const nextMeta = phase === 'peak'
      ? {
          ...meta,
          groupPhase: 'peak' as const,
          peakReachedAt: now,
          peakDeadlineAt: new Date(Date.now() + (2 + peakHours) * 60 * 60 * 1000).toISOString(),
        }
      : { ...meta, groupPhase: 'descent' as const, descentStartedAt: now };
    const update: Record<string, unknown> = {
      tracking_phase: phase,
      ...(phase === 'peak' ? { peak_reached_at: now } : { descent_started_at: now }),
    };
    const { error: sessionError } = await supabase
      .from('hiker_sessions')
      .update(update as any)
      .eq('booking_id', scannedBooking.id)
      .eq('status', 'active');
    const { error: bookingError } = await supabase
      .from('bookings')
      .update({ notes: encodeMeta(nextMeta) })
      .eq('id', scannedBooking.id);
    if (sessionError || bookingError) {
      toast.error(`Could not update group progress: ${(sessionError || bookingError)?.message}`);
    } else {
      setScannedBooking({ ...scannedBooking, notes: encodeMeta(nextMeta) });
      toast.success(phase === 'peak' ? 'Peak arrival recorded. The two-hour stay has started.' : 'Guide descent recorded for the group.');
    }
    setLifecycleSaving(false);
  };

  const extendPeakStay = async () => {
    if (!scannedBooking) return;
    const meta = parseMeta(scannedBooking.notes);
    if (meta.groupPhase !== 'peak' || !meta.peakDeadlineAt) {
      toast.error('Peak extension is available only while the group is at the peak.');
      return;
    }
    setLifecycleSaving(true);
    const hours = Number(meta.peakExtensionHours ?? 0) + 1;
    const nextMeta = {
      ...meta,
      peakExtensionHours: hours,
      peakDeadlineAt: new Date(new Date(meta.peakDeadlineAt).getTime() + 60 * 60 * 1000).toISOString(),
    };
    const { error } = await supabase.from('bookings').update({ notes: encodeMeta(nextMeta) }).eq('id', scannedBooking.id);
    if (error) toast.error(`Could not extend peak stay: ${error.message}`);
    else {
      setScannedBooking({ ...scannedBooking, notes: encodeMeta(nextMeta) });
      toast.success(`Peak stay extended by one hour. ${formatPeso(calculatePeakExtensionFee(hours))} total extension fee.`);
    }
    setLifecycleSaving(false);
  };

  const completeGroupHike = async () => {
    if (!scannedBooking) return;
    if (!checkOutVerified || Number(checkOutHeadcount) !== Number(scannedBooking.group_size)) {
      toast.error('Verify the returning group headcount before ending this hike.');
      return;
    }
    setLifecycleSaving(true);
    const now = new Date().toISOString();
    const meta = parseMeta(scannedBooking.notes);
    const nextMeta = {
      ...meta,
      groupPhase: 'completed' as const,
      hikeCompletedAt: now,
      hikeCompletedBy: adminUser?.id ?? 'admin',
      guideReviewRequestedAt: now,
    };
    const { error: sessionError } = await supabase
      .from('hiker_sessions')
      .update({ status: 'completed', tracking_phase: 'completed', end_time: now } as any)
      .eq('booking_id', scannedBooking.id)
      .eq('status', 'active');
    const { error: bookingError } = await supabase
      .from('bookings')
      .update({ notes: encodeMeta(nextMeta) })
      .eq('id', scannedBooking.id);
    if (sessionError || bookingError) {
      toast.error(`Could not close the hike: ${(sessionError || bookingError)?.message}`);
    } else {
      setScannedBooking({ ...scannedBooking, notes: encodeMeta(nextMeta) });
      setHikeStarted(false);
      toast.success('Hike closed. The booking owner can now submit the guide review.');
      void loadAllTabBookings();
    }
    setLifecycleSaving(false);
  };

  /* ── QR Scan: record payment ── */
  const handleScanRecordPayment = async () => {
    if (!scannedBooking || !scanPayAmount) { toast.error('Enter amount paid.'); return; }
    setScanPaySaving(true);
    const meta = parseMeta(scannedBooking.notes);
    const { entryFee, envFee, guideFee, totalFee: baseTotalFee } = calculateFees(scannedBooking.group_size);
    const peakExtensionFee = calculatePeakExtensionFee(meta.peakExtensionHours);
    const totalFee = baseTotalFee + peakExtensionFee;
    const paid = Number(scanPayAmount);
    const refundAmount = paid > totalFee ? paid - totalFee : 0;
    const paymentStatus = paid >= totalFee ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

    const updatedMeta = encodeMeta({
      ...meta,
      paymentStatus,
      paymentMethod: scanPayMethod,
      amountPaid: paid,
      transactionId: scanPayTxId.trim() || undefined,
      entryFee,
      envFee,
      guideFee,
      peakExtensionFee: peakExtensionFee || undefined,
      totalFee,
      refundAmount: refundAmount > 0 ? refundAmount : undefined,
      refundReason: refundAmount > 0 ? `Overpayment: ${formatPeso(refundAmount)}` : undefined,
    });

    const { error } = await supabase.from('bookings').update({ notes: updatedMeta }).eq('id', scannedBooking.id);
    if (error) {
      toast.error('Failed to record payment: ' + error.message);
    } else {
      toast.success(`✅ Payment recorded! Status: ${paymentStatus.toUpperCase()}`);
      void writeActivityLog({
        action: 'payment_recorded',
        entity_type: 'payment',
        entity_id: scannedBooking.id,
        before_state: { paymentStatus: meta.paymentStatus, amountPaid: meta.amountPaid },
        after_state: {
          paymentStatus,
          paymentMethod: scanPayMethod,
          amountPaid: paid,
          transactionId: scanPayTxId.trim() || undefined,
          refundAmount: refundAmount > 0 ? refundAmount : undefined,
        },
      });
      setScannedBooking({ ...scannedBooking, notes: updatedMeta });
      setScanPayAmount('');
      setScanPayTxId('');
      setShowScanPayForm(false);
      loadAllTabBookings();
    }
    setScanPaySaving(false);
  };

  /* ── Capacity Management ── */
  const loadUpcomingCapacities = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('daily_capacity')
      .select('*')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(60);
    setUpcomingCapacities(data || []);
  };

  const saveCapacity = async () => {
    if (!capDate) { toast.error('Please select a date.'); return; }
    if (capMax < 1) { toast.error('Max capacity must be at least 1.'); return; }
    setCapSaving(true);
    const { error } = await supabase
      .from('daily_capacity')
      .upsert({ date: capDate, max_capacity: capMax }, { onConflict: 'date' });
    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      toast.success(`✅ Capacity for ${capDate} set to ${capMax} hikers.`);
      setCapDate('');
      setCapMax(100);
      loadUpcomingCapacities();
    }
    setCapSaving(false);
  };

  const saveCapacityRange = async () => {
    if (!capRangeStart || !capRangeEnd) { toast.error('Please select both start and end dates.'); return; }
    if (capMax < 1) { toast.error('Max capacity must be at least 1.'); return; }
    const start = new Date(`${capRangeStart}T00:00:00`);
    const end = new Date(`${capRangeEnd}T00:00:00`);
    if (end < start) { toast.error('End date must be after start date.'); return; }

    const rows: Array<{ date: string; max_capacity: number }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      rows.push({ date: format(cursor, 'yyyy-MM-dd'), max_capacity: capMax });
      cursor.setDate(cursor.getDate() + 1);
    }
    setCapSaving(true);
    const { error } = await supabase.from('daily_capacity').upsert(rows, { onConflict: 'date' });
    if (error) {
      toast.error('Failed bulk update: ' + error.message);
    } else {
      toast.success(`Updated ${rows.length} day(s) to ${capMax} hikers/day.`);
      setCapRangeStart('');
      setCapRangeEnd('');
      loadUpcomingCapacities();
    }
    setCapSaving(false);
  };

  const deleteCapacityLimit = async (id: string) => {
    const { error } = await supabase.from('daily_capacity').delete().eq('id', id);
    if (error) toast.error('Failed to remove: ' + error.message);
    else {
      toast.success('Capacity limit removed (reverts to default 100).');
      loadUpcomingCapacities();
    }
  };

  const loadPendingBookings = async () => {
    setPendingLoading(true);
    let query = supabase
      .from('bookings')
      .select('*')
      .in('status', ['pending', 'adjustment_pending'])
      .order('created_at', { ascending: true });
    if (activeLocationId) query = query.eq('location_id', activeLocationId) as typeof query;
    const { data } = await query;
    setPendingBookings(data || []);
    setPendingLoading(false);
  };

  /* ── Accept booking + assign guide ── */
  const handleAcceptBooking = async () => {
    if (!acceptDialogId || !selectedGuide) return;
    setAcceptSaving(true);
    const booking = allTabBookings.find((b) => b.id === acceptDialogId);
    const meta = parseMeta(booking?.notes);
    // selectedGuide now stores guide.id; resolve display name
    const guideRow = guides.find((g) => g.id === selectedGuide);
    const guideName = guideRow?.name ?? selectedGuide;
    const routeInfo = resolveAssignedTrail(booking, selectedTrailZoneId || undefined);
    if (routeInfo.routes.length > 1 && !routeInfo.route) {
      toast.error('Select the official route for this hiker before confirming.');
      setAcceptSaving(false);
      return;
    }
    const updatedMeta = encodeMeta({
      ...meta,
      assignedGuide: guideName,
      assignedGuideId: guideRow?.id,
      assignedTrailZoneId: routeInfo.route?.id,
      assignedTrailName: routeInfo.route?.name,
      assignedTrailAuto: routeInfo.auto,
    });
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'confirmed', notes: updatedMeta })
      .eq('id', acceptDialogId);
    if (error) {
      toast.error('Failed to accept booking');
    } else {
      // Notify the guide immediately by upserting an assignment row
      if (guideRow) {
        const { data: existingRaw } = await supabase
          .from('booking_assignments' as any)
          .select('id')
          .eq('booking_id', acceptDialogId)
          .eq('guide_id', guideRow.id)
          .maybeSingle();
        const existing = existingRaw as unknown as { id: string } | null;
        if (existing?.id) {
          await supabase.from('booking_assignments' as any)
            .update({ status: 'pending', decided_at: null } as any)
            .eq('id', existing.id);
        } else {
          await supabase.from('booking_assignments' as any).insert({
            booking_id: acceptDialogId,
            guide_id: guideRow.id,
            location_id: guideRow.location_id ?? booking?.location_id,
            status: 'pending',
          } as any);
        }
        await supabase.from('booking_messages' as any).insert({
          booking_id: acceptDialogId,
          sender_role: 'system',
          kind: 'system',
          content: `Admin assigned guide ${guideName}. Please accept or decline.`,
        } as any);
      }
      toast.success(`✅ Booking accepted! Guide "${guideName}" notified immediately.`);
      if (booking) await updateDailySlots(booking.booking_date, booking.group_size, 1);
      void writeActivityLog({
        action: 'booking_confirmed',
        entity_type: 'booking',
        entity_id: acceptDialogId,
        after_state: { status: 'confirmed', assignedGuide: guideName, assignedTrail: routeInfo.route?.name ?? null },
      });
      setPendingBookings((prev) => prev.filter((b) => b.id !== acceptDialogId));
      setAcceptDialogId(null);
      setSelectedGuide('');
      setSelectedTrailZoneId('');
      loadAllTabBookings();
      loadUpcomingCapacities();
    }
    setAcceptSaving(false);
  };

  /* ── Adjust booking date/time ── */
  const handleAdjustBooking = async () => {
    if (!adjustDialogId || !adjustDate) return;
    setAdjustSaving(true);
    const booking = allTabBookings.find((b) => b.id === adjustDialogId);
    const meta = parseMeta(booking?.notes);
    const updatedMeta = encodeMeta({ ...meta, adjustedDate: adjustDate, adjustedTime: adjustTime });
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'adjustment_pending', notes: updatedMeta })
      .eq('id', adjustDialogId);
    if (error) {
      toast.error('Failed to adjust booking');
    } else {
      toast.success('📅 Booking adjustment proposed. Hiker will be notified to confirm.');
      void writeActivityLog({
        action: 'booking_adjusted',
        entity_type: 'booking',
        entity_id: adjustDialogId,
        after_state: { adjustedDate: adjustDate, adjustedTime: adjustTime },
      });
      setPendingBookings((prev) => prev.filter((b) => b.id !== adjustDialogId));
      setAdjustDialogId(null);
      setAdjustDate('');
      loadAllTabBookings();
    }
    setAdjustSaving(false);
  };

  /* ── Reject booking (pending → cancelled) ── */
  const handleRejectBooking = async (bookingId: string) => {
    const booking = allTabBookings.find((b) => b.id === bookingId);
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    if (error) toast.error('Failed to reject booking');
    else {
      toast.success('Booking rejected and cancelled.');
      void writeActivityLog({
        action: 'booking_rejected',
        entity_type: 'booking',
        entity_id: bookingId,
        after_state: { status: 'cancelled' },
      });
      setPendingBookings((prev) => prev.filter((b) => b.id !== bookingId));
      loadAllTabBookings();
    }
    // Pending bookings don't count toward slots, so no slot update needed
    void booking; // suppress unused warning
  };

  /* ── Cancel a confirmed booking ── */
  const handleCancelConfirmedBooking = async (bookingId: string) => {
    const booking = allTabBookings.find((b) => b.id === bookingId);
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    if (error) {
      toast.error('Failed to cancel booking');
    } else {
      toast.success('Booking cancelled. Slots have been restored.');
      if (booking) await updateDailySlots(booking.booking_date, booking.group_size, -1);
      void writeActivityLog({
        action: 'booking_rejected',
        entity_type: 'booking',
        entity_id: bookingId,
        after_state: { status: 'cancelled', reason: 'admin_cancel_confirmed' },
      });
      loadAllTabBookings();
      loadUpcomingCapacities();
    }
  };

  const loadData = async () => {
    // Scope to current location when the admin has one selected (super_admin sees all).
    const scopeBookings = (q: any) => (activeLocationId ? q.eq('location_id', activeLocationId) : q);
    let activeHikersQuery = supabase
      .from('hiker_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`);
    if (activeLocationId) {
      activeHikersQuery = activeHikersQuery.eq('location_id', activeLocationId);
    }
    const [
      { count: totalBookings },
      { count: activeHikers },
      { data: bookingsData },
      { data: zonesData },
    ] = await Promise.all([
      scopeBookings(supabase.from('bookings').select('*', { count: 'exact', head: true })),
      activeHikersQuery,
      scopeBookings(supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(20)),
      supabase.from('trail_zones').select('*'),
    ]);

    setStats({
      totalBookings: totalBookings || 0,
      activeHikers: activeHikers || 0,
      totalZones: zonesData?.length || 5,
      todayVisitors:
        bookingsData?.filter(
          (b: any) => b.booking_date === new Date().toISOString().split('T')[0],
        ).length || 0,
    });
    setBookings(bookingsData || []);
    setZones((zonesData || []).filter((zone: any) => zone.status !== 'deleted' && zone.review_status !== 'deleted'));
  };

  /* ── Load real guides from DB (scoped to active location for admins) ── */
  const loadGuides = async () => {
    let q: any = supabase.from('guides').select('id, user_id, full_name, phone, specialty, status, per_trip_fee, location_id, is_active');
    if (activeLocationId) q = q.eq('location_id', activeLocationId);
    const { data } = await q.order('full_name');
    const activeLocName = locations.find((l) => l.id === activeLocationId)?.name || '';
    const mapped: UIGuide[] = (data ?? []).map((g: any) => ({
      id: g.id,
      user_id: g.user_id,
      name: g.full_name,
      phone: g.phone || '—',
      status: g.is_active ? (g.status || 'available') : 'off-duty',
      trail: g.specialty || activeLocName || 'Local trail',
      totalHikes: 0,
      per_trip_fee: Number(g.per_trip_fee || 0),
      location_id: g.location_id,
    }));

    setGuides(mapped);
  };

  useEffect(() => { void loadGuides(); /* eslint-disable-next-line */ }, [activeLocationId]);

  /* ── Guide history ── */
  const loadGuideHistory = async (guideName: string) => {
    setGuideHistoryLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: false })
      .limit(100);
    const filtered = (data || []).filter((b: any) => {
      const meta = parseMeta(b.notes);
      return meta.assignedGuide && meta.assignedGuide.toLowerCase().includes(guideName.toLowerCase());
    });
    setGuideHistoryBookings(filtered);
    setGuideHistoryLoading(false);
  };

  const handleSelectGuide = (guide: UIGuide) => {
    if (selectedGuideId === guide.id) {
      setSelectedGuideId(null);
      setGuideHistoryBookings([]);
      return;
    }
    setSelectedGuideId(guide.id);
    loadGuideHistory(guide.name);
  };

  /* ── Announcements ── */
  const postAnnouncement = async () => {
    if (!annTitle.trim() || !annBody.trim()) { toast.error('Please fill in title and message.'); return; }
    setAnnSending(true);
    await new Promise((r) => setTimeout(r, 800));
    const startsAt = annStartDate ? new Date(`${annStartDate}T00:00:00`).toISOString() : undefined;
    const expiresAt = annEndDate ? new Date(`${annEndDate}T23:59:59`).toISOString() : undefined;
    const newAnn: AdminAnnouncement = {
      id: Date.now().toString(),
      title: annTitle.trim(),
      body: annBody.trim(),
      type: annType,
      created_at: new Date().toISOString(),
      isImportant: annImportant || annType === 'warning' || annType === 'closure',
      starts_at: startsAt,
      expires_at: expiresAt,
    };
    setAnnouncements(addAnnouncement(newAnn));
    setAnnTitle('');
    setAnnBody('');
    setAnnType('info');
    setAnnImportant(false);
    setAnnStartDate('');
    setAnnEndDate('');
    setAnnSending(false);
    toast.success('Announcement posted!');
  };

  const deleteAnnouncement = (id: string) => {
    setAnnouncements(removeAnnouncement(id));
    toast.success('Announcement removed.');
  };

  /* ── Toggle guide status (persisted) ── */
  const cycleGuideStatus = async (id: string) => {
    const cycle: Record<string, 'available' | 'on-duty' | 'off-duty'> = {
      available: 'on-duty',
      'on-duty': 'off-duty',
      'off-duty': 'available',
    };
    const guide = guides.find((g) => g.id === id);
    if (!guide) return;
    const next = cycle[guide.status] || 'available';
    setGuides((prev) => prev.map((g) => (g.id === id ? { ...g, status: next } : g)));
    await supabase.from('guides').update({ status: next, is_active: next !== 'off-duty' }).eq('id', id);
  };

  const handleAddGuide = async () => {
    const name = newGuideName.trim();
    const email = newGuideEmail.trim();
    const password = newGuidePassword.trim();
    if (!name || !email || !password) {
      toast.error('Name, email and temp password are required.');
      return;
    }
    if (password.length < 8) {
      toast.error('Temp password must be at least 8 characters.');
      return;
    }
    const locId = activeLocationId;
    if (!locId) {
      toast.error('Pick an active location first.');
      return;
    }
    setAddGuideSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-guide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          email,
          password,
          full_name: name,
          phone: newGuidePhone.trim(),
          specialty: (locations.find((l) => l.id === locId)?.name || '').trim(),
          per_trip_fee: Number(newGuideFee) || 0,
          location_id: locId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to create guide');
      toast.success(`Guide "${name}" created. They can sign in with ${email}.`);
      setNewGuideName(''); setNewGuidePhone('');
      setNewGuideEmail(''); setNewGuidePassword(''); setNewGuideFee('500');
      await loadGuides();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddGuideSaving(false);
    }
  };

  const handleRemoveGuide = () => {
    if (!removeGuideId) return;
    const expectedPassword = (import.meta.env.VITE_ADMIN_GUIDE_REMOVE_PASSWORD as string) || 'admin123';
    if (removeGuidePassword !== expectedPassword) {
      toast.error('Incorrect password. Guide was not removed.');
      return;
    }
    const guide = guides.find((g) => g.id === removeGuideId);
    setGuides((prev) => prev.filter((g) => g.id !== removeGuideId));
    if (selectedGuideId === removeGuideId) {
      setSelectedGuideId(null);
      setGuideHistoryBookings([]);
    }
    setRemoveGuideId(null);
    setRemoveGuidePassword('');
    toast.success(`Guide "${guide?.name || ''}" removed.`);
  };

  /* ── Weekly mock data ── */
  const weeklyData = [
    { day: 'Mon', visitors: 45 },
    { day: 'Tue', visitors: 32 },
    { day: 'Wed', visitors: 58 },
    { day: 'Thu', visitors: 41 },
    { day: 'Fri', visitors: 67 },
    { day: 'Sat', visitors: 89 },
    { day: 'Sun', visitors: 76 },
  ];

  const trailData = zones.map((z: any, i: number) => ({
    name: z.name,
    value: z.max_capacity,
    color: COLORS[i % COLORS.length],
  }));

  const statCards = [
    { label: 'Total Bookings', value: stats.totalBookings, icon: CalendarCheck, color: 'text-primary' },
    { label: 'Active Hikers', value: stats.activeHikers, icon: Activity, color: 'text-sky-500' },
    { label: 'Today Visitors', value: stats.todayVisitors, icon: Users, color: 'text-warning' },
    { label: 'Trail Zones', value: stats.totalZones, icon: Mountain, color: 'text-primary' },
  ];

  /* ─── Booking display helpers ─── */
  const getDisplayStatus = (b: any) => {
    const meta = parseMeta(b.notes);
    if (meta.onsiteStartConfirmed) return 'started';
    return b.status as string;
  };

  const officialRoutesForLocation = useCallback((locationId?: string | null) => {
    return (zones ?? []).filter((z: any) => {
      const active = z.status === 'active' && z.is_official !== false;
      return active && (!locationId || !z.location_id || z.location_id === locationId);
    });
  }, [zones]);

  const resolveAssignedTrail = useCallback((booking: any, requestedId?: string) => {
    const meta = parseMeta(booking?.notes);
    const routes = officialRoutesForLocation(booking?.location_id ?? activeLocationId);
    const route = requestedId
      ? routes.find((r: any) => r.id === requestedId)
      : meta.assignedTrailZoneId
        ? routes.find((r: any) => r.id === meta.assignedTrailZoneId)
        : routes.length === 1
          ? routes[0]
          : null;
    return {
      route: route ?? null,
      routes,
      auto: !requestedId && !meta.assignedTrailZoneId && routes.length === 1,
    };
  }, [activeLocationId, officialRoutesForLocation]);

  const acceptBooking = useMemo(
    () => pendingBookings.find((b: any) => b.id === acceptDialogId) ?? null,
    [acceptDialogId, pendingBookings],
  );
  const acceptRouteOptions = useMemo(
    () => acceptBooking ? officialRoutesForLocation(acceptBooking.location_id ?? activeLocationId) : [],
    [acceptBooking, activeLocationId, officialRoutesForLocation],
  );
  const acceptNeedsRouteSelection = acceptRouteOptions.length > 1;

  const BOOKING_STATUS_STYLE: Record<string, string> = {
    pending: 'bg-warning/20 text-warning',
    adjustment_pending: 'bg-sky-500/20 text-sky-600 dark:text-sky-400',
    confirmed: 'bg-primary/20 text-primary',
    started: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    cancelled: 'bg-destructive/20 text-destructive',
  };

  const BOOKING_STATUS_LABEL: Record<string, string> = {
    pending: '🆕 Pending',
    adjustment_pending: '⏳ Awaiting Hiker Confirmation',
    confirmed: '✅ Confirmed',
    started: '🥾 Check-in / Started',
    cancelled: '❌ Cancelled',
  };

  const PAY_STATUS_COLORS: Record<string, string> = {
    paid: 'bg-primary/20 text-primary',
    partial: 'bg-sky-500/20 text-sky-600 dark:text-sky-400',
    unpaid: 'bg-warning/20 text-warning',
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaysBookings = useMemo(
    () => allTabBookings.filter((b) => b.booking_date === todayStr && b.status !== 'cancelled'),
    [allTabBookings, todayStr],
  );

  const todaysPendingAttention = useMemo(
    () =>
      todaysBookings.filter((b) => {
        const m = parseMeta(b.notes);
        return b.status !== 'confirmed' || !m.onsiteStartConfirmed;
      }),
    [todaysBookings],
  );

  const bookingsPerDate = useMemo(() => {
    const map: Record<string, { total: number; pending: number; confirmed: number; started: number }> = {};
    for (const b of allTabBookings) {
      if (b.status === 'cancelled') continue;
      const key = b.booking_date;
      if (!map[key]) map[key] = { total: 0, pending: 0, confirmed: 0, started: 0 };
      map[key].total += 1;
      const m = parseMeta(b.notes);
      if (m.onsiteStartConfirmed) map[key].started += 1;
      else if (b.status === 'confirmed') map[key].confirmed += 1;
      else map[key].pending += 1;
    }
    return map;
  }, [allTabBookings]);

  const bookedDates = useMemo(
    () => Object.keys(bookingsPerDate).map((d) => new Date(`${d}T00:00:00`)),
    [bookingsPerDate],
  );

  const selectedDateKey = calendarDate ? format(calendarDate, 'yyyy-MM-dd') : '';
  const selectedDateBookings = useMemo(
    () =>
      selectedDateKey
        ? allTabBookings.filter((b) => b.booking_date === selectedDateKey && b.status !== 'cancelled')
        : [],
    [allTabBookings, selectedDateKey],
  );

  return (
    <div className="min-h-screen px-3 pb-12 pt-20 sm:px-4">
      <div className="container max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
              Admin <span className="text-gradient">Dashboard</span>
            </h1>
            <p className="text-muted-foreground">
              Monitor real-time hiker activity, manage zones, announcements, and guides.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              type="button"
              className="flex-1 gap-2 sm:flex-none"
              onClick={() => {
                setActiveTab('operations');
                setOperationsTab('scan');
                const next = new URLSearchParams(searchParams);
                next.set('tab', 'scan');
                next.delete('routeDraft');
                setSearchParams(next, { replace: true });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <ScanLine className="h-4 w-4" />
              Check In
            </Button>
            <div className="hidden sm:block">
              <AppDownloadButton />
            </div>
          </div>
        </motion.div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value);
            const next = new URLSearchParams(searchParams);
            if (value === 'operations') {
              setOperationsTab('requests');
              next.set('tab', 'requests');
            } else {
              next.set('tab', value);
            }
            if (value !== 'overview') next.delete('routeDraft');
            setSearchParams(next, { replace: true });
          }}
          className="flex w-full flex-col gap-6 md:flex-row"
        >
          <div className="w-full md:w-64 shrink-0 md:sticky md:top-24 h-max">
            <TabsList className="glass-card flex flex-row md:flex-col p-2 gap-1 h-auto w-full items-stretch justify-start overflow-x-auto overflow-y-hidden md:overflow-visible custom-scrollbar">
              <TabsTrigger value="overview" className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                <LayoutDashboard className="h-4 w-4 shrink-0" /> <span className="hidden md:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="operations" className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap relative">
                <ClipboardList className="h-4 w-4 shrink-0" /> <span className="hidden md:inline">Operations</span>
                {pendingCount > 0 && (
                  <span className="md:relative absolute top-0 right-0 md:top-auto md:right-auto md:ml-auto h-5 w-5 rounded-full bg-destructive text-white text-[10px] flex items-center justify-center font-bold shadow-sm">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="management" className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                <UserCog className="h-4 w-4 shrink-0" /> <span className="hidden md:inline">Management</span>
              </TabsTrigger>
              <TabsTrigger value="finance" className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                <DollarSign className="h-4 w-4 shrink-0" /> <span className="hidden md:inline">Finance</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-w-0">
          {/* ─────────────────────────────── BOOKINGS TAB ── */}
          
          <TabsContent value="overview" className="space-y-6 mt-0">
            <OverviewDashboard locationId={activeLocationId} />
          </TabsContent>

          <TabsContent value="operations" className="mt-0">
            <Tabs
              value={operationsTab}
              onValueChange={(value) => {
                const nextTab = value as 'requests' | 'scan' | 'live-map';
                setOperationsTab(nextTab);
                const next = new URLSearchParams(searchParams);
                next.set('tab', nextTab);
                next.delete('routeDraft');
                setSearchParams(next, { replace: true });
              }}
              className="space-y-4"
            >
              <div className="mb-4 overflow-x-auto pb-2">
                <TabsList className="glass-card">
                  <TabsTrigger value="requests">Bookings</TabsTrigger>
                  <TabsTrigger value="scan">QR Check-in</TabsTrigger>
                  <TabsTrigger value="live-map">Live Map</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="requests" className="space-y-4 mt-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">All Bookings</h2>
                <p className="text-sm text-muted-foreground">View and manage all booking records by status.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { void loadAllTabBookings(); void loadPendingBookings(); }} disabled={allTabLoading} className="gap-1.5">
                {allTabLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                Refresh
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name, booking ID, or date…"
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status Filter Chips */}
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending', count: pendingCount },
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'started', label: 'Check-in / Started' },
                { value: 'cancelled', label: 'Cancelled' },
              ].map(({ value, label, count }) => (
                <button
                  key={value}
                  onClick={() => setBookingTabFilter(value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all relative ${
                    bookingTabFilter === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border/30 text-muted-foreground hover:border-primary/30 hover:bg-primary/5'
                  }`}
                >
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-destructive text-white text-[9px] font-bold">
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Booking List */}
            {allTabLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTabBookings.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 className="h-12 w-12 text-primary/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No bookings found for this filter.</p>
              </div>
            ) : (
              <div className="space-y-4 mt-0">
                {filteredTabBookings.map((b) => {
                  const meta = parseMeta(b.notes);
                  const displayStatus = getDisplayStatus(b);
                  const isAdjusted = b.status === 'adjustment_pending';
                  return (
                    <Card
                      key={b.id}
                      className={`glass-card ${
                        displayStatus === 'pending' ? 'border-warning/20' :
                        displayStatus === 'adjustment_pending' ? 'border-sky-500/30' :
                        displayStatus === 'confirmed' ? 'border-primary/20' :
                        displayStatus === 'started' ? 'border-emerald-500/30' :
                        'border-destructive/10 opacity-80'
                      }`}
                    >
                      <CardContent className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BOOKING_STATUS_STYLE[displayStatus] || ''}`}>
                                {BOOKING_STATUS_LABEL[displayStatus] || displayStatus}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">{b.id.slice(0, 8)}…</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Hiker Name</p>
                                <p className="font-semibold truncate">{meta.fullName || b.emergency_contact_name || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Booking Date</p>
                                <p className="font-semibold">{b.booking_date}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Group Size</p>
                                <p className="font-semibold">{b.group_size} pax</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Phone</p>
                                <p className="font-semibold">{meta.phoneNumber || b.emergency_contact_phone || '—'}</p>
                              </div>
                              {meta.assignedGuide && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Assigned Guide</p>
                                  <p className="font-semibold">{meta.assignedGuide}</p>
                                </div>
                              )}
                              {meta.adjustedDate && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Proposed New Date</p>
                                  <p className="font-semibold text-primary">{meta.adjustedDate}</p>
                                </div>
                              )}
                              {meta.userNotes && (
                                <div className="col-span-2">
                                  <p className="text-xs text-muted-foreground">Notes</p>
                                  <p className="font-semibold truncate">{meta.userNotes}</p>
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Submitted: {new Date(b.created_at).toLocaleString()}
                            </p>
                          </div>

                          {/* Actions per status */}
                          <div className="flex flex-col gap-2 w-full sm:w-auto shrink-0">
                            {(displayStatus === 'pending' || displayStatus === 'adjustment_pending') && !isAdjusted && (
                              <>
                                <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                                  onClick={() => { setAcceptDialogId(b.id); setSelectedGuide(''); setSelectedTrailZoneId(''); }}>
                                  <UserCheck className="h-3.5 w-3.5" /> Accept & Assign Guide
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1.5 border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                                  onClick={() => { setAdjustDialogId(b.id); setAdjustDate(b.booking_date); }}>
                                  <CalendarClock className="h-3.5 w-3.5" /> Adjust Date/Time
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                                      <XCircle className="h-3.5 w-3.5" /> Reject
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Reject this booking?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        The booking for <strong>{b.booking_date}</strong> ({b.group_size} pax) will be cancelled.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={() => handleRejectBooking(b.id)}>
                                        Yes, Reject
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                            {displayStatus === 'confirmed' && (
                              <>
                                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingBooking(b)}>
                                  <FileText className="h-3.5 w-3.5" /> Edit details
                                </Button>
                                {meta.assignedGuide && (
                                  <Button size="sm" variant="outline" className="gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                                    onClick={() => {
                                      const gid = guides.find((g) => g.name === meta.assignedGuide)?.id ?? null;
                                      setReassignFor({ bookingId: b.id, guideName: meta.assignedGuide || null, guideId: gid, locationId: b.location_id ?? null });
                                    }}>
                                    <UserCog className="h-3.5 w-3.5" /> Reassign Guide
                                  </Button>
                                )}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                                      <XCircle className="h-3.5 w-3.5" /> Cancel Booking
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Cancel this confirmed booking?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will cancel the confirmed booking for <strong>{meta.fullName || b.emergency_contact_name}</strong> on <strong>{b.booking_date}</strong>. Slots will be restored.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={() => handleCancelConfirmedBooking(b.id)}>
                                        Yes, Cancel
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                            <Button size="sm" variant="outline" className="gap-1.5"
                              onClick={() => setChatBooking({ id: b.id, date: b.booking_date })}>
                              <MessageCircle className="h-3.5 w-3.5" /> Chat
                            </Button>
                            {duplicateWeekIds.has(b.id) && (
                              <Button size="sm" variant="outline" className="gap-1.5 text-amber-600 border-amber-500/40"
                                onClick={() => sendDuplicateWeekReminder(b)}>
                                <AlertTriangle className="h-3.5 w-3.5" /> Send dup-week reminder
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Accept + Assign Guide Dialog */}
            {acceptDialogId && (
              <div className="fixed inset-0 z-[3100] flex items-center justify-center bg-background/60 p-2 backdrop-blur-sm sm:p-4">
                <Card className="glass-card max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5 text-primary" /> Accept & Assign Guide
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 mt-0">
                    <p className="text-sm text-muted-foreground">Select an available guide to assign to this booking.</p>
                    <div className="space-y-2">
                      <Label>Assign Guide</Label>
                      <Select value={selectedGuide} onValueChange={setSelectedGuide}>
                        <SelectTrigger><SelectValue placeholder="Select a guide…" /></SelectTrigger>
                        <SelectContent>
                          {guides.filter((g) => g.status !== 'off-duty' && g.status !== 'off_duty').map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name} — <span className="capitalize">{g.status}</span> ({g.trail})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Official Route</Label>
                      {acceptRouteOptions.length === 0 ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          Publish an official route before confirming this booking.
                        </div>
                      ) : acceptRouteOptions.length === 1 ? (
                        <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm">
                          Auto-assigned: <span className="font-semibold">{acceptRouteOptions[0].name}</span>
                        </div>
                      ) : (
                        <Select value={selectedTrailZoneId} onValueChange={setSelectedTrailZoneId}>
                          <SelectTrigger><SelectValue placeholder="Select route for this hiker..." /></SelectTrigger>
                          <SelectContent>
                            {acceptRouteOptions.map((route: any) => (
                              <SelectItem key={route.id} value={route.id}>
                                {route.name} {route.difficulty ? `- ${route.difficulty}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 pt-2 min-[380px]:flex-row">
                      <Button variant="outline" className="flex-1" onClick={() => { setAcceptDialogId(null); setSelectedTrailZoneId(''); }} disabled={acceptSaving}>Cancel</Button>
                      <Button className="flex-1 gap-2" onClick={handleAcceptBooking} disabled={!selectedGuide || acceptRouteOptions.length === 0 || (acceptNeedsRouteSelection && !selectedTrailZoneId) || acceptSaving}>
                        {acceptSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Confirm & Notify Guide
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Adjust Date Dialog */}
            {adjustDialogId && (
              <div className="fixed inset-0 z-[3100] flex items-center justify-center bg-background/60 p-2 backdrop-blur-sm sm:p-4">
                <Card className="glass-card max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarClock className="h-5 w-5 text-sky-500" /> Adjust Booking Date/Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 mt-0">
                    <p className="text-sm text-muted-foreground">Propose a new schedule. The hiker will be asked to confirm or decline.</p>
                    <div className="space-y-2">
                      <Label htmlFor="adjustDate">New Date</Label>
                      <Input id="adjustDate" type="date" value={adjustDate} onChange={(e) => setAdjustDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
                    </div>
                    <div className="space-y-2">
                      <Label>New Start Time</Label>
                      <Select value={adjustTime} onValueChange={setAdjustTime}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['05:00 AM', '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM'].map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1" onClick={() => setAdjustDialogId(null)} disabled={adjustSaving}>Cancel</Button>
                      <Button className="flex-1 gap-2" onClick={handleAdjustBooking} disabled={!adjustDate || adjustSaving}>
                        {adjustSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                        Send to Hiker for Confirmation
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
              <TabsContent value="scan" className="space-y-6 mt-0">
            <div>
              <h2 className="text-lg font-semibold">Onsite QR Check-in</h2>
              <p className="text-sm text-muted-foreground">
                Scan QR code with camera, or search by Booking ID or hiker's full name. Payment recording is also done here.
              </p>
            </div>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" /> QR Scanner &amp; Lookup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <QRCameraScanner
                  onScan={(value) => { setQrInput(value); void handleQrLookup(); }}
                  manualInput={qrInput}
                  onManualInputChange={setQrInput}
                  onManualSubmit={handleQrLookup}
                  loading={scanLoading}
                />

                {scannedBooking && (() => {
                  const meta = parseMeta(scannedBooking.notes);
                  const { totalFee: baseTotalFee } = calculateFees(scannedBooking.group_size);
                  const peakExtensionFee = calculatePeakExtensionFee(meta.peakExtensionHours);
                  const totalFee = baseTotalFee + peakExtensionFee;
                  const payStatus = meta.paymentStatus ?? 'unpaid';
                  return (
                    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                          <span className="font-semibold text-primary">Booking Found</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${scannedBooking.status === 'confirmed' ? 'bg-primary/20 text-primary' : 'bg-warning/20 text-warning'}`}>
                          {scannedBooking.status}
                        </span>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
                        {[
                          { label: 'Full Name', value: meta.fullName || scannedBooking.emergency_contact_name || '—' },
                          { label: 'Group Size', value: `${scannedBooking.group_size} pax` },
                          { label: 'Booking Date', value: scannedBooking.booking_date },
                          { label: 'Start Time', value: meta.hikeTime || '—' },
                          { label: 'Hike Type', value: meta.hikeType === 'night' ? '🌙 Night Hike' : '☀️ Day Hike' },
                          { label: 'Age', value: meta.age || '—' },
                          { label: 'Phone', value: meta.phoneNumber || scannedBooking.emergency_contact_phone || '—' },
                          { label: 'Email', value: meta.emailAddress || '—' },
                          { label: 'Assigned Guide', value: meta.assignedGuide || 'Not yet assigned' },
                          { label: 'Preferred Guide', value: meta.preferredGuide || 'No preference' },
                          { label: 'Payment', value: `${payStatus.toUpperCase()} — ${formatPeso(meta.amountPaid ?? 0)} / ${formatPeso(totalFee)}` },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex justify-between border-b border-border/10 py-1.5">
                            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{label}</span>
                            <span className="font-semibold text-sm text-right max-w-[55%] truncate">{value}</span>
                          </div>
                        ))}
                      </div>

                      {meta.companions && meta.companions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Companions ({meta.companions.length})</p>
                          <div className="flex flex-wrap gap-2">
                            {meta.companions.map((c: string, i: number) => (
                              <span key={i} className="px-2.5 py-1 rounded-full text-xs bg-secondary/50 border border-border/20">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {meta.hasMinors && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
                          <Baby className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <span><strong>{meta.minorCount ?? 1} minor(s)</strong> in group — verify parental consent letter and parent ID onsite.</span>
                        </div>
                      )}

                      {meta.medicalNotes && (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs space-y-1">
                          <p className="font-bold text-destructive">Medical Notes</p>
                          <p className="text-muted-foreground">{meta.medicalNotes}</p>
                        </div>
                      )}

                      {scannedBooking.status === 'confirmed' && !meta.onsiteStartConfirmed && !hikeStarted && (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                          <div>
                            <p className="text-sm font-semibold">Trailhead verification</p>
                            <p className="text-xs text-muted-foreground">Review every companion and confirm the actual group before tracking begins.</p>
                          </div>
                          <div className="flex flex-col gap-2 min-[440px]:flex-row min-[440px]:items-center">
                            <Label className="shrink-0 text-xs">Headcount</Label>
                            <Input className="min-[440px]:w-28" type="number" min="1" value={checkInHeadcount} onChange={(event) => setCheckInHeadcount(event.target.value)} />
                            <span className="text-xs text-muted-foreground">Booked: {scannedBooking.group_size}</span>
                          </div>
                          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/40 bg-background/50 p-3 text-xs">
                            <Checkbox checked={checkInVerified} onCheckedChange={(checked) => setCheckInVerified(checked === true)} />
                            <span>I verified every person, their details, and the booked headcount.</span>
                          </label>
                        </div>
                      )}

                      {/* ── Reviews (guide + hiking experience) ── */}
                      <div className="rounded-xl border border-border/30 bg-secondary/10 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">Guide & Hiking Reviews</p>
                            <p className="text-xs text-muted-foreground">Recent ratings for this booking.</p>
                          </div>
                          {reviewsLoadingForScan ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <span className="text-[11px] text-muted-foreground">On</span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Guide Review</p>
                          {meta.assignedGuide ? (
                            guideRatingForScan ? (
                              <div className="rounded-lg border border-border/10 bg-secondary/30 p-3 space-y-2">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-lg font-bold text-primary">{guideRatingForScan.avgRating.toFixed(1)}</span>
                                  <span className="text-amber-500 text-sm leading-none" aria-hidden="true">{renderStars(guideRatingForScan.avgRating)}</span>
                                  <span className="text-xs text-muted-foreground">({guideRatingForScan.reviewCount} reviews)</span>
                                </div>
                                {guideRatingForScan.recentReviews.slice(0, 2).map((r, idx) => (
                                  <div key={`${r.hikerName}_${r.date}_${idx}`} className="space-y-0.5">
                                    <p className="text-xs font-semibold">
                                      {r.hikerName} <span className="text-[11px] font-normal text-muted-foreground">({r.date})</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">"{r.comment}"</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No guide reviews yet for {meta.assignedGuide}.</p>
                            )
                          ) : (
                            <p className="text-xs text-muted-foreground">Assigned guide not yet available.</p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Hiking Experience</p>
                          {reviewsLoadingForScan ? (
                            <p className="text-xs text-muted-foreground">Loading reviews...</p>
                          ) : hikingExperienceReviewsForScan.length > 0 ? (
                            <div className="space-y-2">
                              {hikingExperienceReviewsForScan.slice(0, 3).map((r) => (
                                <div key={r.id} className="rounded-lg border border-border/10 bg-secondary/30 p-3 space-y-1.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs font-semibold">{r.reviewer_name}</p>
                                    <div className="flex items-center gap-2">
                                      <span className="text-amber-500 text-xs" aria-hidden="true">
                                        {'★'.repeat(Math.round(r.rating))}{'☆'.repeat(5 - Math.round(r.rating))}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground">{Math.round(r.rating)}/5</span>
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground leading-relaxed">"{r.review_text}"</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No approved hiking reviews yet.</p>
                          )}
                        </div>
                      </div>

                      {/* ── Payment Recording (only here) ── */}
                      <div className="rounded-xl border border-border/30 bg-secondary/10 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-primary" /> Record / Update Payment
                          </p>
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setShowScanPayForm((v) => !v)}>
                            {showScanPayForm ? 'Hide' : 'Open Form'}
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Current: <span className={`font-bold px-1.5 py-0.5 rounded-full ${PAY_STATUS_COLORS[payStatus] || ''}`}>{payStatus.toUpperCase()}</span>
                          {' '}{formatPeso(meta.amountPaid ?? 0)} paid of {formatPeso(totalFee)}
                          {peakExtensionFee > 0 && <span> (includes {formatPeso(peakExtensionFee)} peak extension)</span>}
                        </div>
                        {showScanPayForm && (
                          <div className="space-y-3 pt-1">
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Amount Paid (₱)</Label>
                                <Input type="number" value={scanPayAmount} onChange={(e) => setScanPayAmount(e.target.value)} placeholder={String(totalFee)} />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Payment Method</Label>
                                <Select value={scanPayMethod} onValueChange={(v) => setScanPayMethod(v as PaymentMethod)}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="onsite">Pay Onsite (Cash)</SelectItem>
                                    <SelectItem value="gcash">GCash</SelectItem>
                                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <Label className="text-xs">Transaction ID / Reference (optional)</Label>
                                <Input value={scanPayTxId} onChange={(e) => setScanPayTxId(e.target.value)} placeholder="Ref. no. or receipt no." />
                              </div>
                            </div>
                            <Button className="w-full gap-2" onClick={handleScanRecordPayment} disabled={scanPaySaving || !scanPayAmount}>
                              {scanPaySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              Save Payment Record
                            </Button>
                            <p className="text-[10px] text-muted-foreground">Payment records are logged and tamper-proof once saved.</p>
                          </div>
                        )}
                      </div>

                      {/* Start Hike button */}
                      {meta.onsiteStartConfirmed || hikeStarted ? (
                        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                            <CheckCircle2 className="h-5 w-5" />
                            Group status: {meta.groupPhase ?? 'ascent'}.
                            {meta.onsiteStartTime && <span className="ml-auto text-xs font-normal text-muted-foreground">{new Date(meta.onsiteStartTime).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })} PHT</span>}
                          </div>
                          {meta.groupPhase === 'peak' && meta.peakDeadlineAt && (
                            <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                              Peak stay ends {new Date(meta.peakDeadlineAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })} PHT. Extension: {meta.peakExtensionHours ?? 0} hour(s), {formatPeso(calculatePeakExtensionFee(meta.peakExtensionHours))}.
                            </div>
                          )}
                          {(meta.groupPhase ?? 'ascent') === 'ascent' && <Button size="sm" className="w-full" onClick={() => void updateGroupPhase('peak')} disabled={lifecycleSaving}>Simulation: mark group at peak</Button>}
                          {meta.groupPhase === 'peak' && (
                            <div className="grid gap-2 min-[460px]:grid-cols-2">
                              <Button size="sm" variant="outline" onClick={() => void extendPeakStay()} disabled={lifecycleSaving}>Add 1 hour (+P100)</Button>
                              <Button size="sm" onClick={() => void updateGroupPhase('descent')} disabled={lifecycleSaving}>Guide starts descent</Button>
                            </div>
                          )}
                          {meta.groupPhase === 'descent' && (
                            <div className="space-y-3 rounded-lg border border-border/40 bg-background/50 p-3">
                              <p className="text-xs font-semibold">Trailhead closeout</p>
                              <div className="flex flex-col gap-2 min-[440px]:flex-row min-[440px]:items-center">
                                <Label className="shrink-0 text-xs">Returned headcount</Label>
                                <Input className="min-[440px]:w-28" type="number" min="1" value={checkOutHeadcount} onChange={(event) => setCheckOutHeadcount(event.target.value)} />
                                <span className="text-xs text-muted-foreground">Expected: {scannedBooking.group_size}</span>
                              </div>
                              <label className="flex cursor-pointer items-start gap-2 text-xs"><Checkbox checked={checkOutVerified} onCheckedChange={(checked) => setCheckOutVerified(checked === true)} /><span>All hikers are accounted for and payment has been reviewed.</span></label>
                              <Button size="sm" variant="outline" className="w-full" onClick={() => void completeGroupHike()} disabled={lifecycleSaving}>End hike and request guide review</Button>
                            </div>
                          )}
                        </div>
                      ) : scannedBooking.status !== 'confirmed' ? (
                        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          Booking is not confirmed yet. Confirm booking first before starting the hike.
                        </div>
                      ) : (
                        <Button className="w-full gap-2" onClick={handleStartHike} disabled={startingHike || !checkInVerified || Number(checkInHeadcount) !== Number(scannedBooking.group_size)}>
                          {startingHike ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Confirm Onsite Start — Begin Hike
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
              <TabsContent value="live-map" className="relative mt-0 h-[calc(100dvh-9rem)] min-h-[28rem] overflow-hidden rounded-lg border border-border/30 sm:min-h-[600px]">
            <RealtimeMonitorMap locationId={activeLocationId} canAddCheckpoints={false} />
          </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="management" className="mt-0">
            <Tabs defaultValue="guides" className="space-y-4">
              <div className="mb-4 overflow-x-auto pb-2">
                <TabsList className="glass-card">
                  <TabsTrigger value="guides">Guide Roster</TabsTrigger>
                  <TabsTrigger value="announcements">Announcements</TabsTrigger>
                  <TabsTrigger value="capacity">Daily Capacity</TabsTrigger>
                  <TabsTrigger value="forecasting">Prophet Forecasting</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="guides" className="space-y-6 mt-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div>
                <h2 className="text-lg font-semibold">Local Guide Roster</h2>
                <p className="text-sm text-muted-foreground">Manage guide availability and view their hike history.</p>
              </div>
              <Badge variant="outline" className="text-primary border-primary/30">
                {guides.filter((g) => g.status === 'available').length} available
              </Badge>
            </div>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" /> Add Guide
                </CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-2">
                <Input placeholder="Full name *" value={newGuideName} onChange={(e) => setNewGuideName(e.target.value)} />
                <Input placeholder="Login email *" type="email" value={newGuideEmail} onChange={(e) => setNewGuideEmail(e.target.value)} />
                <Input placeholder="Temp password (min 8) *" type="text" value={newGuidePassword} onChange={(e) => setNewGuidePassword(e.target.value)} />
                <Input placeholder="Phone" value={newGuidePhone} onChange={(e) => setNewGuidePhone(e.target.value)} />
                <Input placeholder="Per-trip fee (PHP)" type="number" value={newGuideFee} onChange={(e) => setNewGuideFee(e.target.value)} />
                <div className="text-xs text-muted-foreground self-center px-1">
                  Trail: <span className="text-foreground font-medium">{locations.find((l) => l.id === activeLocationId)?.name || 'Pick active location'}</span> (auto-assigned)
                </div>

                <p className="sm:col-span-2 text-[11px] text-muted-foreground self-center">
                  Creates a real sign-in account for this guide at the currently active location. Share the temp password with them.
                </p>
                <Button onClick={handleAddGuide} disabled={addGuideSaving}>
                  {addGuideSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Add Guide
                </Button>
              </CardContent>
            </Card>

            {/* Guide search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search guides by name or trail…" value={guideSearch} onChange={(e) => setGuideSearch(e.target.value)} className="pl-9" />
            </div>

            <div className="grid min-w-0 sm:grid-cols-2 gap-4">
              {filteredGuides.map((guide) => (
                <Card key={guide.id} className={`min-w-0 glass-card cursor-pointer transition-all ${selectedGuideId === guide.id ? 'border-primary/50 ring-1 ring-primary/30' : ''}`}>
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary font-bold text-lg">
                          {guide.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="break-words font-semibold">{guide.name}</p>
                          <p className="break-all text-xs text-muted-foreground">{guide.phone}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${GUIDE_STATUS_STYLES[guide.status]}`}>
                        {guide.status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-secondary/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Assigned Trail</p>
                        <p className="font-medium truncate">{guide.trail}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Total Hikes</p>
                        <p className="font-medium">{guide.totalHikes}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" className="min-w-0 px-2 text-xs" onClick={() => cycleGuideStatus(guide.id)}>
                        <UserCog className="h-3.5 w-3.5 mr-1.5" /> Change Status
                      </Button>
                      <Button variant="outline" size="sm" className="min-w-0 px-2 text-xs" onClick={() => handleSelectGuide(guide)}>
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                        {selectedGuideId === guide.id ? 'Hide History' : 'View History'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="col-span-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setRemoveGuideId(guide.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Floating guide history panel */}
            {selectedGuideId && (
              <div className="fixed inset-x-3 bottom-3 top-20 z-40 overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-24 sm:w-[360px] sm:max-w-[90vw]">
                <Card className="glass-card border-primary/20 shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      {guides.find((g) => g.id === selectedGuideId)?.name} — Hike History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                  {guideHistoryLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : guideHistoryBookings.length === 0 ? (
                    <div className="text-center py-10">
                      <Mountain className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No bookings found for this guide yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
                      {guideHistoryBookings.map((b) => {
                        const meta = parseMeta(b.notes);
                        return (
                          <div key={b.id} className="rounded-xl border border-border/20 bg-secondary/10 p-4 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div>
                                <p className="font-semibold text-sm">{meta.fullName || b.emergency_contact_name || '—'}</p>
                                <p className="text-xs text-muted-foreground">{b.booking_date} • {b.group_size} pax • {meta.hikeType === 'night' ? '🌙 Night' : '☀️ Day'} Hike</p>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${BOOKING_STATUS_STYLE[b.status] || ''}`}>
                                {b.status}
                              </span>
                            </div>
                            {meta.userNotes && (
                              <div className="text-xs bg-secondary/30 rounded-lg p-2.5">
                                <p className="text-muted-foreground font-semibold mb-0.5 uppercase tracking-wide text-[10px]">Hiker Notes / Feedback</p>
                                <p>{meta.userNotes}</p>
                              </div>
                            )}
                            {meta.medicalNotes && (
                              <div className="text-xs bg-destructive/5 border border-destructive/15 rounded-lg p-2.5 text-destructive">
                                <p className="font-semibold mb-0.5 uppercase tracking-wide text-[10px]">Medical Notes</p>
                                <p>{meta.medicalNotes}</p>
                              </div>
                            )}
                            {meta.onsiteStartConfirmed && (
                              <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                <CheckCircle2 className="h-3 w-3" />
                                Hike started {meta.onsiteStartTime ? format(new Date(meta.onsiteStartTime), 'MMM d, yyyy h:mm a') : '—'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Guide summary */}
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Guide Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  {[
                    { label: 'Available', count: guides.filter((g) => g.status === 'available').length, color: 'text-primary' },
                    { label: 'On Duty', count: guides.filter((g) => g.status === 'on-duty').length, color: 'text-sky-500' },
                    { label: 'Off Duty', count: guides.filter((g) => g.status === 'off-duty').length, color: 'text-muted-foreground' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-secondary/30 border border-border/20 py-4">
                      <p className={`text-3xl font-bold ${s.color}`}>{s.count}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <AdminOffDutyApprovals />
          </TabsContent>
              <TabsContent value="announcements" className="space-y-6 mt-0">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Post Announcement</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={annType} onValueChange={(v) => setAnnType(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">ℹ️ Info / General</SelectItem>
                        <SelectItem value="warning">⚠️ Weather Warning</SelectItem>
                        <SelectItem value="closure">🚫 Trail Closure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="annTitle">Title</Label>
                    <Input id="annTitle" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="e.g. Trail Closure Notice" maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="annBody">Message</Label>
                    <Textarea id="annBody" value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Describe the announcement in detail..." rows={4} maxLength={500} />
                    <p className="text-xs text-muted-foreground">{annBody.length}/500</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="annStartDate">Show From (optional)</Label>
                      <Input id="annStartDate" type="date" value={annStartDate} onChange={(e) => setAnnStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="annEndDate">Expires On (optional)</Label>
                      <Input id="annEndDate" type="date" value={annEndDate} onChange={(e) => setAnnEndDate(e.target.value)} min={annStartDate || undefined} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-secondary/20 p-3">
                    <Checkbox id="annImportant" checked={annImportant} onCheckedChange={(v) => setAnnImportant(!!v)} />
                    <Label htmlFor="annImportant" className="text-sm cursor-pointer">Mark as important (show on user dashboard)</Label>
                  </div>
                  <Button className="w-full gap-2" onClick={postAnnouncement} disabled={annSending}>
                    {annSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Post Announcement
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Recent Announcements</CardTitle></CardHeader>
                <CardContent>
                  {announcements.length === 0 ? (
                    <div className="text-center py-12">
                      <Megaphone className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No announcements posted yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {announcements.map((a) => (
                        <div key={a.id} className={`rounded-xl border p-4 relative ${ANNOUNCEMENT_TYPE_STYLES[a.type]}`}>
                          <button onClick={() => deleteAnnouncement(a.id)} className="absolute top-3 right-3 text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete announcement">
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <div className="flex items-center gap-2 mb-1">
                            {a.type === 'warning' && <AlertTriangle className="h-3.5 w-3.5" />}
                            {a.type === 'closure' && <AlertTriangle className="h-3.5 w-3.5" />}
                            {a.type === 'info' && <CheckCircle2 className="h-3.5 w-3.5" />}
                            <span className="font-semibold text-sm">{a.title}</span>
                            {a.isImportant && <Badge className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">Important</Badge>}
                          </div>
                          <p className="text-sm leading-relaxed opacity-90">{a.body}</p>
                          <p className="text-xs opacity-60 mt-2">{format(new Date(a.created_at), 'MMM d, yyyy • h:mm a')}</p>
                          {(a.starts_at || a.expires_at) && (
                            <p className="text-xs opacity-70 mt-1">
                              Visible: {a.starts_at ? format(new Date(a.starts_at), 'MMM d, yyyy') : 'Now'} - {a.expires_at ? format(new Date(a.expires_at), 'MMM d, yyyy') : 'No expiry'}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
              <TabsContent value="capacity" className="space-y-6 mt-0">
            <div>
              <h2 className="text-lg font-semibold">Daily Hiker Capacity</h2>
              <p className="text-sm text-muted-foreground">Set the maximum number of hikers allowed per day. Default is 100 if not set.</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-primary" /> Set Limit for a Date</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Choose a future date and set how many total hiker slots are available. This updates the booking calendar in real-time.</p>
                  <div className="space-y-2">
                    <Label htmlFor="capDate">Date</Label>
                    <Input id="capDate" type="date" value={capDate} onChange={(e) => setCapDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capMax">Max Hikers Per Day</Label>
                    <Input id="capMax" type="number" min={1} max={500} value={capMax} onChange={(e) => setCapMax(Math.max(1, parseInt(e.target.value) || 1))} placeholder="100" className="font-bold text-lg h-12" />
                    <p className="text-xs text-muted-foreground">Setting a lower number restricts new bookings once the count is reached.</p>
                  </div>
                  <Button className="w-full gap-2" onClick={saveCapacity} disabled={capSaving || !capDate}>
                    {capSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
                    Save Capacity Limit
                  </Button>
                  <div className="h-px bg-border/30 my-2" />
                  <p className="text-sm font-semibold">Bulk date-range update</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="capRangeStart">Start Date</Label>
                      <Input id="capRangeStart" type="date" value={capRangeStart} onChange={(e) => setCapRangeStart(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="capRangeEnd">End Date</Label>
                      <Input id="capRangeEnd" type="date" value={capRangeEnd} onChange={(e) => setCapRangeEnd(e.target.value)} min={capRangeStart || format(new Date(), 'yyyy-MM-dd')} />
                    </div>
                  </div>
                  <Button variant="secondary" className="w-full gap-2" onClick={saveCapacityRange} disabled={capSaving || !capRangeStart || !capRangeEnd}>
                    {capSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
                    Apply to Date Range
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" /> Upcoming Limits</CardTitle></CardHeader>
                <CardContent>
                  {upcomingCapacities.length === 0 ? (
                    <div className="text-center py-12">
                      <SlidersHorizontal className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No custom limits set. All dates use the default of 100 hikers/day.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {upcomingCapacities.map((cap) => {
                        const available = Math.max(0, cap.max_capacity - cap.current_count);
                        const ratio = cap.max_capacity > 0 ? available / cap.max_capacity : 0;
                        const statusColor = available === 0
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : ratio <= 0.3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
                        return (
                          <div key={cap.id} className="flex items-center justify-between p-3 rounded-xl border border-border/20 bg-secondary/20">
                            <div className="space-y-0.5">
                              <p className="text-sm font-semibold">{cap.date}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Booked: <strong>{cap.current_count}</strong> / {cap.max_capacity}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>{available === 0 ? 'Full' : `${available} left`}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-border/30 overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${ratio <= 0.3 ? 'bg-amber-500' : ratio === 0 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${(cap.current_count / cap.max_capacity) * 100}%` }} />
                              </div>
                              <button onClick={() => deleteCapacityLimit(cap.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label={`Remove limit for ${cap.date}`}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="glass-card border-primary/20">
              <CardContent className="p-4">
                <div className="flex gap-3 items-start text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">How it works:</strong>{' '}
                    When a booking is confirmed, slots are automatically deducted. When cancelled, they are restored. Hikers see live availability on the booking calendar.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="forecasting" className="space-y-6 mt-0">
            <ForecastingTab locationId={activeLocationId} />
          </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="finance" className="mt-0">
            
            <PaymentSummaryTab />
          
          </TabsContent>

          </div>
        </Tabs>
      </div>

      {/* Floating collapsible booking calendar */}
      <div className={`${calendarFloatingOpen ? 'block' : 'hidden'} fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-3 right-3 z-[2040] sm:block sm:left-auto sm:right-4 sm:w-[360px] sm:max-w-[92vw]`}>
        <Card className="glass-card border-primary/30 shadow-xl overflow-hidden">
          <button
            onClick={() => setCalendarFloatingOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-primary/10 hover:bg-primary/15 transition-colors"
            aria-expanded={calendarFloatingOpen}
          >
            <span className="text-sm font-semibold flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Booking Calendar
            </span>
            {calendarFloatingOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>

          {calendarFloatingOpen && (
            <CardContent className="max-h-[min(70dvh,36rem)] space-y-3 overflow-y-auto p-3">
              <Calendar
                mode="single"
                selected={calendarDate}
                onSelect={setCalendarDate}
                className="w-full"
                classNames={{
                  months: 'flex flex-col',
                  month: 'w-full',
                  table: 'w-full',
                  head_row: 'grid grid-cols-7',
                  row: 'grid grid-cols-7 mt-2',
                  cell: 'h-10',
                }}
                modifiers={{ booked: bookedDates }}
                modifiersClassNames={{ booked: 'bg-primary/15 text-primary font-bold border border-primary/30 rounded-md' }}
              />
              <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                <div className="rounded-lg border border-border/20 bg-secondary/20 p-1.5">
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-sm font-bold">{bookingsPerDate[selectedDateKey]?.total || 0}</p>
                </div>
                <div className="rounded-lg border border-border/20 bg-secondary/20 p-1.5">
                  <p className="text-muted-foreground">Pending</p>
                  <p className="text-sm font-bold text-amber-500">{bookingsPerDate[selectedDateKey]?.pending || 0}</p>
                </div>
                <div className="rounded-lg border border-border/20 bg-secondary/20 p-1.5">
                  <p className="text-muted-foreground">Confirmed</p>
                  <p className="text-sm font-bold text-primary">{bookingsPerDate[selectedDateKey]?.confirmed || 0}</p>
                </div>
                <div className="rounded-lg border border-border/20 bg-secondary/20 p-1.5">
                  <p className="text-muted-foreground">Started</p>
                  <p className="text-sm font-bold text-emerald-500">{bookingsPerDate[selectedDateKey]?.started || 0}</p>
                </div>
              </div>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                {selectedDateBookings.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No bookings on this date.</p>
                ) : (
                  selectedDateBookings.map((b) => {
                    const meta = parseMeta(b.notes);
                    const started = !!meta.onsiteStartConfirmed;
                    return (
                      <div key={b.id} className="rounded-lg border border-border/20 p-2 text-xs bg-secondary/10">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold truncate">{meta.fullName || b.emergency_contact_name || '—'}</p>
                          <Badge className={started ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : BOOKING_STATUS_STYLE[b.status] || ''}>
                            {started ? 'started' : b.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {chatBooking && (
        <BookingChat
          bookingId={chatBooking.id}
          bookingDate={chatBooking.date}
          open={!!chatBooking}
          onOpenChange={(o) => !o && setChatBooking(null)}
          isAdmin
          onAfterReschedule={() => { setChatBooking(null); void loadAllTabBookings(); }}
        />
      )}

      {reassignFor && (
        <ReassignGuideDialog
          bookingId={reassignFor.bookingId}
          currentGuideId={reassignFor.guideId}
          currentGuideName={reassignFor.guideName}
          locationId={reassignFor.locationId}
          open={!!reassignFor}
          onClose={() => setReassignFor(null)}
          onDone={() => { void loadAllTabBookings(); }}
        />
      )}
      <EditBookingDialog
        booking={editingBooking}
        open={!!editingBooking}
        onClose={() => setEditingBooking(null)}
        onDone={() => void loadAllTabBookings()}
      />
    </div>
  );
}

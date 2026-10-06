import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  ADMIN_CHECKIN_TOKEN_PREFIX,
  isAdminAuthorizedSession,
  makeAdminCheckInToken,
} from '@/lib/tracking/sessionAuthorization';
import { useLocations } from '@/hooks/useLocations';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  UserX,
  Copy,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  TrendingUp,
  User,
  LogOut,
  Sun,
  Moon,
  Bell,
  Timer,
  Compass,
  ShieldAlert,
  ArrowDown,
} from 'lucide-react';
import BookingChat from '@/components/booking/BookingChat';
import ReassignGuideDialog from '@/components/booking/ReassignGuideDialog';
import { assignGuideToBooking } from '@/lib/guideAssignmentService';
import EditBookingDialog from '@/components/booking/EditBookingDialog';
import { AdminOffDutyApprovals } from '@/components/booking/OffDutyManager';
import AdminUserManagement from '@/components/admin/AdminUserManagement';
import ImportantAnnouncements from '@/components/common/ImportantAnnouncements';
import { useAuth } from '@/hooks/useAuth';
import { parseMeta, encodeMeta } from '@/lib/bookingMeta';
import { calculateFees, calculatePeakExtensionFee, formatPeso, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/payments';
import { addAnnouncement, fetchAnnouncementsFromDb, loadAnnouncements, removeAnnouncement, visibleAnnouncements, type AdminAnnouncement, type AnnouncementTarget } from '@/lib/announcements';
import { validateCapacitySplit } from '@/lib/dailyCapacity';
import { writeActivityLog } from '@/lib/activity-log';
import { confirmReservation } from '@/lib/notification-service';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { officialRoutesForLocation as filterOfficialRoutes, selectAssignedOfficialRoute } from '@/lib/officialRoutes';
import { loadGuideRatings, renderStars, type GuideRating } from '@/lib/guideRatings';
import { getHikeTypeLabel } from '@/lib/hikeSchedule';
import { guidePhotoForName } from '@/lib/guideDirectory';
import { setGuideAccountActiveAtLocation } from '@/lib/guideManagement';
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
import HikeAnalytics from '@/components/admin/HikeAnalytics';
const CentralAccountManagement = lazy(() => import('@/components/admin/CentralAccountManagement'));
const CentralAnalyticsReporting = lazy(() => import('@/components/admin/CentralAnalyticsReporting'));
const CentralPricingManagement = lazy(() => import('@/components/admin/CentralPricingManagement'));
import { coalescedRefresh } from '@/lib/coalescedRefresh';
import MDRRMOAccessAudit from '@/components/admin/MDRRMOAccessAudit';
import PaymentSummaryTab from '@/components/admin/PaymentSummaryTab';
// ForecastingTab removed per user request
import AdminWalkInRegistrationDialog from '@/components/admin/AdminWalkInRegistrationDialog';
import EditPaymentDialog from '@/components/booking/EditPaymentDialog';
import { bookingReceipt } from '@/lib/bookingReceipt';
import EndHikeSettlementDialog from '@/components/admin/EndHikeSettlementDialog';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/common/PullToRefreshIndicator';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7'];
const DISPATCH_ROUTE_FIELDS = 'id,location_id,name,status,is_official,review_status,coordinates_json,difficulty,max_capacity';

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
  if (['operations', 'requests', 'scan', 'live-map', 'sessions'].includes(tab)) return 'operations';
  if (['management', 'users', 'guides', 'announcements', 'accounts', 'pricing', 'reports'].includes(tab)) return 'management';
  if (['finance', 'payment-summary'].includes(tab)) return 'finance';
  return 'overview';
};

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeEditorRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState(getMappedTab(searchParams.get('tab') || 'overview'));
  const [operationsTab, setOperationsTab] = useState<'requests' | 'scan' | 'live-map' | 'sessions'>(() => {
    const initialTab = searchParams.get('tab');
    return initialTab === 'scan' || initialTab === 'live-map' || initialTab === 'sessions' ? initialTab : 'requests';
  });
  const [managementTab, setManagementTab] = useState<string>(() => {
    const initialTab = searchParams.get('tab');
    return ['users', 'guides', 'announcements', 'accounts', 'pricing', 'reports'].includes(initialTab || '')
      ? initialTab!
      : 'guides';
  });
  /* ── Overview state ── */
  const [bookings, setBookings] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);

  /* ── Announcements state ── */
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annType, setAnnType] = useState<'info' | 'warning' | 'closure'>('info');
  const [annImportant, setAnnImportant] = useState(false);
  const [annTarget, setAnnTarget] = useState<AnnouncementTarget>('all');
  const [annStartDate, setAnnStartDate] = useState('');
  const [annEndDate, setAnnEndDate] = useState('');
  const [annSending, setAnnSending] = useState(false);

  /* ── Guide state ── */
  /* ── Real guides loaded from DB, mapped to the legacy UI shape ── */
  const { activeLocationId, activeLocation, isSuperAdmin, locations, setActiveLocationId, loading: locationsLoading } = useLocations();
  const { user: adminUser, role, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  type UIGuide = { id: string; name: string; phone: string; status: string; trail: string; totalHikes: number; user_id: string | null; per_trip_fee: number; location_id: string | null; is_active: boolean; photo_url?: string | null };
  const trailheadLocations = locations.filter((loc) => ['lamot-1', 'lamot-2', 'sto-tomas'].includes(loc.slug));
  const analyticsLocationIds = locationsLoading ? [] : activeLocationId ? [activeLocationId] : isSuperAdmin ? trailheadLocations.map((loc) => loc.id) : [];
  const [guides, setGuides] = useState<UIGuide[]>([]);
  const [chatBooking, setChatBooking] = useState<{ id: string; date: string } | null>(null);
  const [reassignFor, setReassignFor] = useState<{ bookingId: string; guideName: string | null; guideId: string | null; locationId: string | null } | null>(null);
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [editingPaymentBooking, setEditingPaymentBooking] = useState<any | null>(null);
  const [endHikeBooking, setEndHikeBooking] = useState<any | null>(null);
  const [companionQROpen, setCompanionQROpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);

  /* ── Hike Sessions state for this station site ── */
  interface SiteHikeSession {
    id: string;
    bookingId: string;
    locationId: string | null;
    hikerName: string;
    hikerPhone: string;
    groupSize: number;
    guideName: string;
    startTime: string;
    endTime: string | null;
    status: string;
    trackingPhase: string;
    trailName: string;
    booking?: any;
  }
  const [siteSessions, setSiteSessions] = useState<SiteHikeSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionPhaseFilter, setSessionPhaseFilter] = useState<'all' | 'active' | 'completed'>('all');

  const loadSiteSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      let q = supabase
        .from('hiker_sessions')
        .select('id, booking_id, user_id, location_id, participant_role, tracking_phase, start_time, end_time, status')
        .order('start_time', { ascending: false })
        .limit(100);

      if (activeLocationId) {
        q = q.eq('location_id', activeLocationId);
      }

      const { data: rawSessions, error } = await q;
      if (error) throw error;

      const bookingIds = Array.from(new Set((rawSessions ?? []).map((s) => s.booking_id).filter(Boolean)));
      const bookingMap: Record<string, any> = {};
      if (bookingIds.length > 0) {
        const { data: bData } = await supabase
          .from('bookings')
          .select('id, notes, status, group_size, booking_date, emergency_contact_name, emergency_contact_phone, location_id')
          .in('id', bookingIds);
        (bData ?? []).forEach((b) => {
          bookingMap[b.id] = b;
        });
      }

      const groupMap = new Map<string, SiteHikeSession>();
      (rawSessions ?? []).forEach((s) => {
        if (!s.booking_id) return;
        const b = bookingMap[s.booking_id];
        const meta = parseMeta(b?.notes);
        if (!groupMap.has(s.booking_id)) {
          groupMap.set(s.booking_id, {
            id: s.id,
            bookingId: s.booking_id,
            locationId: s.location_id || b?.location_id || activeLocationId,
            hikerName: meta.fullName || b?.emergency_contact_name || 'Hiker Group',
            hikerPhone: meta.phoneNumber || b?.emergency_contact_phone || '—',
            groupSize: Number(b?.group_size) || 1,
            guideName: meta.assignedGuide || 'Assigned Mountain Guide',
            startTime: s.start_time || new Date().toISOString(),
            endTime: s.end_time || null,
            status: s.status || 'active',
            trackingPhase: s.tracking_phase || 'ascent',
            trailName: meta.assignedTrailName || 'Official Route',
            booking: b,
          });
        } else {
          const existing = groupMap.get(s.booking_id)!;
          if (s.status === 'active' && existing.status !== 'active') {
            existing.status = 'active';
            existing.trackingPhase = s.tracking_phase || existing.trackingPhase;
          }
        }
      });

      setSiteSessions(Array.from(groupMap.values()));
    } catch (err) {
      console.warn('loadSiteSessions error:', err);
    } finally {
      setSessionsLoading(false);
    }
  }, [activeLocationId]);

  useEffect(() => {
    void loadSiteSessions();
  }, [loadSiteSessions]);

  const activeSiteSessions = useMemo(() => {
    return siteSessions.filter((s) => s.status === 'active');
  }, [siteSessions]);

  const filteredSiteSessions = useMemo(() => {
    return siteSessions.filter((s) => {
      if (sessionPhaseFilter === 'active' && s.status !== 'active') return false;
      if (sessionPhaseFilter === 'completed' && s.status !== 'completed') return false;
      if (!sessionSearch.trim()) return true;
      const q = sessionSearch.toLowerCase();
      return (
        s.hikerName.toLowerCase().includes(q) ||
        s.bookingId.toLowerCase().includes(q) ||
        s.guideName.toLowerCase().includes(q) ||
        s.trailName.toLowerCase().includes(q)
      );
    });
  }, [siteSessions, sessionPhaseFilter, sessionSearch]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const mappedTab = getMappedTab(tab || 'overview');
    if (mappedTab !== activeTab) setActiveTab(mappedTab);
    if (tab === 'requests' || tab === 'scan' || tab === 'live-map' || tab === 'sessions') {
      if (tab !== operationsTab) setOperationsTab(tab);
    }
    if (['users', 'guides', 'announcements', 'accounts', 'pricing', 'reports'].includes(tab || '')) {
      if (tab !== managementTab) setManagementTab(tab!);
    }
  }, [activeTab, operationsTab, managementTab, searchParams]);

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
  const [capDayMax, setCapDayMax] = useState(70);
  const [capNightMax, setCapNightMax] = useState(30);
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
  const [guideActivationSavingId, setGuideActivationSavingId] = useState<string | null>(null);
  const [removeGuideId, setRemoveGuideId] = useState<string | null>(null);
  const [removeGuidePassword, setRemoveGuidePassword] = useState('');
  const [guideInvite, setGuideInvite] = useState<{ name: string; email: string; link: string; message: string } | null>(null);

  // Accept flow
  const [acceptDialogId, setAcceptDialogId] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide] = useState('');
  const [selectedTrailZoneId, setSelectedTrailZoneId] = useState('');
  const [acceptSaving, setAcceptSaving] = useState(false);

  // Adjust flow
  const [adjustDialogId, setAdjustDialogId] = useState<string | null>(null);
  const [adjustDate, setAdjustDate] = useState('');
  const [adjustTime, setAdjustTime] = useState('06:00 AM');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);

  /* ── Computed: Derived lists ── */
  const filteredTabBookings = useMemo(() => {
    let list = allTabBookings;
    if (bookingTabFilter === 'started') {
      list = list.filter((b) => {
        const m = parseMeta(b.notes);
        return m.onsiteStartConfirmed && b.status !== 'completed' && m.groupPhase !== 'completed' && !m.hikeCompletedAt;
      });
    } else if (bookingTabFilter === 'completed') {
      list = list.filter((b) => {
        const m = parseMeta(b.notes);
        return b.status === 'completed' || m.groupPhase === 'completed' || Boolean(m.hikeCompletedAt);
      });
    } else if (bookingTabFilter === 'pending') {
      list = list.filter((b) => b.status === 'pending' || b.status === 'adjustment_pending');
    } else if (bookingTabFilter === 'confirmed') {
      list = list.filter((b) => {
        const m = parseMeta(b.notes);
        return b.status === 'confirmed' && !m.onsiteStartConfirmed && b.status !== 'completed' && m.groupPhase !== 'completed';
      });
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
          b.booking_date.includes(q) ||
          (m.phoneNumber || b.emergency_contact_phone || '').includes(q) ||
          (m.assignedGuide || '').toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [allTabBookings, bookingTabFilter, bookingSearch]);

  const pendingCount = useMemo(
    () => allTabBookings.filter((b) => b.status === 'pending' || b.status === 'adjustment_pending').length,
    [allTabBookings],
  );

  const completedCount = useMemo(
    () => allTabBookings.filter((b) => {
      const m = parseMeta(b.notes);
      return b.status === 'completed' || m.groupPhase === 'completed' || Boolean(m.hikeCompletedAt);
    }).length,
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
          b.id.toLowerCase().includes(q) ||
          (m.phoneNumber || b.emergency_contact_phone || '').includes(q)
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
    if (locationsLoading || (!isSuperAdmin && !activeLocationId)) return;
    void loadData();
    void loadAllTabBookings();
    void loadPendingBookings();
    void loadUpcomingCapacities();
    setAnnouncements(loadAnnouncements(role));
    void fetchAnnouncementsFromDb().then((items) => setAnnouncements(visibleAnnouncements(items, role)));

    // Listen for realtime booking changes & assignments with immediate optimistic state update
    const refresh = coalescedRefresh(async () => { await Promise.all([loadAllTabBookings(), loadPendingBookings(), loadData(), loadSiteSessions()]); });
    const ch = supabase
      .channel(`admin-bookings-live-${activeLocationId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const newBooking = payload.new as any;
          if (activeLocationId ? newBooking.location_id !== activeLocationId : !isSuperAdmin || !trailheadLocations.some((loc) => loc.id === newBooking.location_id)) return;
          const meta = parseMeta(newBooking.notes);
          toast.info(`🔔 New Booking: ${meta.fullName || newBooking.emergency_contact_name || 'Hiker'} (${newBooking.booking_date})`);
          setAllTabBookings((prev) => {
            if (prev.some((b) => b.id === newBooking.id)) return prev;
            return [newBooking, ...prev];
          });
          if (newBooking.status === 'pending' || newBooking.status === 'adjustment_pending') {
            setPendingBookings((prev) => {
              if (prev.some((b) => b.id === newBooking.id)) return prev;
              return [newBooking, ...prev];
            });
          }
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          const updated = payload.new as any;
          setAllTabBookings((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
          setPendingBookings((prev) => {
            if (updated.status !== 'pending' && updated.status !== 'adjustment_pending') {
              return prev.filter((b) => b.id !== updated.id);
            }
            return prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b));
          });
        } else if (payload.eventType === 'DELETE' && payload.old) {
          const oldId = (payload.old as any).id;
          setAllTabBookings((prev) => prev.filter((b) => b.id !== oldId));
          setPendingBookings((prev) => prev.filter((b) => b.id !== oldId));
        }
        refresh.schedule();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_assignments' }, () => {
        refresh.schedule();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hiker_sessions' }, () => {
        refresh.schedule();
      })
      .subscribe();

    return () => {
      refresh.dispose();
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocationId, locationsLoading, isSuperAdmin]);

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
    if (!isSuperAdmin && !activeLocationId) {
      setAllTabBookings([]);
      setAllTabLoading(false);
      return;
    }
    let q: any = supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (activeLocationId) q = q.eq('location_id', activeLocationId);
    else if (isSuperAdmin) q = q.in('location_id', trailheadLocations.map((loc) => loc.id));
    const { data } = await q;
    if (data) {
      setAllTabBookings((prev) => {
        const existingIds = new Set(data.map((d: any) => d.id));
        const missingRealtime = prev.filter((p) => !existingIds.has(p.id));
        return [...missingRealtime, ...data];
      });
    }
    setAllTabLoading(false);
  };

  /* ── QR Scan: lookup booking ── */
  const handleQrLookup = async (overrideValue?: string) => {
    if (locationsLoading) { toast.info('Your assigned location is still loading.'); return; }
    const raw = (typeof overrideValue === 'string' ? overrideValue : qrInput).trim();
    if (!raw) { toast.error('Enter QR code data, booking ID, or hiker name.'); return; }
    let q = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.bookingId) q = parsed.bookingId;
      else if (parsed?.id) q = parsed.id;
    } catch {
      // Plain booking IDs are valid scanner input when the payload is not JSON.
    }

    setScanLoading(true);
    setScannedBooking(null);
    setHikeStarted(false);
    setShowScanPayForm(false);

    let exactQuery: any = supabase
      .from('bookings')
      .select('*')
      .or(`qr_code_data.eq.${raw},qr_code_data.eq.${q},id.eq.${q}`)
      .limit(1);
    if (!isSuperAdmin) {
      if (!activeLocationId) { setScanLoading(false); toast.error('Select an assigned location first.'); return; }
      exactQuery = exactQuery.eq('location_id', activeLocationId);
    }
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

    let nameQuery: any = supabase
      .from('bookings')
      .select('*')
      .or(`emergency_contact_name.ilike.%${q}%,notes.ilike.%${q}%,emergency_contact_phone.ilike.%${q}%`)
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1);
    if (!isSuperAdmin) nameQuery = nameQuery.eq('location_id', activeLocationId);
    const { data: nameData } = await nameQuery.maybeSingle();

    if (nameData) {
      setScannedBooking(nameData);
      setCheckInHeadcount(String(nameData.group_size));
      setCheckInVerified(false);
      setCheckOutHeadcount(String(nameData.group_size));
      setCheckOutVerified(false);
      toast.info('Found booking record.');
    } else {
      toast.error('No booking found. Try the QR code, booking ID, or hiker name/phone.');
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
    const meta = parseMeta(scannedBooking.notes);
    // Check-in must validate the latest published route, even on a direct QR-page load.
    const { data: publishedZones, error: routeError } = await supabase.from('trail_zones')
      .select(DISPATCH_ROUTE_FIELDS).eq('location_id', scannedBooking.location_id ?? activeLocationId ?? '')
      .eq('status', 'active').eq('is_official', true).eq('review_status', 'approved');
    if (routeError) {
      toast.error('Could not verify the official route: ' + routeError.message);
      setStartingHike(false);
      return;
    }
    const routes = filterOfficialRoutes(publishedZones || [], scannedBooking.location_id ?? activeLocationId);
    const routeInfo = { routes, route: selectAssignedOfficialRoute(routes, meta.assignedTrailZoneId), auto: !meta.assignedTrailZoneId && routes.length === 1 };
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
        .select('id,user_id,full_name,is_active')
        .eq('id', assignedGuideId)
        .limit(1);
      const guideRow = (guideRows as unknown as Array<{ id: string; user_id: string | null; full_name: string; is_active: boolean | null }> | null)?.[0];
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
          is_active: guideRow.is_active !== false,
        };
      }
    }
    if (!assignedGuide?.user_id || !assignedGuide.is_active) {
      if (assignedGuide?.is_active === false) {
        toast.error('The assigned guide is deactivated. Activate or assign an active guide before starting.');
      } else {
      toast.error('The assigned guide needs a linked guide account before this group can start.');
      }
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
      // The participant's device supplies GPS. Check-in is authorization, not a measured position.
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
    const { entryFee, envFee, guideFee, totalFee: baseTotalFee } = calculateFees(scannedBooking.group_size, { hikeType: meta.hikeType });
    const peakExtensionFee = calculatePeakExtensionFee(meta.peakExtensionHours);
    const receipt = bookingReceipt(scannedBooking);
    const totalFee = receipt.total;
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
      baseFee: receipt.base,
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
    if (locationsLoading || (!isSuperAdmin && !activeLocationId)) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    let capacityQuery: any = supabase
      .from('daily_capacity')
      .select('*')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(60);
    if (!isSuperAdmin || activeLocationId) capacityQuery = capacityQuery.eq('location_id', activeLocationId);
    const { data } = await capacityQuery;
    setUpcomingCapacities(data || []);
  };

  // Keep the refresh action explicit: both capacity views use the same source.
  const loadAllCapacities = loadUpcomingCapacities;

  const saveCapacity = async () => {
    if (!capDate) { toast.error('Please select a date.'); return; }
    const capacityError = validateCapacitySplit(capMax, capDayMax, capNightMax);
    if (capacityError) { toast.error(capacityError); return; }
    setCapSaving(true);
    const { error } = await supabase
      .from('daily_capacity')
      .upsert({
        location_id: activeLocationId,
        date: capDate,
        max_capacity: capMax,
        day_max_capacity: capDayMax,
        night_max_capacity: capNightMax,
      } as any, { onConflict: 'location_id,date' });
    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      toast.success(`✅ Capacity for ${capDate} set to ${capMax} total (${capDayMax} Day / ${capNightMax} Night).`);
      setCapDate('');
      loadUpcomingCapacities();
    }
    setCapSaving(false);
  };

  const saveCapacityRange = async () => {
    if (!capRangeStart || !capRangeEnd) { toast.error('Please select both start and end dates.'); return; }
    const capacityError = validateCapacitySplit(capMax, capDayMax, capNightMax);
    if (capacityError) { toast.error(capacityError); return; }
    const start = new Date(`${capRangeStart}T00:00:00`);
    const end = new Date(`${capRangeEnd}T00:00:00`);
    if (end < start) { toast.error('End date must be after start date.'); return; }

    const rows: Array<{ location_id: string | null; date: string; max_capacity: number; day_max_capacity?: number; night_max_capacity?: number }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      rows.push({
        location_id: activeLocationId,
        date: format(cursor, 'yyyy-MM-dd'),
        max_capacity: capMax,
        day_max_capacity: capDayMax,
        night_max_capacity: capNightMax,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    setCapSaving(true);
    const { error } = await supabase.from('daily_capacity').upsert(rows as any, { onConflict: 'location_id,date' });
    if (error) {
      toast.error('Failed bulk update: ' + error.message);
    } else {
      toast.success(`Updated ${rows.length} day(s) to ${capMax} hikers/day (${capDayMax} Day / ${capNightMax} Night).`);
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
    if (!isSuperAdmin && !activeLocationId) {
      setPendingBookings([]);
      setPendingLoading(false);
      return;
    }
    let query: any = supabase
      .from('bookings')
      .select('*')
      .in('status', ['pending', 'adjustment_pending'])
      .order('created_at', { ascending: true });
    if (activeLocationId) query = query.eq('location_id', activeLocationId);
    else if (isSuperAdmin) query = query.in('location_id', trailheadLocations.map((loc) => loc.id));
    const { data, error } = await query;
    if (error) toast.error('Could not load pending bookings: ' + error.message);
    if (data) {
      setPendingBookings(data);
    }
    setPendingLoading(false);
  };

  /* ── Accept booking + assign guide ── */
  const handleAcceptBooking = async () => {
    if (!acceptDialogId || !selectedGuide || acceptSaving) return;
    setAcceptSaving(true);
    const booking = allTabBookings.find((b) => b.id === acceptDialogId) || pendingBookings.find((b) => b.id === acceptDialogId);
    // selectedGuide now stores guide.id; resolve display name
    const guideRow = guides.find((g) => g.id === selectedGuide);
    const guideName = guideRow?.name ?? selectedGuide;
    const routeInfo = resolveAssignedTrail(booking, selectedTrailZoneId || undefined);
    if (routeInfo.routes.length > 1 && !routeInfo.route) {
      toast.error('Select the official route for this hiker before confirming.');
      setAcceptSaving(false);
      return;
    }
    if (!booking || !guideRow || !guideRow.user_id || guideRow.location_id !== booking.location_id) {
      toast.error('Selected mountain guide was not found. Refresh the guide list and try again.');
      setAcceptSaving(false);
      return;
    }
    const result = await assignGuideToBooking({
      bookingId: acceptDialogId,
      guideId: guideRow.id,
      guideName,
      guideUserId: guideRow.user_id,
      locationId: booking?.location_id ?? guideRow.location_id,
      extraMeta: {
        assignedTrailZoneId: routeInfo.route?.id,
        assignedTrailName: routeInfo.route?.name,
        assignedTrailAuto: routeInfo.auto,
      },
    });
    if (!result.success) {
      toast.error(`Failed to assign guide: ${result.error}`);
    } else {
      result.warnings?.forEach((w) => toast.warning(w));
      toast.success(`📋 Assignment offer sent to Guide "${guideName}". Awaiting guide acceptance to confirm booking.`);
      void writeActivityLog({
        action: 'guide_assigned',
        entity_type: 'booking',
        entity_id: acceptDialogId,
        after_state: { status: 'pending', assignedGuide: guideName, assignedTrail: routeInfo.route?.name ?? null },
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
    if (adjustReason.trim().length < 5) { toast.error('Please provide a reschedule reason (at least 5 characters).'); return; }
    setAdjustSaving(true);
    const booking = allTabBookings.find((b) => b.id === adjustDialogId);
    const meta = parseMeta(booking?.notes);
    const updatedMeta = encodeMeta({ ...meta, adjustedDate: adjustDate, adjustedTime: adjustTime, adjustedReason: adjustReason.trim(), adjustedBy: 'Local Admin' });
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'adjustment_pending', notes: updatedMeta })
      .eq('id', adjustDialogId);
    if (error) {
      toast.error('Failed to adjust booking');
    } else {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      await supabase.from('booking_messages' as any).insert({
        booking_id: adjustDialogId,
        sender_id: currentUser?.id ?? null,
        sender_role: 'admin',
        kind: 'reschedule_proposal',
        content: `Admin proposed ${adjustDate} at ${adjustTime}. Reason: ${adjustReason.trim()}`,
      } as any);
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
      setAdjustReason('');
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

  /* ── Delete a booking & purge related data ── */
  const handleDeleteBooking = async (bookingId: string) => {
    try {
      const booking = allTabBookings.find((b) => b.id === bookingId);
      // Clean up linked rows first
      await Promise.allSettled([
        supabase.from('booking_assignments' as any).delete().eq('booking_id', bookingId),
        supabase.from('booking_messages' as any).delete().eq('booking_id', bookingId),
        supabase.from('hiker_sessions' as any).delete().eq('booking_id', bookingId),
      ]);

      const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
      if (error) throw error;

      toast.success('Booking deleted and removed from database.');
      void loadAllTabBookings();
      void loadPendingBookings();
      void loadData();
      void loadUpcomingCapacities();
    } catch (err: any) {
      toast.error('Failed to delete booking: ' + (err?.message || 'Database error'));
    }
  };

  /* ── Purge all cancelled test/conflict bookings in bulk ── */
  const handlePurgeCancelledBookings = async () => {
    try {
      const cancelledIds = allTabBookings.filter((b) => b.status === 'cancelled').map((b) => b.id);
      if (cancelledIds.length === 0) {
        toast.info('No cancelled bookings to purge.');
        return;
      }

      await Promise.allSettled([
        supabase.from('booking_assignments' as any).delete().in('booking_id', cancelledIds),
        supabase.from('booking_messages' as any).delete().in('booking_id', cancelledIds),
        supabase.from('hiker_sessions' as any).delete().in('booking_id', cancelledIds),
      ]);

      const { error } = await supabase.from('bookings').delete().in('id', cancelledIds);
      if (error) throw error;

      toast.success(`Purged ${cancelledIds.length} cancelled/conflict bookings.`);
      void loadAllTabBookings();
      void loadPendingBookings();
      void loadData();
    } catch (err: any) {
      toast.error('Failed to purge cancelled bookings: ' + (err?.message || 'Database error'));
    }
  };

  const loadData = async () => {
    // Scope to current location when the admin has one selected (super_admin sees all).
    const scopeBookings = (q: any) => {
      if (isSuperAdmin && !activeLocationId) return q.in('location_id', trailheadLocations.map((loc) => loc.id));
      return q.eq('location_id', activeLocationId || '00000000-0000-0000-0000-000000000000');
    };
    const [
      { data: bookingsData },
      { data: zonesData },
    ] = await Promise.all([
      scopeBookings(supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(20)),
      (() => {
        let q: any = supabase.from('trail_zones').select(DISPATCH_ROUTE_FIELDS);
        if (activeLocationId) {
          q = q.eq('location_id', activeLocationId);
        }
        return q;
      })(),
    ]);

    setBookings(bookingsData || []);
    setZones((zonesData || []).filter((zone: any) => zone.status !== 'deleted' && zone.review_status !== 'deleted'));
  };

  /* ── Load real guides from DB (scoped to active location for admins) ── */
  const loadGuides = async () => {
    let q: any = supabase.from('guides').select('id, user_id, full_name, phone, specialty, status, per_trip_fee, location_id, is_active, photo_url');
    if (activeLocationId) q = q.eq('location_id', activeLocationId);
    const { data } = await q.order('full_name');
    const activeLocName = locations.find((l) => l.id === activeLocationId)?.name || '';
    const mapped: UIGuide[] = (data ?? [])
      .filter((g: any) => Boolean(g.user_id))
      .map((g: any) => ({
        id: g.id,
        user_id: g.user_id,
        name: g.full_name,
        phone: g.phone || '—',
        status: g.status || 'available',
        trail: g.specialty || activeLocName || 'Local trail',
        totalHikes: 0,
        per_trip_fee: Number(g.per_trip_fee || 0),
        location_id: g.location_id,
        is_active: g.is_active !== false,
        photo_url: g.photo_url,
      }));

    setGuides(mapped);
  };

  useEffect(() => { void loadGuides(); /* eslint-disable-next-line */ }, [activeLocationId]);

  /* ── Clean dummy / unlinked guides from DB ── */
  const handlePurgeDummyGuides = async () => {
    try {
      const { data: allG } = await supabase.from('guides').select('id, full_name, user_id');
      const dummyIds = (allG || [])
        .filter((g: any) => g.full_name !== 'Test Guide' && !g.user_id)
        .map((g: any) => g.id);
      if (dummyIds.length > 0) {
        await supabase.from('guides').delete().in('id', dummyIds);
      }
      await loadGuides();
      toast.success(`Removed ${dummyIds.length} unlinked guide(s). Only test and registered accounts kept.`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to clean dummy guides');
    }
  };

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
    const startsAt = annStartDate ? new Date(`${annStartDate}T00:00:00`).toISOString() : undefined;
    const expiresAt = annEndDate ? new Date(`${annEndDate}T23:59:59`).toISOString() : undefined;
    const newAnn: AdminAnnouncement = {
      id: Date.now().toString(),
      title: annTitle.trim(),
      body: annBody.trim(),
      type: annType,
      target: annTarget,
      created_at: new Date().toISOString(),
      isImportant: annImportant || annType === 'warning' || annType === 'closure',
      starts_at: startsAt,
      expires_at: expiresAt,
    };
    try {
      const saved = await addAnnouncement(newAnn);
      setAnnouncements(visibleAnnouncements(saved, role));
    } catch (error) {
      toast.error(`Announcement could not be saved: ${error instanceof Error ? error.message : 'Database request failed.'}`);
      setAnnSending(false);
      return;
    }
    setAnnTitle('');
    setAnnBody('');
    setAnnType('info');
    setAnnTarget('all');
    setAnnImportant(false);
    setAnnStartDate('');
    setAnnEndDate('');
    setAnnSending(false);
    toast.success('Announcement posted!');
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      const updated = await removeAnnouncement(id);
      setAnnouncements(visibleAnnouncements(updated, role));
      toast.success('Announcement removed.');
    } catch (error) {
      toast.error(`Announcement could not be removed: ${error instanceof Error ? error.message : 'Database request failed.'}`);
    }
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
    const { error } = await supabase.from('guides').update({ status: next }).eq('id', id).eq('location_id', activeLocationId);
    if (error) {
      toast.error(`Could not update guide duty status: ${error.message}`);
      return;
    }
    setGuides((prev) => prev.map((g) => (g.id === id ? { ...g, status: next } : g)));
  };

  const setGuideAccountActive = async (id: string) => {
    const guide = guides.find((item) => item.id === id);
    if (!guide || !activeLocationId || guideActivationSavingId) return;
    const nextActive = !guide.is_active;
    setGuideActivationSavingId(id);
    try {
      await setGuideAccountActiveAtLocation(id, activeLocationId, nextActive);
      setGuides((prev) => prev.map((item) => item.id === id ? { ...item, is_active: nextActive } : item));
      toast.success(`${guide.name} ${nextActive ? 'activated' : 'deactivated'} for this trailhead.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Guide status could not be changed.');
    } finally {
      setGuideActivationSavingId(null);
    }
  };

  /* ── Add real guide (creates auth user + guides row via edge function) ── */
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
          app_url: window.location.origin,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to create guide');
      setGuideInvite({ name, email, link: j.setup_link, message: j.setup_message });
      toast.success(`Guide "${name}" created. Setup instructions are ready to forward.`);
      setNewGuideName(''); setNewGuidePhone('');
      setNewGuideEmail(''); setNewGuidePassword(''); setNewGuideFee('500');
      await loadGuides();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddGuideSaving(false);
    }
  };

  const handleRemoveGuide = async () => {
    if (!removeGuideId) return;
    const expectedPassword = (import.meta.env.VITE_ADMIN_GUIDE_REMOVE_PASSWORD as string) || 'admin123';
    if (removeGuidePassword !== expectedPassword) {
      toast.error('Incorrect password. Guide was not removed.');
      return;
    }
    const guide = guides.find((g) => g.id === removeGuideId);
    const { error } = await supabase.from('guides').delete().eq('id', removeGuideId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setGuides((prev) => prev.filter((g) => g.id !== removeGuideId));
    if (selectedGuideId === removeGuideId) {
      setSelectedGuideId(null);
      setGuideHistoryBookings([]);
    }
    setRemoveGuideId(null);
    setRemoveGuidePassword('');
    toast.success(`Guide "${guide?.name || ''}" removed permanently.`);
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

  /* ─── Booking display helpers ─── */
  const getDisplayStatus = (b: any) => {
    const meta = parseMeta(b.notes);
    if (b.status === 'completed' || meta.groupPhase === 'completed' || Boolean(meta.hikeCompletedAt)) {
      return 'completed';
    }
    if (meta.onsiteStartConfirmed) return 'started';
    return b.status as string;
  };

  const officialRoutesForLocation = useCallback((locationId?: string | null) => {
    return filterOfficialRoutes(zones ?? [], locationId);
  }, [zones]);

  const resolveAssignedTrail = useCallback((booking: any, requestedId?: string) => {
    const meta = parseMeta(booking?.notes);
    const routes = officialRoutesForLocation(booking?.location_id ?? activeLocationId);
    const route = selectAssignedOfficialRoute(routes, requestedId || meta.assignedTrailZoneId);
    return {
      route,
      routes,
      auto: !requestedId && !meta.assignedTrailZoneId && routes.length <= 1,
    };
  }, [activeLocationId, officialRoutesForLocation]);

  const acceptBooking = useMemo(
    () => pendingBookings.find((b: any) => b.id === acceptDialogId) ?? allTabBookings.find((b) => b.id === acceptDialogId) ?? null,
    [acceptDialogId, pendingBookings, allTabBookings],
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
    completed: 'bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30 font-semibold',
    cancelled: 'bg-destructive/20 text-destructive',
  };

  const BOOKING_STATUS_LABEL: Record<string, string> = {
    pending: '🆕 Pending',
    adjustment_pending: '⏳ Awaiting Hiker Confirmation',
    confirmed: '✅ Confirmed',
    started: '🥾 Check-in / In Progress',
    completed: '🏁 Completed & Settled',
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
        return (
          (b.status !== 'confirmed' || !m.onsiteStartConfirmed) &&
          b.status !== 'completed' &&
          m.groupPhase !== 'completed' &&
          !m.hikeCompletedAt
        );
      }),
    [todaysBookings],
  );

  const bookingsPerDate = useMemo(() => {
    const map: Record<string, { total: number; pending: number; confirmed: number; started: number; completed: number }> = {};
    for (const b of allTabBookings) {
      if (b.status === 'cancelled') continue;
      const key = b.booking_date;
      if (!map[key]) map[key] = { total: 0, pending: 0, confirmed: 0, started: 0, completed: 0 };
      map[key].total += 1;
      const m = parseMeta(b.notes);
      if (b.status === 'completed' || m.groupPhase === 'completed' || Boolean(m.hikeCompletedAt)) {
        map[key].completed += 1;
      } else if (m.onsiteStartConfirmed) {
        map[key].started += 1;
      } else if (b.status === 'confirmed') {
        map[key].confirmed += 1;
      } else {
        map[key].pending += 1;
      }
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

  const handlePageRefresh = useCallback(async () => {
    try {
      await Promise.all([
        loadAllTabBookings(),
        loadPendingBookings(),
        loadUpcomingCapacities(),
        loadAllCapacities(),
        loadGuides(),
      ]);
      toast.success('Dashboard refreshed');
    } catch {
      // safe fallback
    }
  }, [activeLocationId]);

  const { pullDistance, isRefreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: handlePageRefresh,
  });

  return (
    <div className="min-h-screen px-3 pb-24 md:pb-12 pt-20 sm:px-4">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isPullRefreshing} />
      <div className="container max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
              {isSuperAdmin ? 'Central Admin' : 'Admin'} <span className="text-gradient">Dashboard</span>
            </h1>
            <p className="text-muted-foreground">
              Monitor real-time hiker activity, manage zones, announcements, and guides.
            </p>
            {/* Location Scope Switcher */}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Scope:</span>
              </div>
              <Select
                value={activeLocationId ?? 'all'}
                onValueChange={(val) => setActiveLocationId(val === 'all' ? null : val)}
              >
                <SelectTrigger className="h-8 text-xs font-semibold w-auto min-w-[200px] bg-background/80 border-border/40">
                  <SelectValue placeholder="All Locations & Trails" />
                </SelectTrigger>
                <SelectContent>
                  {isSuperAdmin && <SelectItem value="all">🌐 All Locations & Trails (Full Mountain)</SelectItem>}
                  {(isSuperAdmin ? trailheadLocations : locations.filter((loc) => loc.id === activeLocationId)).map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      📍 {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
        </motion.div>

        <ImportantAnnouncements />

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
          <div className="w-full md:w-64 shrink-0 md:sticky md:top-24 h-max hidden md:block">
            <TabsList className="glass-card flex flex-col p-2 gap-1 h-auto w-full items-stretch justify-start">
              <TabsTrigger value="overview" className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                <LayoutDashboard className="h-4 w-4 shrink-0" /> <span>Overview</span>
              </TabsTrigger>
              <TabsTrigger value="operations" className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap relative">
                <ClipboardList className="h-4 w-4 shrink-0" /> <span>Operations</span>
                {pendingCount > 0 && (
                  <span className="ml-auto h-5 min-w-5 px-1 rounded-full bg-destructive text-white text-[10px] flex items-center justify-center font-bold shadow-sm">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="management" className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                <UserCog className="h-4 w-4 shrink-0" /> <span>Management</span>
              </TabsTrigger>
              <TabsTrigger value="finance" className="justify-start gap-2.5 px-3 py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary whitespace-nowrap">
                <DollarSign className="h-4 w-4 shrink-0" /> <span>Finance</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-w-0">
          {/* ─────────────────────────────── BOOKINGS TAB ── */}
          
          <TabsContent value="overview" className="space-y-6 mt-0">
            <OverviewDashboard locationId={activeLocationId} locationIds={analyticsLocationIds} />
            <HikeAnalytics locationIds={analyticsLocationIds} />
            <MDRRMOAccessAudit locationId={activeLocationId} />
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
                  <TabsTrigger value="scan">Check in</TabsTrigger>
                  <TabsTrigger value="sessions" className="gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    <span>Hike Sessions</span>
                    {activeSiteSessions.length > 0 && (
                      <Badge className="px-1.5 py-0 text-[10px] bg-primary text-primary-foreground font-bold">
                        {activeSiteSessions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="live-map">Live Map</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="requests" className="space-y-4 mt-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">All Bookings</h2>
                <p className="text-sm text-muted-foreground">View and manage all booking records by status.</p>
              </div>
              {allTabBookings.some((b) => b.status === 'cancelled') && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" /> Purge Cancelled ({allTabBookings.filter((b) => b.status === 'cancelled').length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Purge all cancelled bookings?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {allTabBookings.filter((b) => b.status === 'cancelled').length} cancelled bookings and their linked chat messages/session data to clean up the database.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void handlePurgeCancelledBookings()}
                      >
                        Purge All Cancelled
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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
                { value: 'started', label: 'Check-in / In Progress' },
                { value: 'completed', label: 'Completed & Settled', count: completedCount },
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
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                      value === 'pending' ? 'bg-destructive text-white' : 'bg-primary/20 text-primary'
                    }`}>
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
                              {b.requested_new_date && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Hiker requested date</p>
                                  <p className="font-semibold text-sky-600">{b.requested_new_date}</p>
                                </div>
                              )}
                              {(meta.requestedRescheduleReason || meta.adjustedReason) && (
                                <div className="col-span-full rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
                                  <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                                    {meta.requestedRescheduleReason ? 'Hiker reschedule reason' : 'Admin reschedule reason'}
                                  </p>
                                  <p className="mt-1 text-sm">{meta.requestedRescheduleReason || meta.adjustedReason}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-xs text-muted-foreground">Total Fee</p>
                                <p className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatPeso(Number(b.total_amount || 0))}
                                  {meta.paymentStatus && (
                                    <span className="ml-1 text-[10px] uppercase font-semibold text-muted-foreground">
                                      ({meta.paymentStatus})
                                    </span>
                                  )}
                                </p>
                              </div>
                              {meta.peakExtensionHours && meta.peakExtensionHours > 0 ? (
                                <div>
                                  <p className="text-xs text-muted-foreground">Peak Stay Extension</p>
                                  <p className="font-semibold text-primary">+{meta.peakExtensionHours}h ({formatPeso(meta.peakExtensionFee || meta.peakExtensionHours * 100)})</p>
                                </div>
                              ) : null}
                              {meta.emergencyHorseCount && meta.emergencyHorseCount > 0 ? (
                                <div>
                                  <p className="text-xs text-muted-foreground">Emergency Service</p>
                                  <p className="font-semibold text-amber-600 dark:text-amber-400">🐎 {meta.emergencyHorseCount} Horse ({formatPeso(meta.emergencyHorseFee || meta.emergencyHorseCount * 500)})</p>
                                </div>
                              ) : null}
                              {meta.userNotes && (
                                <div className="col-span-2">
                                  <p className="text-xs text-muted-foreground">Notes</p>
                                  <p className="font-semibold truncate">{meta.userNotes}</p>
                                </div>
                              )}
                              {meta.priceAdjustments && meta.priceAdjustments.length > 0 && (
                                <div className="col-span-full rounded-xl bg-secondary/30 border border-border/30 p-2.5 space-y-1 text-xs mt-1">
                                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                                    <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                                    Price Adjustments Audit ({meta.priceAdjustments.length}):
                                  </p>
                                  {meta.priceAdjustments.slice(-2).map((adj: any, i: number) => (
                                    <p key={i} className="text-[11px] text-muted-foreground">
                                      • <strong>{formatPeso(adj.previousAmount)} ➔ {formatPeso(adj.newAmount)}</strong> by {adj.changedByName || 'Admin'} on {new Date(adj.changedAt).toLocaleDateString()}: <em>"{adj.reason}"</em>
                                    </p>
                                  ))}
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
                            {((['pending', 'adjustment_pending', 'confirmed'].includes(displayStatus) && !meta.onsiteStartConfirmed && !isAdjusted) || Boolean(b.requested_new_date)) && (
                              <Button size="sm" variant="outline" className="gap-1.5 border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                                onClick={() => { setAdjustDialogId(b.id); setAdjustDate(b.requested_new_date || b.booking_date); setAdjustReason(''); }}>
                                <CalendarClock className="h-3.5 w-3.5" /> {b.requested_new_date ? 'Review / Reschedule' : 'Adjust Date/Time'}
                              </Button>
                            )}
                            {displayStatus === 'confirmed' && (
                              <>
                                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingBooking(b)}>
                                  <FileText className="h-3.5 w-3.5" /> Edit details
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10" onClick={() => setEditingPaymentBooking(b)}>
                                  <DollarSign className="h-3.5 w-3.5" /> Edit Price / Services
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
                            {displayStatus === 'started' && (
                              <>
                                <Button
                                  size="sm"
                                  className="gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold shadow-md text-xs"
                                  onClick={() => setEndHikeBooking(b)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> End Hike & Settle
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs"
                                  onClick={() => {
                                    setScannedBooking(b);
                                    setOperationsTab('scan');
                                  }}
                                >
                                  <ScanLine className="h-3.5 w-3.5" /> Open QR / Simulation
                                </Button>
                              </>
                            )}
                            {displayStatus === 'completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-teal-500/40 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 text-xs"
                                onClick={() => {
                                  setScannedBooking(b);
                                  setOperationsTab('scan');
                                }}
                              >
                                <Receipt className="h-3.5 w-3.5" /> View Settlement
                              </Button>
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
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:bg-destructive/10 text-xs h-8 px-2" title="Permanently delete booking">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this booking permanently?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove the booking for <strong>{meta.fullName || b.emergency_contact_name}</strong> ({b.id}), including its chat history and assignments.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => void handleDeleteBooking(b.id)}
                                  >
                                    Yes, Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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
                          {guides.filter((g) => g.is_active && g.status !== 'off-duty' && g.status !== 'off_duty' && g.user_id && g.location_id === acceptBooking?.location_id).map((g) => (
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
                    <div className="space-y-2">
                      <Label htmlFor="adjustReason">Reason for rescheduling</Label>
                      <Textarea id="adjustReason" value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} maxLength={500} rows={3} placeholder="Explain why the schedule needs to change" />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1" onClick={() => setAdjustDialogId(null)} disabled={adjustSaving}>Cancel</Button>
                      <Button className="flex-1 gap-2" onClick={handleAdjustBooking} disabled={!adjustDate || adjustReason.trim().length < 5 || adjustSaving}>
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
              <h2 className="text-lg font-semibold">Onsite check in</h2>
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
                  onScan={(value) => { setQrInput(value); void handleQrLookup(value); }}
                  manualInput={qrInput}
                  onManualInputChange={setQrInput}
                  onManualSubmit={() => void handleQrLookup()}
                  loading={scanLoading || locationsLoading}
                />

                {scannedBooking && (() => {
                  const meta = parseMeta(scannedBooking.notes);
                  const { totalFee: baseTotalFee } = calculateFees(scannedBooking.group_size, { hikeType: meta.hikeType });
                  const peakExtensionFee = calculatePeakExtensionFee(meta.peakExtensionHours);
                  const totalFee = bookingReceipt(scannedBooking).total;
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
                          { label: 'Hike Type', value: `${meta.hikeType === 'night' || meta.hikeType === 'overnight' ? '🌙' : '☀️'} ${getHikeTypeLabel(meta.hikeType)} Hike` },
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
                          <p className="font-bold text-destructive">Medical note</p>
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

                      {/* Active Hike Simulation & Progress Tracker or Completed Hike Summary */}
                      {scannedBooking.status === 'completed' || meta.groupPhase === 'completed' || Boolean(meta.hikeCompletedAt) ? (
                        <div className="space-y-4 rounded-2xl border-2 border-teal-500/40 bg-gradient-to-b from-teal-500/10 to-transparent p-5">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                              <span className="font-bold text-sm text-foreground">
                                🏁 Hike Completed & Settlement Finalized
                              </span>
                            </div>
                            {meta.hikeCompletedAt && (
                              <Badge variant="outline" className="text-xs bg-background/80 border-border/40 font-mono">
                                Ended: {new Date(meta.hikeCompletedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })} PHT
                              </Badge>
                            )}
                          </div>

                          <div className="p-3.5 rounded-xl bg-background/80 border border-teal-500/20 text-xs space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">Settlement Status:</span>
                              <Badge className="bg-teal-500/20 text-teal-700 dark:text-teal-300 font-bold border-teal-500/30">
                                Fully Settled & Paid
                              </Badge>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">Total Fee Collected:</span>
                              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                                {formatPeso(meta.amountPaid ?? totalFee)}
                              </span>
                            </div>
                            {meta.paymentMethod && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Payment Method:</span>
                                <span className="font-medium uppercase">{meta.paymentMethod}</span>
                              </div>
                            )}
                            {meta.assignedGuide && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Assigned Guide:</span>
                                <span className="font-medium">{meta.assignedGuide}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs gap-1.5"
                              onClick={() => {
                                setScannedBooking(null);
                                setQrInput('');
                              }}
                            >
                              <ScanLine className="h-3.5 w-3.5" /> Check-in Next Hiker
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs gap-1.5 text-primary border-primary/30"
                              onClick={() => setChatBooking({ id: scannedBooking.id, date: scannedBooking.booking_date })}
                            >
                              <MessageCircle className="h-3.5 w-3.5" /> Chat with Hiker
                            </Button>
                          </div>
                        </div>
                      ) : meta.onsiteStartConfirmed || hikeStarted ? (
                        <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xl font-sans space-y-3.5 text-xs text-foreground">
                          {/* Header: User Icon, Name, Phase Badge, ID */}
                          <div className="border-b pb-2 flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                                <Users className="h-4 w-4 text-slate-500" />
                                {meta.fullName || scannedBooking.hiker_name || 'Hiker Group'}
                              </h4>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                ID: {scannedBooking.id.slice(0, 8)}
                              </span>
                            </div>
                            <span className={cn(
                              'px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize',
                              meta.groupPhase === 'peak' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 animate-pulse' :
                              meta.groupPhase === 'descent' ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-300' :
                              'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300'
                            )}>
                              {meta.groupPhase === 'peak' ? 'Peak' :
                               meta.groupPhase === 'descent' ? 'Descent' :
                               'Ascent'}
                            </span>
                          </div>

                          {/* Position & Estimated ETA */}
                          <div className="space-y-1.5 pt-0.5">
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span className="flex items-center gap-1.5"><Compass className="h-3.5 w-3.5 text-primary" /> Position:</span>
                              <span className="font-semibold text-foreground text-right">
                                {meta.groupPhase === 'peak' ? 'At Peak / End of Path (3.25 km)' :
                                 meta.groupPhase === 'descent' ? 'Wilderness Ridge - Descending (2.2 km)' :
                                 'Mountain Spring Rest (1.7 km)'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-muted-foreground">
                              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> Est. ETA:</span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-right">
                                {meta.groupPhase === 'peak' ? 'At Peak - Rest: Summit Stay Active' :
                                 meta.groupPhase === 'descent' ? '~40 mins to Base Camp' :
                                 '~35 mins to Summit'}
                              </span>
                            </div>
                          </div>

                          {/* Summit Limit Timer Box (when at Peak) */}
                          {meta.groupPhase === 'peak' && (
                            <div className="mt-1 p-3 bg-amber-500/10 dark:bg-amber-950/40 rounded-xl border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-bold text-xs">
                                  <Timer className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-spin" />
                                  Summit Limit Timer:
                                </span>
                                <span className="font-mono font-bold text-xs text-amber-800 dark:text-amber-300">
                                  {meta.peakDeadlineAt
                                    ? `Stay until ${new Date(meta.peakDeadlineAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })} PHT`
                                    : '1h 00m remaining'}
                                </span>
                              </div>
                              <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                                Once timer expires, the group will automatically start descending as per safety protocol.
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void extendPeakStay()}
                                disabled={lifecycleSaving}
                                className="w-full text-xs h-7 border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 mt-1"
                              >
                                +1 Hour Stay Extension (+₱100)
                              </Button>
                            </div>
                          )}

                          {/* Lead Guide, Group Count, Medical, Emergency Info */}
                          <div className="border-t border-border/60 pt-2 space-y-1 text-[11px] text-foreground">
                            <div>
                              <span className="font-bold">Lead Guide: </span>
                              <span>{meta.assignedGuide || 'Test Guide'} ({guides.find((g) => g.name === meta.assignedGuide || g.id === meta.assignedGuideId)?.phone || '+63 920 111 2222'})</span>
                            </div>
                            <div>
                              <span className="font-bold">Group Count: </span>
                              <span>{scannedBooking.group_size} Pax {meta.hasMinors ? <span className="text-amber-600 font-medium">({meta.minorCount || 1} Minor)</span> : ''}</span>
                            </div>
                            {(meta.medicalNotes || scannedBooking.notes?.includes('Asthma') || scannedBooking.notes?.includes('Medical')) && (
                              <div className="text-red-600 font-medium flex items-center gap-1">
                                <span className="font-bold text-red-600">Medical note: </span>
                                <span>{meta.medicalNotes || 'Asthma (Carries rescue inhaler)'}</span>
                              </div>
                            )}
                            <div>
                              <span className="font-bold">Emergency Contact: </span>
                              <span>{scannedBooking.emergency_contact_name || meta.fullName || 'Elena Reyes'} ({scannedBooking.emergency_contact_phone || meta.phoneNumber || '+63 918 888 9999'})</span>
                            </div>
                          </div>

                          {/* Action Buttons matching screenshot */}
                          <div className="border-t border-border/60 pt-2.5 space-y-2">
                            {meta.groupPhase === 'peak' ? (
                              <Button
                                size="sm"
                                onClick={() => void updateGroupPhase('descent')}
                                disabled={lifecycleSaving}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 shadow-md"
                              >
                                <ArrowDown className="h-4 w-4" />
                                Initiate Early Descent (Down)
                              </Button>
                            ) : (meta.groupPhase ?? 'ascent') === 'ascent' ? (
                              <Button
                                size="sm"
                                onClick={() => void updateGroupPhase('peak')}
                                disabled={lifecycleSaving}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 shadow-md"
                              >
                                🏔️ Advance: Mark at Summit (Peak)
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => setEndHikeBooking(scannedBooking)}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-md"
                              >
                                🏁 Base Reached: Finalize & Settle
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEndHikeBooking(scannedBooking)}
                              className="w-full text-xs font-semibold gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                              End Early & Settle (Emergency Return)
                            </Button>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setOperationsTab('live-map');
                                  const next = new URLSearchParams(searchParams);
                                  next.set('tab', 'live-map');
                                  setSearchParams(next, { replace: true });
                                }}
                                className="w-full gap-1 text-[11px]"
                              >
                                <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                                View Map
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setCompanionQROpen(true)}
                                className="w-full gap-1 text-[11px]"
                              >
                                <Users className="h-3.5 w-3.5" />
                                Companion QR
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (scannedBooking.status !== 'confirmed' || meta.guideStatus === 'pending' || meta.guideStatus === 'unassigned') ? (
                        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
                          <div className="flex items-center gap-2 font-bold">
                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                            <span>
                              {meta.assignedGuide && meta.guideStatus === 'pending'
                                ? `Awaiting Guide Acceptance: ${meta.assignedGuide}`
                                : 'Booking Not Confirmed'}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed opacity-90">
                            {meta.assignedGuide && meta.guideStatus === 'pending'
                              ? `Assigned guide "${meta.assignedGuide}" must accept this booking in their Guide Dashboard before onsite check-in can be started.`
                              : 'Assign a mountain guide and have them accept the permit to confirm this booking before check-in.'}
                          </p>
                          <div className="pt-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                if (!meta.assignedGuideId) { toast.error('Assign a guide before confirming this booking.'); return; }
                                const updatedMeta = encodeMeta({ ...meta, guideStatus: 'accepted' });
                                const { error: assignmentError } = await supabase.from('booking_assignments' as any)
                                    .update({ status: 'accepted', decided_at: new Date().toISOString() } as any)
                                    .eq('booking_id', scannedBooking.id).eq('guide_id', meta.assignedGuideId);
                                if (assignmentError) { toast.error(assignmentError.message); return; }
                                const { error } = await supabase.from('bookings').update({ status: 'confirmed', notes: updatedMeta }).eq('id', scannedBooking.id);
                                if (error) { toast.error(error.message); return; }
                                toast.success('Admin confirmed booking! Check-in is now unlocked.');
                                setScannedBooking((prev: any) => prev ? { ...prev, status: 'confirmed', notes: updatedMeta } : null);
                                const result = await confirmReservation({ id: scannedBooking.id });
                                if (result.success === false) toast.warning(`Booking confirmed, but email was not sent: ${result.error}`);
                              }}
                              className="text-xs h-7 gap-1 font-semibold"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Force Confirm (Admin Override)
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          className="w-full gap-2 font-bold py-2.5"
                          onClick={handleStartHike}
                          disabled={startingHike || !checkInVerified || Number(checkInHeadcount) !== Number(scannedBooking.group_size)}
                        >
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

              <TabsContent value="sessions" className="space-y-4 mt-0">
                <Card className="glass-card border-border/30 overflow-hidden">
                  <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" />
                          Hike Sessions &amp; Trail Progress — {activeLocation?.name || 'All Jump-Off Sites'}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Live tracking and lifecycle of checked-in hiking groups for this station site.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Filter session by hiker, ID, guide..."
                            value={sessionSearch}
                            onChange={(e) => setSessionSearch(e.target.value)}
                            className="pl-8 text-xs h-8 w-44 lg:w-56"
                          />
                        </div>

                        <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border/30">
                          {(['all', 'active', 'completed'] as const).map((filter) => (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => setSessionPhaseFilter(filter)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md capitalize transition-all ${
                                sessionPhaseFilter === filter
                                  ? filter === 'active'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-primary text-primary-foreground shadow-sm'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {filter === 'active' ? `Active (${activeSiteSessions.length})` : filter}
                            </button>
                          ))}
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void loadSiteSessions()}
                          disabled={sessionsLoading}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <RefreshCw className={`h-3 w-3 ${sessionsLoading ? 'animate-spin' : ''}`} />
                          Sync
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-secondary/30 text-muted-foreground border-b border-border/20 font-semibold uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Group &amp; Lead Hiker</th>
                            <th className="px-4 py-3">Assigned Mountain Guide</th>
                            <th className="px-4 py-3">Route</th>
                            <th className="px-4 py-3">Start &amp; Duration</th>
                            <th className="px-4 py-3">Trail Phase</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10">
                          {filteredSiteSessions.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                                {sessionsLoading ? 'Loading sessions...' : 'No hike sessions found for this station site.'}
                              </td>
                            </tr>
                          ) : (
                            filteredSiteSessions.map((s) => {
                              const isActive = s.status === 'active';
                              const phaseLabel =
                                s.trackingPhase === 'peak'
                                  ? 'At Summit / Peak Stay'
                                  : s.trackingPhase === 'descent'
                                  ? 'Descent (Heading Down)'
                                  : s.trackingPhase === 'completed'
                                  ? 'Hike Completed'
                                  : 'Ascent (Climbing)';

                              const startMs = new Date(s.startTime).getTime();
                              const diffMin = Math.max(0, Math.floor((Date.now() - startMs) / 60000));
                              const durationText = Math.floor(diffMin / 60) > 0
                                ? `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`
                                : `${diffMin}m`;

                              return (
                                <tr key={s.id} className="hover:bg-secondary/10 transition-colors">
                                  <td className="px-4 py-3">
                                    <div className="font-semibold text-foreground">{s.hikerName}</div>
                                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                      <span className="font-mono text-[10px] text-primary">#{s.bookingId.slice(0, 8)}</span>
                                      <span>•</span>
                                      <span>{s.groupSize} {s.groupSize === 1 ? 'hiker' : 'hikers'}</span>
                                      <span>•</span>
                                      <span>{s.hikerPhone}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                                      <Compass className="h-3.5 w-3.5 text-primary shrink-0" />
                                      {s.guideName}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3 text-primary shrink-0" />
                                      <span className="truncate max-w-[140px]">{s.trailName}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="font-medium text-foreground">
                                      {new Date(s.startTime).toLocaleTimeString('en-PH', {
                                        timeZone: 'Asia/Manila',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                      {isActive ? `⏱️ ${durationText} on trail` : 'Finished'}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] font-semibold ${
                                        s.trackingPhase === 'peak'
                                          ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                          : s.trackingPhase === 'descent'
                                          ? 'bg-purple-500/10 text-purple-600 border-purple-500/30'
                                          : s.trackingPhase === 'completed'
                                          ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                                          : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                      }`}
                                    >
                                      {phaseLabel}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge
                                      variant={isActive ? 'default' : 'secondary'}
                                      className={`text-[10px] font-semibold ${
                                        isActive ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'
                                      }`}
                                    >
                                      {isActive ? 'Active Session' : 'Ended'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setOperationsTab('live-map');
                                          const next = new URLSearchParams(searchParams);
                                          next.set('tab', 'live-map');
                                          setSearchParams(next, { replace: true });
                                        }}
                                        className="h-7 text-[11px] gap-1 px-2"
                                        title="View live GPS telemetry on Map"
                                      >
                                        <MapPin className="h-3 w-3 text-emerald-600" />
                                        Map
                                      </Button>
                                      {isActive && s.booking && (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => setEndHikeBooking(s.booking)}
                                          className="h-7 text-[11px] gap-1 px-2 font-semibold text-primary hover:text-primary-foreground hover:bg-primary"
                                          title="Check-out and record hike settlement"
                                        >
                                          <CheckCircle2 className="h-3 w-3" />
                                          Check-out
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="management" className="mt-0">
            <Tabs
              value={managementTab}
              onValueChange={(val) => {
                setManagementTab(val);
                const next = new URLSearchParams(searchParams);
                next.set('tab', val);
                setSearchParams(next, { replace: true });
              }}
              className="space-y-4"
            >
              <div className="mb-4 overflow-x-auto pb-2">
                <TabsList className="glass-card">
                  <TabsTrigger value="users">Manage Users</TabsTrigger>
                  <TabsTrigger value="guides">Guide Roster</TabsTrigger>
                  <TabsTrigger value="announcements">Announcements</TabsTrigger>
                  {isSuperAdmin && <TabsTrigger value="accounts">Accounts</TabsTrigger>}
                  {isSuperAdmin && <TabsTrigger value="pricing">Pricing & Capacity</TabsTrigger>}
                  {isSuperAdmin && <TabsTrigger value="reports">Central Reports</TabsTrigger>}
                  
                </TabsList>
              </div>
              {isSuperAdmin && <TabsContent value="accounts"><Suspense fallback={<p role="status">Loading accounts...</p>}><CentralAccountManagement /></Suspense></TabsContent>}
              {isSuperAdmin && <TabsContent value="pricing"><Suspense fallback={<p role="status">Loading pricing...</p>}><CentralPricingManagement /></Suspense></TabsContent>}
              {isSuperAdmin && <TabsContent value="reports"><Suspense fallback={<p role="status">Loading reports...</p>}><CentralAnalyticsReporting /></Suspense></TabsContent>}
              <TabsContent value="users" className="space-y-6 mt-0">
                <AdminUserManagement
                  locationId={activeLocationId}
                  locationName={activeLocation?.name || 'Current Trailhead'}
                />
              </TabsContent>
              <TabsContent value="guides" className="space-y-6 mt-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div>
                <h2 className="text-lg font-semibold">Local Guide Roster</h2>
                <p className="text-sm text-muted-foreground">Manage guide availability and view their hike history.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-primary border-primary/30">
                  {guides.filter((g) => g.is_active && g.status === 'available').length} available
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handlePurgeDummyGuides}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clean Unlinked Guides
                </Button>
              </div>
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
                <div className="text-xs text-muted-foreground self-center px-1">Guide Rate: <span className="font-semibold text-foreground">₱600</span> (Centrally Regulated)</div>
                <div className="text-xs text-muted-foreground self-center px-1">
                  Trail: <span className="text-foreground font-medium">{locations.find((l) => l.id === activeLocationId)?.name || 'Pick active location'}</span> (auto-assigned)
                </div>

                <p className="sm:col-span-2 text-[11px] text-muted-foreground self-center">
                  Creates a real sign-in account for this guide at the currently active location. Existing guides stay active until you deactivate them here.
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
                        {guide.photo_url || guidePhotoForName(guide.name) ? <img src={guide.photo_url || guidePhotoForName(guide.name) || undefined} alt={guide.name} loading="lazy" decoding="async" className="w-11 h-11 rounded-full object-cover flex-shrink-0 border border-primary/20" /> : <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary font-bold text-lg">{guide.name.charAt(0)}</div>}
                        <div className="min-w-0">
                          <p className="break-words font-semibold">{guide.name}</p>
                          <p className="break-all text-xs text-muted-foreground">{guide.phone}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${GUIDE_STATUS_STYLES[guide.status]}`}>
                        {guide.status}
                      </span>
                    </div>
                    {!guide.is_active && (
                      <Badge variant="destructive" className="mt-2">Deactivated by local admin</Badge>
                    )}

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
                      <Button variant="outline" size="sm" className="min-w-0 px-2 text-xs" onClick={() => cycleGuideStatus(guide.id)} disabled={!guide.is_active}>
                        <UserCog className="h-3.5 w-3.5 mr-1.5" /> Change Status
                      </Button>
                      <Button variant="outline" size="sm" className="min-w-0 px-2 text-xs" onClick={() => handleSelectGuide(guide)}>
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                        {selectedGuideId === guide.id ? 'Hide History' : 'View History'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`col-span-2 text-xs ${guide.is_active ? 'text-destructive border-destructive/30 hover:bg-destructive/10' : 'text-emerald-700 border-emerald-600/30 hover:bg-emerald-500/10'}`}
                        onClick={() => void setGuideAccountActive(guide.id)}
                        disabled={!activeLocationId || guideActivationSavingId === guide.id}
                      >
                        {guideActivationSavingId === guide.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : guide.is_active ? <UserX className="mr-1.5 h-3.5 w-3.5" /> : <UserCheck className="mr-1.5 h-3.5 w-3.5" />}
                        {guide.is_active ? 'Deactivate Guide' : 'Activate Guide'}
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
                                <p className="text-xs text-muted-foreground">{b.booking_date} • {b.group_size} pax • {meta.hikeType === 'night' || meta.hikeType === 'overnight' ? '🌙' : '☀️'} {getHikeTypeLabel(meta.hikeType)} Hike</p>
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
                                <p className="font-semibold mb-0.5 uppercase tracking-wide text-[10px] text-destructive">Medical note</p>
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
                    { label: 'Available', count: guides.filter((g) => g.is_active && g.status === 'available').length, color: 'text-primary' },
                    { label: 'On Duty', count: guides.filter((g) => g.is_active && g.status === 'on-duty').length, color: 'text-sky-500' },
                    { label: 'Off Duty', count: guides.filter((g) => g.is_active && g.status === 'off-duty').length, color: 'text-muted-foreground' },
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
                    <Label>Audience / Target</Label>
                    <Select value={annTarget} onValueChange={(v) => setAnnTarget(v as AnnouncementTarget)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">🌐 All (Admins, Hikers & Guides)</SelectItem>
                        <SelectItem value="admins">🛡️ Trailhead Admins Only</SelectItem>
                        <SelectItem value="hikers">🥾 Hikers Only</SelectItem>
                        <SelectItem value="guides">🧭 Guides Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
      <EditPaymentDialog
        booking={editingPaymentBooking}
        open={!!editingPaymentBooking}
        onClose={() => setEditingPaymentBooking(null)}
        onDone={() => void loadAllTabBookings()}
      />
      <EndHikeSettlementDialog
        open={!!endHikeBooking}
        booking={endHikeBooking}
        onClose={() => setEndHikeBooking(null)}
        onHikeEnded={() => {
          void loadAllTabBookings();
          void loadPendingBookings();
          void loadUpcomingCapacities();
          void loadAllCapacities();
          setEndHikeBooking(null);
          setScannedBooking(null);
          setHikeStarted(false);
          setCheckInVerified(false);
          setCheckOutVerified(false);
        }}
        adminUser={adminUser}
      />
      <AdminWalkInRegistrationDialog
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        locationId={activeLocationId}
        onSuccess={() => {
          void loadAllTabBookings();
          void loadPendingBookings();
          void loadUpcomingCapacities();
        }}
      />

      <Dialog open={!!guideInvite} onOpenChange={(open) => !open && setGuideInvite(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Guide account ready</DialogTitle>
            <DialogDescription>Forward this setup message to {guideInvite?.email}. The secure link lets the guide create a new password and finish their profile.</DialogDescription>
          </DialogHeader>
          <Textarea value={guideInvite?.message || ''} readOnly rows={7} className="text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button className="gap-2" onClick={() => { if (guideInvite) { void navigator.clipboard.writeText(guideInvite.message); toast.success('Setup message copied.'); } }}><Copy className="h-4 w-4" /> Copy message</Button>
            <Button variant="outline" onClick={() => { if (guideInvite) { void navigator.clipboard.writeText(guideInvite.link); toast.success('Setup link copied.'); } }}>Copy link</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Group Companion Join QR Modal ── */}
      <Dialog open={companionQROpen} onOpenChange={setCompanionQROpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6 text-center">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-lg font-bold flex items-center justify-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Group Companion QR
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Let companions (up to {scannedBooking?.group_size || 8} pax) scan this code on their phones to join the live GPS session without creating an account.
            </p>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-border/40 shadow-inner my-2">
            {scannedBooking && (
              <QRCodeSVG
                value={`${window.location.origin}/join-hike?bookingId=${scannedBooking.id}`}
                size={220}
                level="H"
                includeMargin
              />
            )}
            <p className="text-[11px] text-muted-foreground font-mono mt-3">
              Permit ID: {scannedBooking?.id?.slice(0, 12)}…
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="w-full text-xs"
              onClick={() => {
                if (scannedBooking) {
                  const url = `${window.location.origin}/join-hike?bookingId=${scannedBooking.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Join link copied to clipboard!');
                }
              }}
            >
              Copy Join Link
            </Button>
            <Button className="w-full text-xs" onClick={() => setCompanionQROpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Sleek Floating Pill Bottom Navigation Bar (Mobile) ── */}
      <nav aria-label="Admin Mobile Navigation" className="md:hidden fixed bottom-3 inset-x-3 sm:inset-x-6 z-50 rounded-2xl sm:rounded-full border border-border/70 bg-card/95 backdrop-blur-2xl shadow-2xl shadow-black/30 px-2 py-2 transition-all">
        <div className="grid grid-cols-4 items-center gap-1">
          {/* 1. Overview */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('overview');
              const next = new URLSearchParams(searchParams);
              next.set('tab', 'overview');
              next.delete('routeDraft');
              setSearchParams(next, { replace: true });
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl transition-all ${
              activeTab === 'overview'
                ? 'bg-primary/20 text-primary font-bold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none">Overview</span>
          </button>

          {/* 2. Operations */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('operations');
              setOperationsTab('requests');
              const next = new URLSearchParams(searchParams);
              next.set('tab', 'requests');
              next.delete('routeDraft');
              setSearchParams(next, { replace: true });
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl transition-all relative ${
              activeTab === 'operations'
                ? 'bg-primary/20 text-primary font-bold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="relative">
              <ClipboardList className="h-5 w-5 shrink-0" />
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-white text-[9px] flex items-center justify-center font-bold">
                  {pendingCount}
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium leading-none">Operations</span>
          </button>

          {/* 3. Management */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('management');
              const next = new URLSearchParams(searchParams);
              next.set('tab', 'management');
              next.delete('routeDraft');
              setSearchParams(next, { replace: true });
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl transition-all ${
              activeTab === 'management'
                ? 'bg-primary/20 text-primary font-bold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserCog className="h-5 w-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none">Management</span>
          </button>

          {/* 4. Finance */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('finance');
              const next = new URLSearchParams(searchParams);
              next.set('tab', 'finance');
              next.delete('routeDraft');
              setSearchParams(next, { replace: true });
            }}
            className={`flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl transition-all ${
              activeTab === 'finance'
                ? 'bg-primary/20 text-primary font-bold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <DollarSign className="h-5 w-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none">Finance</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

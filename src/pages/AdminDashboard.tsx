import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
} from 'lucide-react';
import { parseMeta, encodeMeta } from '@/lib/bookingMeta';
import { calculateFees, formatPeso, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/payments';
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
import PaymentSummaryTab from '@/components/admin/PaymentSummaryTab';
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

export default function AdminDashboard() {
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
  const [guides, setGuides] = useState(MOCK_GUIDES);

  /* ── All bookings (used by Bookings tab + Payments tab) ── */
  const [allTabBookings, setAllTabBookings] = useState<any[]>([]);
  const [allTabLoading, setAllTabLoading] = useState(false);

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
  const [newGuideTrail, setNewGuideTrail] = useState('');
  const [removeGuideId, setRemoveGuideId] = useState<string | null>(null);
  const [removeGuidePassword, setRemoveGuidePassword] = useState('');

  // Accept flow
  const [acceptDialogId, setAcceptDialogId] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide] = useState('');
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
  }, []);

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
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
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

    const { data: exactData } = await supabase
      .from('bookings')
      .select('*')
      .or(`qr_code_data.eq.${q},id.eq.${q}`)
      .limit(1)
      .maybeSingle();

    if (exactData) {
      setScannedBooking(exactData);
      setScanLoading(false);
      return;
    }

    const { data: nameData } = await supabase
      .from('bookings')
      .select('*')
      .ilike('emergency_contact_name', `%${q}%`)
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nameData) {
      setScannedBooking(nameData);
      toast.info('Found booking by name match.');
    } else {
      toast.error('No booking found. Try the QR code, booking ID, or hiker name.');
    }
    setScanLoading(false);
  };

  /* ── QR Scan: start hike ── */
  const handleStartHike = async () => {
    if (!scannedBooking) return;
    setStartingHike(true);
    const { data: session, error: sessionErr } = await supabase
      .from('hiker_sessions')
      .insert({
        user_id: scannedBooking.user_id,
        booking_id: scannedBooking.id,
        start_time: new Date().toISOString(),
        status: 'active',
        total_distance_km: 0,
      })
      .select()
      .single();

    if (sessionErr) {
      toast.error('Failed to start hike: ' + sessionErr.message);
    } else {
      const meta = parseMeta(scannedBooking.notes);
      const startTime = new Date().toISOString();
      const updatedNotes = encodeMeta({
        ...meta,
        onsiteStartConfirmed: true,
        onsiteStartTime: startTime,
        hikerSessionId: session?.id,
      });
      await supabase.from('bookings').update({ notes: updatedNotes }).eq('id', scannedBooking.id);
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
        after_state: { onsiteStartConfirmed: true, startTime },
      });
      loadAllTabBookings();
    }
    setStartingHike(false);
  };

  /* ── QR Scan: record payment ── */
  const handleScanRecordPayment = async () => {
    if (!scannedBooking || !scanPayAmount) { toast.error('Enter amount paid.'); return; }
    setScanPaySaving(true);
    const meta = parseMeta(scannedBooking.notes);
    const { entryFee, envFee, guideFee, totalFee } = calculateFees(scannedBooking.group_size);
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
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .in('status', ['pending', 'adjustment_pending'])
      .order('created_at', { ascending: true });
    setPendingBookings(data || []);
    setPendingLoading(false);
  };

  /* ── Accept booking + assign guide ── */
  const handleAcceptBooking = async () => {
    if (!acceptDialogId || !selectedGuide) return;
    setAcceptSaving(true);
    const booking = allTabBookings.find((b) => b.id === acceptDialogId);
    const meta = parseMeta(booking?.notes);
    const updatedMeta = encodeMeta({ ...meta, assignedGuide: selectedGuide });
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'confirmed', notes: updatedMeta })
      .eq('id', acceptDialogId);
    if (error) {
      toast.error('Failed to accept booking');
    } else {
      toast.success(`✅ Booking accepted! Guide "${selectedGuide}" assigned and notified.`);
      // Update available slots
      if (booking) await updateDailySlots(booking.booking_date, booking.group_size, 1);
      void writeActivityLog({
        action: 'booking_confirmed',
        entity_type: 'booking',
        entity_id: acceptDialogId,
        after_state: { status: 'confirmed', assignedGuide: selectedGuide },
      });
      setPendingBookings((prev) => prev.filter((b) => b.id !== acceptDialogId));
      setAcceptDialogId(null);
      setSelectedGuide('');
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
    const [
      { count: totalBookings },
      { count: activeHikers },
      { data: bookingsData },
      { data: zonesData },
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('hiker_sessions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(20),
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
    setZones(zonesData || []);
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

  const handleSelectGuide = (guide: typeof MOCK_GUIDES[0]) => {
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

  /* ── Toggle guide status ── */
  const cycleGuideStatus = (id: string) => {
    const cycle: Record<string, 'available' | 'on-duty' | 'off-duty'> = {
      available: 'on-duty',
      'on-duty': 'off-duty',
      'off-duty': 'available',
    };
    setGuides((prev) => prev.map((g) => (g.id === id ? { ...g, status: cycle[g.status] } : g)));
  };

  const handleAddGuide = () => {
    const name = newGuideName.trim();
    if (!name) {
      toast.error('Guide name is required.');
      return;
    }
    const guide = {
      id: `g-${Date.now()}`,
      name,
      phone: newGuidePhone.trim() || 'N/A',
      status: 'available',
      trail: newGuideTrail.trim() || 'Unassigned',
      totalHikes: 0,
    };
    setGuides((prev) => [guide as any, ...prev]);
    setNewGuideName('');
    setNewGuidePhone('');
    setNewGuideTrail('');
    toast.success(`Guide "${name}" added.`);
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
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="container max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold mb-2">
            Admin <span className="text-gradient">Dashboard</span>
          </h1>
          <p className="text-muted-foreground mb-8">
            Monitor real-time hiker activity, manage zones, announcements, and guides.
          </p>
        </motion.div>

        <Tabs defaultValue="requests" className="space-y-6">
          <TabsList className="glass-card gap-1 h-auto flex-wrap p-1">
            <TabsTrigger value="requests" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary relative">
              <ClipboardList className="h-3.5 w-3.5" /> Bookings
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-white text-[10px] flex items-center justify-center font-bold">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <LayoutDashboard className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Megaphone className="h-3.5 w-3.5" /> Announcements
            </TabsTrigger>
            <TabsTrigger value="guides" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <UserCog className="h-3.5 w-3.5" /> Guide Management
            </TabsTrigger>
            <TabsTrigger value="capacity" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Daily Capacity
            </TabsTrigger>
            <TabsTrigger value="scan" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <ScanLine className="h-3.5 w-3.5" /> QR Check-in
            </TabsTrigger>
            <TabsTrigger value="payment-summary" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <DollarSign className="h-3.5 w-3.5" /> Finance
            </TabsTrigger>
            <TabsTrigger value="demographics" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Users className="h-3.5 w-3.5" /> Demographics
            </TabsTrigger>
          </TabsList>

          {/* ─────────────────────────────── BOOKINGS TAB ── */}
          <TabsContent value="requests" className="space-y-4">
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
              <div className="space-y-4">
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
                                  onClick={() => { setAcceptDialogId(b.id); setSelectedGuide(''); }}>
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
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4">
                <Card className="glass-card w-full max-w-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5 text-primary" /> Accept & Assign Guide
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">Select an available guide to assign to this booking.</p>
                    <div className="space-y-2">
                      <Label>Assign Guide</Label>
                      <Select value={selectedGuide} onValueChange={setSelectedGuide}>
                        <SelectTrigger><SelectValue placeholder="Select a guide…" /></SelectTrigger>
                        <SelectContent>
                          {guides.filter((g) => g.status !== 'off-duty').map((g) => (
                            <SelectItem key={g.id} value={g.name}>
                              {g.name} — <span className="capitalize">{g.status}</span> ({g.trail})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1" onClick={() => setAcceptDialogId(null)} disabled={acceptSaving}>Cancel</Button>
                      <Button className="flex-1 gap-2" onClick={handleAcceptBooking} disabled={!selectedGuide || acceptSaving}>
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
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4">
                <Card className="glass-card w-full max-w-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarClock className="h-5 w-5 text-sky-500" /> Adjust Booking Date/Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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

          {/* ─────────────────────────────── OVERVIEW TAB ── */}
          <TabsContent value="overview" className="space-y-6">
            {todaysPendingAttention.length > 0 && (
              <Card className="glass-card border-amber-500/30">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-700 dark:text-amber-300">
                        Reminder: {todaysPendingAttention.length} booking(s) today still need attention
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Pending, unconfirmed, or not-started bookings are listed in the Bookings and QR Check-in tabs.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card className="glass-card">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                          <p className="text-3xl font-bold mt-1">{s.value}</p>
                        </div>
                        <s.icon className={`h-8 w-8 ${s.color} opacity-60`} />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-lg">Weekly Visitors</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(155 15% 18%)" />
                      <XAxis dataKey="day" stroke="hsl(150 10% 55%)" fontSize={12} />
                      <YAxis stroke="hsl(150 10% 55%)" fontSize={12} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                      <Bar dataKey="visitors" fill="hsl(152 60% 42%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader><CardTitle className="text-lg">Trail Capacity Distribution</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={trailData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name }) => name}>
                        {trailData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarCheck className="h-5 w-5 text-primary" /> Booking Calendar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={calendarDate}
                    onSelect={setCalendarDate}
                    modifiers={{ booked: bookedDates }}
                    modifiersClassNames={{ booked: 'bg-primary/15 text-primary font-bold border border-primary/30 rounded-md' }}
                  />
                  <p className="text-xs text-muted-foreground mt-3">
                    Highlighted dates have bookings. Select a date to view expected bookings and statuses.
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">Expected Bookings on {selectedDateKey || 'Selected Date'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded-lg border border-border/20 bg-secondary/20 p-2">
                      <p className="text-muted-foreground">Total</p>
                      <p className="text-lg font-bold">{bookingsPerDate[selectedDateKey]?.total || 0}</p>
                    </div>
                    <div className="rounded-lg border border-border/20 bg-secondary/20 p-2">
                      <p className="text-muted-foreground">Pending</p>
                      <p className="text-lg font-bold text-amber-500">{bookingsPerDate[selectedDateKey]?.pending || 0}</p>
                    </div>
                    <div className="rounded-lg border border-border/20 bg-secondary/20 p-2">
                      <p className="text-muted-foreground">Confirmed</p>
                      <p className="text-lg font-bold text-primary">{bookingsPerDate[selectedDateKey]?.confirmed || 0}</p>
                    </div>
                    <div className="rounded-lg border border-border/20 bg-secondary/20 p-2">
                      <p className="text-muted-foreground">Started</p>
                      <p className="text-lg font-bold text-emerald-500">{bookingsPerDate[selectedDateKey]?.started || 0}</p>
                    </div>
                  </div>
                  <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
                    {selectedDateBookings.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No bookings on this date.</p>
                    ) : (
                      selectedDateBookings.map((b) => {
                        const meta = parseMeta(b.notes);
                        const started = !!meta.onsiteStartConfirmed;
                        return (
                          <div key={b.id} className="rounded-lg border border-border/20 p-3 text-sm bg-secondary/10">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold truncate">{meta.fullName || b.emergency_contact_name || '—'}</p>
                              <Badge className={started ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : BOOKING_STATUS_STYLE[b.status] || ''}>
                                {started ? 'started' : b.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{b.group_size} pax • {b.id.slice(0, 8)}…</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <TrailRecorder existingTrails={zones.map((z: any) => ({ id: z.id, name: z.name, coordinates_json: z.coordinates_json }))} onSaved={loadData} />

            <Card className="glass-card">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Zone Management</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30 text-muted-foreground">
                        <th className="text-left py-2 px-3">Zone</th>
                        <th className="text-left py-2 px-3">Difficulty</th>
                        <th className="text-left py-2 px-3">Elevation</th>
                        <th className="text-left py-2 px-3">Capacity</th>
                        <th className="text-left py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.map((z: any) => (
                        <tr key={z.id} className="border-b border-border/10">
                          <td className="py-3 px-3 font-medium">{z.name}</td>
                          <td className="py-3 px-3 capitalize">{z.difficulty}</td>
                          <td className="py-3 px-3">{z.elevation_meters}m</td>
                          <td className="py-3 px-3">{z.max_capacity}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${z.status === 'active' ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'}`}>
                              {z.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" /> Recent Bookings</CardTitle></CardHeader>
              <CardContent>
                {bookings.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No bookings yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/30 text-muted-foreground">
                          <th className="text-left py-2 px-3">Date</th>
                          <th className="text-left py-2 px-3">Group</th>
                          <th className="text-left py-2 px-3">Status</th>
                          <th className="text-left py-2 px-3">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.map((b: any) => (
                          <tr key={b.id} className="border-b border-border/10">
                            <td className="py-3 px-3">{b.booking_date}</td>
                            <td className="py-3 px-3">{b.group_size} pax</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${b.status === 'confirmed' ? 'bg-primary/20 text-primary' : b.status === 'cancelled' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'}`}>
                                {b.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─────────────────────────────── ANNOUNCEMENTS TAB ── */}
          <TabsContent value="announcements" className="space-y-6">
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

          {/* ─────────────────────────────── GUIDE MANAGEMENT TAB ── */}
          <TabsContent value="guides" className="space-y-6">
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
              <CardContent className="grid sm:grid-cols-4 gap-2">
                <Input placeholder="Full name" value={newGuideName} onChange={(e) => setNewGuideName(e.target.value)} />
                <Input placeholder="Phone" value={newGuidePhone} onChange={(e) => setNewGuidePhone(e.target.value)} />
                <Input placeholder="Assigned trail" value={newGuideTrail} onChange={(e) => setNewGuideTrail(e.target.value)} />
                <Button onClick={handleAddGuide}>Add Guide</Button>
              </CardContent>
            </Card>

            {/* Guide search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search guides by name or trail…" value={guideSearch} onChange={(e) => setGuideSearch(e.target.value)} className="pl-9" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {filteredGuides.map((guide) => (
                <Card key={guide.id} className={`glass-card cursor-pointer transition-all ${selectedGuideId === guide.id ? 'border-primary/50 ring-1 ring-primary/30' : ''}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary font-bold text-lg">
                          {guide.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold">{guide.name}</p>
                          <p className="text-xs text-muted-foreground">{guide.phone}</p>
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

                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => cycleGuideStatus(guide.id)}>
                        <UserCog className="h-3.5 w-3.5 mr-1.5" /> Change Status
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => handleSelectGuide(guide)}>
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                        {selectedGuideId === guide.id ? 'Hide History' : 'View History'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
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
              <div className="fixed right-4 top-24 z-40 w-[360px] max-w-[90vw]">
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
          </TabsContent>

          {/* ─────────────────────────────── DAILY CAPACITY TAB ── */}
          <TabsContent value="capacity" className="space-y-6">
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

          {/* ─────────────────────────────── QR CHECK-IN TAB ── */}
          <TabsContent value="scan" className="space-y-6">
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
                  const { totalFee } = calculateFees(scannedBooking.group_size);
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
                        <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/30 p-3 text-sm text-primary font-semibold">
                          <CheckCircle2 className="h-5 w-5" />
                          Hike already started — session is active.
                          {meta.onsiteStartTime && (
                            <span className="text-xs font-normal text-muted-foreground ml-auto">
                              {new Date(meta.onsiteStartTime).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      ) : scannedBooking.status !== 'confirmed' ? (
                        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          Booking is not confirmed yet. Confirm booking first before starting the hike.
                        </div>
                      ) : (
                        <Button className="w-full gap-2" onClick={handleStartHike} disabled={startingHike}>
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

          {removeGuideId && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <Card className="glass-card w-full max-w-md border-destructive/30">
                <CardHeader>
                  <CardTitle>Remove Guide</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Enter admin password to remove <strong>{guides.find((g) => g.id === removeGuideId)?.name}</strong>.
                  </p>
                  <Input
                    type="password"
                    placeholder="Admin password"
                    value={removeGuidePassword}
                    onChange={(e) => setRemoveGuidePassword(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setRemoveGuideId(null); setRemoveGuidePassword(''); }}>
                      Cancel
                    </Button>
                    <Button className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleRemoveGuide}>
                      Confirm Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─────────────────────────────── FINANCE TAB ── */}
          <TabsContent value="payment-summary">
            <PaymentSummaryTab />
          </TabsContent>

          {/* ─────────────────────────────── DEMOGRAPHICS TAB ── */}
          <TabsContent value="demographics">
            <DemographicsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Floating collapsible booking calendar */}
      <div className="fixed right-4 bottom-4 z-50 w-[360px] max-w-[92vw]">
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
            <CardContent className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
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
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  ADMIN_CHECKIN_TOKEN_PREFIX,
  isAdminAuthorizedSession,
} from '@/lib/tracking/sessionAuthorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  CalendarCheck,
  Users,
  Mountain,
  Phone,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Clock,
  MapPin,
  XCircle,
  Inbox,
  Activity,
  Copy,
  ImageUp,
  Share2,
  Radio,
  Sparkles,
  ArrowRight,
  HeartPulse,
  FileText,
  AlertTriangle,
  MessageCircle,
  DollarSign,
  Receipt,
  Star,
  TrendingUp,
  Wallet,
  Calendar,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { parseMeta } from '@/lib/bookingMeta';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GuideOffDutyForm } from '@/components/booking/OffDutyManager';
import { isFirebaseConfigured, uploadGuideProfilePhoto } from '@/lib/firebase-storage';
import GuideDeclineModal from '@/components/booking/GuideDeclineModal';
import BookingChat from '@/components/booking/BookingChat';
import { acceptGuideAssignment } from '@/lib/guideAssignmentService';
import { calculateGuideEarnings, GuideEarningsSummary } from '@/lib/guideEarnings';
import { formatPeso } from '@/lib/payments';

const QUOTA_PER_GUIDE_PER_DAY = 5;

type AssignmentStatus = 'pending' | 'accepted' | 'declined' | 'completed';

interface AssignmentRow {
  id: string;
  booking_id: string;
  status: AssignmentStatus;
  decided_at: string | null;
  reassignment_reason?: string | null;
  created_at: string;
  guide_id: string;
  location_id: string;
  booking: any;
  guide_name?: string;
}

export default function GuideDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [guideRow, setGuideRow] = useState<any>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [peerGuides, setPeerGuides] = useState<any[]>([]);
  const [peerCounts, setPeerCounts] = useState<Record<string, { active: number; total: number }>>({});
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | AssignmentStatus>('all');
  const [detailOpen, setDetailOpen] = useState<AssignmentRow | null>(null);
  const [declineOpen, setDeclineOpen] = useState<AssignmentRow | null>(null);
  const [chatBooking, setChatBooking] = useState<{ id: string; date: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [earningsFilter, setEarningsFilter] = useState<'all' | 'completed' | 'pending'>('all');

  useEffect(() => {
    if (!user) return;
    void load();

    // Listen for realtime booking assignment changes, bookings, and check-ins
    const ch = supabase
      .channel('guide-assignments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_assignments' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guide_reviews' }, () => void load())
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hiker_sessions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const session = payload.new as { status?: string; client_session_id?: string | null };
          if (session.status === 'active' && isAdminAuthorizedSession(session.client_session_id)) {
            setActiveSession(session);
            toast.success('Group check-in confirmed! Live GPS tracker is ready.');
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hiker_sessions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const session = payload.new as { status?: string };
          if (session.status !== 'active') {
            setActiveSession(null);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      // 1. Find this user's guide row
      const { data: guides } = await supabase
        .from('guides' as any)
        .select('*')
        .eq('user_id', user!.id)
        .limit(1);
      const me = (guides as any[] | null)?.[0] ?? null;
      setGuideRow(me);

      if (!me) {
        setLoading(false);
        return;
      }

      // 2. Check for active hike session without forceful redirect
      const { data: session } = await supabase
        .from('hiker_sessions')
        .select('id, client_session_id, start_time, status')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .like('client_session_id', `${ADMIN_CHECKIN_TOKEN_PREFIX}%`)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveSession(session || null);

      // 3. Fetch assignments for me + peer guides at same location + reviews
      const [{ data: mineRaw }, { data: peers }, { data: reviewsData }] = await Promise.all([
        supabase
          .from('booking_assignments' as any)
          .select('*')
          .eq('guide_id', me.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('guides' as any)
          .select('id, full_name, is_active, specialty, phone, user_id, location_id, status, per_trip_fee')
          .eq('location_id', me.location_id)
          .eq('is_active', true),
        supabase
          .from('guide_reviews' as any)
          .select('*')
          .eq('guide_id', me.id)
          .eq('is_approved', true)
          .order('created_at', { ascending: false }),
      ]);

      const mineList = ((mineRaw as any[]) ?? []) as AssignmentRow[];
      setReviews((reviewsData as any[]) || []);

      // 4. Pull full bookings data for the assignments
      const bookingIds = Array.from(new Set(mineList.map((a: any) => a.booking_id))).filter(Boolean);
      const bookingMap: Record<string, any> = {};
      if (bookingIds.length > 0) {
        const { data: bks } = await supabase
          .from('bookings')
          .select('*')
          .in('id', bookingIds);
        (bks ?? []).forEach((b: any) => {
          bookingMap[b.id] = b;
        });
      }
      mineList.forEach((a: any) => {
        a.booking = bookingMap[a.booking_id];
      });
      setAssignments(mineList);

      // 5. Peer guide stats
      const peersList = (peers as any[]) ?? [];
      setPeerGuides(peersList);
      if (peersList.length > 0) {
        const peerIds = peersList.map((g: any) => g.id);
        const { data: allAss } = await supabase
          .from('booking_assignments' as any)
          .select('guide_id, status')
          .in('guide_id', peerIds);
        const counts: Record<string, { active: number; total: number }> = {};
        ((allAss as any[]) ?? []).forEach((row: any) => {
          const c = (counts[row.guide_id] ??= { active: 0, total: 0 });
          c.total += 1;
          if (row.status === 'accepted') c.active += 1;
        });
        setPeerCounts(counts);
      }
    } catch (err: any) {
      console.error('Failed to load guide dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Earnings calculations
  const earnings: GuideEarningsSummary = useMemo(() => {
    return calculateGuideEarnings(assignments, guideRow?.per_trip_fee);
  }, [assignments, guideRow]);

  const counts = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return {
      pending: assignments.filter((a) => a.status === 'pending').length,
      accepted: assignments.filter((a) => a.status === 'accepted').length,
      completed: assignments.filter((a) => a.status === 'completed').length,
      declined: assignments.filter((a) => a.status === 'declined').length,
      todayAccepted: assignments.filter(
        (a) => a.status === 'accepted' && a.booking?.booking_date === today
      ).length,
    };
  }, [assignments]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return null;
    const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 5), 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const filteredAssignments = filter === 'all'
    ? assignments
    : assignments.filter((a) => a.status === filter);

  const filteredHikeRecords = earnings.hikeRecords.filter((r) => {
    if (earningsFilter === 'completed') return r.assignmentStatus === 'completed';
    if (earningsFilter === 'pending') return r.assignmentStatus === 'accepted' || r.assignmentStatus === 'pending';
    return true;
  });

  /* ── Duty Status Toggle ── */
  const handleDutyStatusChange = async (newStatus: string) => {
    if (!guideRow) return;
    setStatusUpdating(true);
    try {
      const { error } = await supabase
        .from('guides' as any)
        .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
        .eq('id', guideRow.id);
      if (error) throw error;
      setGuideRow((current: any) => ({ ...current, status: newStatus }));
      toast.success(`Duty status updated to ${newStatus.replace('_', ' ').toUpperCase()}`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not update duty status');
    } finally {
      setStatusUpdating(false);
    }
  };

  /* ── Accept assignment ── */
  const handleAccept = async (a: AssignmentRow) => {
    if (a.booking?.booking_date) {
      // Check quota limit
      const sameDay = assignments.filter(
        (x) => x.status === 'accepted' && x.booking?.booking_date === a.booking.booking_date
      ).length;
      if (sameDay >= QUOTA_PER_GUIDE_PER_DAY) {
        toast.error(
          `Daily Quota reached for ${a.booking.booking_date}: Maximum ${QUOTA_PER_GUIDE_PER_DAY} bookings per guide/day.`
        );
        return;
      }
    }

    setAcceptingId(a.id);
    try {
      const res = await acceptGuideAssignment({
        assignmentId: a.id,
        bookingId: a.booking_id || a.booking?.id,
        guideId: guideRow.id,
        guideName: guideRow.full_name,
        guideUserId: user?.id,
        hikerUserId: a.booking?.user_id,
        bookingDate: a.booking?.booking_date,
      });

      if (res.success) {
        toast.success(`✅ Booking accepted! Hiker and admin have been notified.`);
        void load();
      } else {
        toast.error(res.error || 'Failed to accept booking');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error accepting booking');
    } finally {
      setAcceptingId(null);
    }
  };

  /* ── Mark complete ── */
  const handleMarkComplete = async (a: AssignmentRow) => {
    try {
      const { error } = await supabase
        .from('booking_assignments' as any)
        .update({ status: 'completed', decided_at: new Date().toISOString() } as any)
        .eq('id', a.id);

      if (error) throw error;
      toast.success('Hike marked as completed. Great job!');
      void load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update assignment');
    }
  };

  const copyGuideLink = async (kind: 'profile' | 'booking') => {
    if (!guideRow) return;
    const url = `${window.location.origin}/${
      kind === 'profile' ? `guide/${guideRow.id}` : `register?guide=${guideRow.id}`
    }`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(
        kind === 'profile' ? 'Guide profile link copied' : 'Registration referral link copied'
      );
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const handlePhotoUpload = async (file?: File) => {
    if (!file || !guideRow) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    if (!isFirebaseConfigured()) {
      toast.error('Photo upload needs Firebase Storage configuration.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const upload = await uploadGuideProfilePhoto(file, guideRow.id);
      if (!upload) throw new Error('Photo storage is unavailable.');
      const { error } = await supabase
        .from('guides' as any)
        .update({ photo_url: upload.url } as any)
        .eq('id', guideRow.id);
      if (error) throw error;
      setGuideRow((current: any) => ({ ...current, photo_url: upload.url }));
      toast.success('Guide photo updated.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not upload guide photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen pt-20 text-center text-muted-foreground">
        Please sign in as a guide to view this dashboard.
      </div>
    );
  }

  if (loading && !guideRow) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!guideRow) {
    return (
      <div className="min-h-screen pt-24 px-4 max-w-2xl mx-auto">
        <Card className="glass-card border-orange-500/30">
          <CardContent className="p-6 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 mx-auto text-orange-500" />
            <h2 className="text-xl font-bold">Guide Profile Not Linked</h2>
            <p className="text-sm text-muted-foreground">
              Your account has the <strong>guide</strong> role but is not linked to a guide record yet. The LGU admin
              can link your account under Admin Management $\rightarrow$ Guide Roster.
            </p>
            <p className="text-xs text-muted-foreground font-mono">User ID: {user.id}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-3 pb-12 pt-20 sm:px-4">
      <div className="container max-w-6xl mx-auto space-y-6">
        {/* Active Hike Session Notification Banner */}
        {activeSession && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
                <Radio className="h-5 w-5 animate-pulse text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                  Live Hike Session Active
                  <Badge className="bg-emerald-500 text-white text-[10px] py-0">GPS Tracking On</Badge>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your guided group check-in is currently running on Mount Kalisungan.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                onClick={() => navigate('/map?auto=1')}
              >
                <Mountain className="h-3.5 w-3.5" />
                Open Live GPS Map
              </Button>
            </div>
          </motion.div>
        )}

        {/* Dashboard Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl flex items-center gap-2">
              Tour Guide <span className="text-gradient">Portal</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Welcome, <strong>{guideRow.full_name}</strong>. Manage your bookings, accept new assignments, and collaborate with peer guides.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/map')}
              className="gap-1.5 text-xs rounded-xl"
            >
              <Mountain className="h-3.5 w-3.5 text-primary" />
              Explore Trail Map
            </Button>
          </div>
        </motion.div>

        {/* Guide Profile Quick Bar */}
        <Card className="glass-card">
          <CardContent className="p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3.5 min-w-0">
              {guideRow.photo_url ? (
                <img
                  src={guideRow.photo_url}
                  alt={guideRow.full_name}
                  className="h-16 w-16 shrink-0 rounded-2xl object-cover border border-border/40 shadow-sm"
                />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-2xl bg-primary/15 text-primary grid place-items-center font-bold text-2xl border border-primary/20">
                  {guideRow.full_name?.slice(0, 1)?.toUpperCase() || 'G'}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-foreground text-base truncate">{guideRow.full_name}</p>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                    Official Guide
                  </Badge>
                  {averageRating && (
                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] gap-1">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {averageRating} ({reviews.length})
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {guideRow.specialty || 'Mount Kalisungan Eco-Guide'} • {guideRow.phone || 'Phone on file'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Standard Rate: <strong>₱{guideRow.per_trip_fee || 800}</strong> / group (up to 8 pax)
                </p>
              </div>
            </div>

            {/* Duty Status Selector & Quick Actions */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-border/20">
              <div className="flex items-center gap-1.5 bg-secondary/40 px-3 py-1.5 rounded-xl border border-border/40">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase">Duty Status:</span>
                <Select
                  value={guideRow.status || 'available'}
                  onValueChange={(val) => void handleDutyStatusChange(val)}
                  disabled={statusUpdating}
                >
                  <SelectTrigger className="h-7 text-xs font-bold border-none bg-transparent shadow-none px-1.5 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      🟢 Available (Ready for Dispatches)
                    </SelectItem>
                    <SelectItem value="on_duty" className="text-xs font-medium text-primary">
                      🔵 On Duty (Currently on Trail)
                    </SelectItem>
                    <SelectItem value="off_duty" className="text-xs font-medium text-muted-foreground">
                      ⚪ Off Duty (Not Accepting Hikes)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {statusUpdating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>

              <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-input bg-background px-3 text-xs font-medium hover:bg-accent transition-all">
                {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
                Update Photo
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  disabled={uploadingPhoto}
                  onChange={(event) => void handlePhotoUpload(event.target.files?.[0])}
                />
              </label>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-xl" onClick={() => void copyGuideLink('profile')}>
                <Share2 className="h-3.5 w-3.5" /> Share Profile
              </Button>
              <Button size="sm" className="gap-1.5 text-xs rounded-xl" onClick={() => void copyGuideLink('booking')}>
                <Copy className="h-3.5 w-3.5" /> Referral Link
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats Grid (Including Total Earnings) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Pending Acceptance', value: counts.pending, icon: Inbox, color: 'text-amber-500', alert: counts.pending > 0 },
            { label: 'Confirmed Hikes', value: counts.accepted, icon: CheckCircle2, color: 'text-primary' },
            {
              label: "Today's Limit",
              value: `${counts.todayAccepted}/${QUOTA_PER_GUIDE_PER_DAY}`,
              icon: Activity,
              color: counts.todayAccepted >= QUOTA_PER_GUIDE_PER_DAY ? 'text-destructive' : 'text-emerald-500',
            },
            { label: 'Completed Hikes', value: counts.completed, icon: Mountain, color: 'text-sky-500' },
            {
              label: 'Total Earned',
              value: formatPeso(earnings.lifetimeEarned),
              icon: DollarSign,
              color: 'text-emerald-500 font-extrabold',
            },
            {
              label: 'Pending Payout',
              value: formatPeso(earnings.pendingEarnings),
              icon: Wallet,
              color: 'text-primary font-extrabold',
            },
          ].map((s) => (
            <Card
              key={s.label}
              className={`glass-card transition-all ${
                s.alert ? 'border-amber-500/40 bg-amber-500/5 shadow-md' : ''
              }`}
            >
              <CardContent className="p-3.5 flex items-center gap-2.5">
                <div className={`p-2 rounded-xl bg-secondary/50 ${s.color}`}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground truncate">
                    {s.label}
                  </p>
                  <p className={`text-base font-bold text-foreground mt-0.5 truncate ${s.color}`}>{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="my" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <TabsList className="glass-card">
              <TabsTrigger value="my" className="gap-1.5 text-xs">
                <Inbox className="h-3.5 w-3.5" />
                My Assignments
                {counts.pending > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-bold text-[10px]">
                    {counts.pending}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="earnings" className="gap-1.5 text-xs">
                <Receipt className="h-3.5 w-3.5" />
                Earnings & Hike Ledger
              </TabsTrigger>
              <TabsTrigger value="reviews" className="gap-1.5 text-xs">
                <Star className="h-3.5 w-3.5" />
                Hiker Reviews ({reviews.length})
              </TabsTrigger>
              <TabsTrigger value="peers" className="gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                Peer Guides ({peerGuides.length})
              </TabsTrigger>
              <TabsTrigger value="off" className="gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5" />
                Schedule & Off-Duty
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab 1: My Assignments */}
          <TabsContent value="my" className="space-y-4 mt-0">
            {/* Filter Pills */}
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'pending', 'accepted', 'completed', 'declined'] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? 'default' : 'outline'}
                  onClick={() => setFilter(f)}
                  className="capitalize text-xs h-8 rounded-xl"
                >
                  {f === 'pending'
                    ? `Pending Confirmation (${counts.pending})`
                    : f === 'accepted'
                    ? `Confirmed (${counts.accepted})`
                    : f}
                </Button>
              ))}
            </div>

            {filteredAssignments.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="text-center py-14 text-muted-foreground text-sm space-y-2">
                  <Inbox className="h-10 w-10 mx-auto opacity-30" />
                  <p className="font-semibold text-foreground">No bookings found in this view</p>
                  <p className="text-xs text-muted-foreground">
                    When hikers book Mount Kalisungan and you are assigned, they will appear here in real-time.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3.5">
                {filteredAssignments.map((a) => {
                  const booking = a.booking;
                  const meta = parseMeta(booking?.notes);
                  const isPending = a.status === 'pending';
                  const isAccepted = a.status === 'accepted';
                  const isDeclined = a.status === 'declined';
                  const isCompleted = a.status === 'completed';
                  const feeAmount = meta.guideFee || (guideRow?.per_trip_fee || 800);

                  return (
                    <Card
                      key={a.id}
                      className={`glass-card transition-all ${
                        isPending
                          ? 'border-amber-500/40 bg-amber-500/5 shadow-md'
                          : isAccepted
                          ? 'border-primary/30'
                          : ''
                      }`}
                    >
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-3">
                            {/* Header row with status & date */}
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <Badge
                                className={
                                  isPending
                                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                    : isAccepted
                                    ? 'bg-primary/20 text-primary border-primary/30'
                                    : isCompleted
                                    ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/30'
                                    : 'bg-muted text-muted-foreground'
                                }
                              >
                                {isPending
                                  ? '⏳ Action Required: Pending Your Acceptance'
                                  : isAccepted
                                  ? '✅ Confirmed & Assigned to You'
                                  : isCompleted
                                  ? '🏁 Hike Completed'
                                  : '❌ Declined'}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Booking #{a.booking_id ? a.booking_id.slice(0, 8) : a.id.slice(0, 8)}
                              </span>
                              <Badge variant="outline" className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                Fee: {formatPeso(feeAmount)}
                              </Badge>
                              {a.created_at && (
                                <span className="text-xs text-muted-foreground">
                                  • Assigned {format(new Date(a.created_at), 'MMM d, h:mm a')}
                                </span>
                              )}
                            </div>

                            {/* Hiker Details Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <Field
                                icon={CalendarCheck}
                                label="Hike Date"
                                value={booking?.booking_date ?? 'Not set'}
                                highlight
                              />
                              <Field
                                icon={Users}
                                label="Lead Hiker & Group"
                                value={`${meta.fullName || 'Hiker'} (${booking?.group_size ?? 1} pax)`}
                              />
                              <Field
                                icon={MapPin}
                                label="Trail / Start Time"
                                value={meta.assignedTrailName || meta.hikeTime || 'Morning Standard'}
                              />
                              <Field
                                icon={Phone}
                                label="Contact Phone"
                                value={
                                  meta.phoneNumber ? (
                                    <a
                                      href={`tel:${meta.phoneNumber}`}
                                      className="underline hover:text-primary"
                                    >
                                      {meta.phoneNumber}
                                    </a>
                                  ) : (
                                    booking?.emergency_contact_phone || '—'
                                  )
                                }
                              />
                            </div>

                            {/* Special notes & medical alerts */}
                            {(meta.medicalNotes || meta.userNotes || a.reassignment_reason) && (
                              <div className="flex flex-wrap gap-2 pt-1 text-xs">
                                {meta.medicalNotes && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                                    <HeartPulse className="h-3 w-3" />
                                    Medical: {meta.medicalNotes}
                                  </span>
                                )}
                                {meta.userNotes && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary/80 text-muted-foreground">
                                    <FileText className="h-3 w-3" />
                                    Note: {meta.userNotes}
                                  </span>
                                )}
                                {a.reassignment_reason && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-muted-foreground italic">
                                    Decline Reason: {a.reassignment_reason}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-row lg:flex-col gap-2 shrink-0 justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-border/20">
                            {isPending && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleAccept(a)}
                                  disabled={acceptingId === a.id}
                                  className="text-xs h-9 gap-1.5 bg-primary shadow-sm"
                                >
                                  {acceptingId === a.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  )}
                                  Accept Hike
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDeclineOpen(a)}
                                  className="text-xs h-9 gap-1.5 text-destructive hover:bg-destructive/10"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Decline / Pass
                                </Button>
                              </>
                            )}

                            {isAccepted && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMarkComplete(a)}
                                  className="text-xs h-9 gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Mark Complete
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeclineOpen(a)}
                                  className="text-xs h-8 text-muted-foreground hover:text-destructive"
                                >
                                  Reassign to Peer
                                </Button>
                              </>
                            )}

                            {/* Direct Hiker Chat Button */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setChatBooking({ id: a.booking_id || a.id, date: booking?.booking_date || 'Upcoming' })}
                              className="text-xs h-8 gap-1.5 text-primary border-primary/30"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              Chat with Hiker
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDetailOpen(a)}
                              className="text-xs h-8 text-muted-foreground"
                            >
                              View Details
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Earnings & Hike Settlement Ledger */}
          <TabsContent value="earnings" className="space-y-4 mt-0">
            {/* Earnings Summary Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="glass-card border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] uppercase font-semibold">Lifetime Earned</span>
                    <DollarSign className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {formatPeso(earnings.lifetimeEarned)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {earnings.completedHikesCount} completed hikes settled
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] uppercase font-semibold">This Month</span>
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {formatPeso(earnings.thisMonthEarned)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Current calendar month
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] uppercase font-semibold">This Week</span>
                    <Calendar className="h-4 w-4 text-sky-500" />
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {formatPeso(earnings.thisWeekEarned)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Monday to Sunday window
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-card border-primary/30 bg-primary/5">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] uppercase font-semibold">Pending Payout</span>
                    <Wallet className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-xl font-bold text-primary">
                    {formatPeso(earnings.pendingEarnings)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {earnings.acceptedHikesCount} confirmed upcoming hikes
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Hike-by-Hike Settlement Ledger */}
            <Card className="glass-card">
              <CardHeader className="p-4 sm:p-6 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-primary" />
                    Hike Settlement & Earnings Ledger
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Itemized record of all your guided hikes, fee breakdowns, and payment settlement statuses.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-1.5">
                  {(['all', 'completed', 'pending'] as const).map((mode) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant={earningsFilter === mode ? 'default' : 'outline'}
                      onClick={() => setEarningsFilter(mode)}
                      className="capitalize text-xs h-7 rounded-lg"
                    >
                      {mode === 'all' ? 'All Hikes' : mode === 'completed' ? 'Settled & Completed' : 'Upcoming / Pending'}
                    </Button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-6 pt-0 space-y-3">
                {filteredHikeRecords.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm space-y-1">
                    <Receipt className="h-8 w-8 mx-auto opacity-30" />
                    <p>No hike earnings records found for this filter.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {filteredHikeRecords.map((record) => (
                      <div
                        key={record.assignmentId}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-foreground text-sm">
                              {record.hikerName}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {record.groupSize} {record.groupSize === 1 ? 'Hiker' : 'Hikers'}
                            </Badge>
                            <Badge
                              className={
                                record.assignmentStatus === 'completed'
                                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]'
                                  : record.assignmentStatus === 'accepted'
                                  ? 'bg-primary/20 text-primary border-primary/30 text-[10px]'
                                  : 'bg-muted text-muted-foreground text-[10px]'
                              }
                            >
                              {record.assignmentStatus === 'completed'
                                ? 'Completed & Settled'
                                : record.assignmentStatus === 'accepted'
                                ? 'Upcoming Confirmed'
                                : 'Pending'}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground">
                            Date: <strong>{record.hikeDate || 'Scheduled'}</strong> • Ref #{record.bookingId.slice(0, 8)} • Payment: {record.paymentMethod}
                          </p>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0">
                          <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                            +{formatPeso(record.guideFee)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {record.assignmentStatus === 'completed' ? 'Settled in Account' : 'Expected upon completion'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Hiker Reviews & Ratings */}
          <TabsContent value="reviews" className="space-y-4 mt-0">
            <Card className="glass-card">
              <CardHeader className="p-4 sm:p-6 pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                      Hiker Reviews & Ratings
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      Feedback from hikers guided on Mount Kalisungan trails.
                    </CardDescription>
                  </div>
                  {averageRating && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span className="font-extrabold text-foreground text-sm">{averageRating} / 5.0</span>
                      <span className="text-xs text-muted-foreground">({reviews.length} reviews)</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-3 space-y-3">
                {reviews.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm space-y-1">
                    <Star className="h-8 w-8 mx-auto opacity-30" />
                    <p>No hiker reviews recorded yet.</p>
                    <p className="text-xs text-muted-foreground">When hikers rate their completed hike with you, their comments will appear here.</p>
                  </div>
                ) : (
                  reviews.map((r) => (
                    <div
                      key={r.id}
                      className="p-3.5 rounded-xl border border-border/30 bg-secondary/15 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-sm">
                          {r.reviewer_name || 'Mount Kalisungan Hiker'}
                        </span>
                        <div className="flex items-center gap-1 text-amber-500 font-bold">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span>{r.rating} / 5</span>
                        </div>
                      </div>
                      <p className="text-muted-foreground italic leading-relaxed">
                        "{r.comment || 'Great guiding experience!'}"
                      </p>
                      {r.created_at && (
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(r.created_at), 'MMMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Peer Guides Transparency Board */}
          <TabsContent value="peers" className="mt-0">
            <Card className="glass-card">
              <CardHeader className="p-4 sm:p-6 pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Trailhead Guide Transparency Board
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Active guides registered at Mount Kalisungan and their current assignment distribution.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-3 space-y-2.5">
                {peerGuides.map((g: any) => {
                  const c = peerCounts[g.id] ?? { active: 0, total: 0 };
                  const isMe = g.id === guideRow.id;
                  return (
                    <div
                      key={g.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                        isMe
                          ? 'border-primary/40 bg-primary/5 shadow-sm'
                          : 'border-border/20 bg-secondary/20'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-9 w-9 rounded-xl grid place-items-center font-bold text-sm shrink-0 ${
                            isMe ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                          }`}
                        >
                          {g.full_name?.slice(0, 1)?.toUpperCase() || 'G'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground truncate">
                              {g.full_name}
                            </span>
                            {isMe && <Badge className="text-[10px] py-0">You</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {g.specialty || 'General Trail Guide'} • {g.phone || 'Phone on file'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs shrink-0">
                        <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold">
                          {c.active} active hikes
                        </span>
                        <span className="text-muted-foreground">{c.total} total completed</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Off-Duty Schedule Manager */}
          <TabsContent value="off" className="mt-0">
            {guideRow ? (
              <GuideOffDutyForm guideId={guideRow.id} onChange={load} />
            ) : (
              <p className="text-sm text-muted-foreground">Loading guide profile…</p>
            )}
          </TabsContent>
        </Tabs>

        {/* View Details Dialog */}
        <Dialog open={!!detailOpen} onOpenChange={(o) => !o && setDetailOpen(null)}>
          <DialogContent className="z-[3100] max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mountain className="h-5 w-5 text-primary" />
                Booking #{detailOpen?.booking_id?.slice(0, 8) || detailOpen?.id.slice(0, 8)}
              </DialogTitle>
            </DialogHeader>
            {detailOpen && (() => {
              const booking = detailOpen.booking;
              const meta = parseMeta(booking?.notes);
              return (
                <div className="space-y-3 text-xs sm:text-sm divide-y divide-border/20">
                  <div className="pb-2 space-y-1">
                    <Row k="Status" v={<Badge>{detailOpen.status}</Badge>} />
                    <Row k="Hike Date" v={booking?.booking_date} />
                    <Row k="Start Time" v={meta.hikeTime || 'Morning'} />
                    <Row k="Group Size" v={`${booking?.group_size ?? 1} hikers`} />
                  </div>
                  <div className="py-2 space-y-1">
                    <Row k="Lead Hiker" v={meta.fullName ?? '—'} />
                    <Row k="Contact Phone" v={meta.phoneNumber ?? '—'} />
                    <Row k="Email" v={meta.emailAddress ?? '—'} />
                    <Row
                      k="Emergency Contact"
                      v={`${booking?.emergency_contact_name ?? '—'} (${booking?.emergency_contact_phone ?? '—'})`}
                    />
                  </div>
                  <div className="py-2 space-y-1">
                    <Row k="Trail / Route" v={meta.assignedTrail || 'Standard Kalisungan Route'} />
                    <Row k="Medical Notes" v={meta.medicalNotes ?? 'None specified'} />
                    <Row k="Hiker Notes" v={meta.userNotes ?? 'None'} />
                    {detailOpen.reassignment_reason && (
                      <Row k="Decline Reason" v={detailOpen.reassignment_reason} />
                    )}
                    {meta.guideChangeReason && (
                      <Row k="Reassignment Note" v={meta.guideChangeReason} />
                    )}
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Decline & Reassign Modal */}
        <GuideDeclineModal
          open={!!declineOpen}
          onClose={() => setDeclineOpen(null)}
          assignment={declineOpen}
          currentGuide={guideRow}
          peerGuides={peerGuides}
          onSuccess={load}
        />

        {/* Direct Booking Chat Modal with Hiker */}
        {chatBooking && (
          <BookingChat
            bookingId={chatBooking.id}
            bookingDate={chatBooking.date}
            open={!!chatBooking}
            onOpenChange={(o) => !o && setChatBooking(null)}
          />
        )}
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${highlight ? 'text-primary' : 'text-muted-foreground'}`} />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase font-semibold">{label}</p>
        <p className={`font-medium truncate ${highlight ? 'text-primary font-bold' : 'text-foreground'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{k}:</span>
      <span className="text-right font-medium text-foreground break-words max-w-[60%]">{v}</span>
    </div>
  );
}

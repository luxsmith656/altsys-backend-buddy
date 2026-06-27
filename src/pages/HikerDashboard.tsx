import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarCheck,
  Map,
  Bot,
  Mountain,
  QrCode,
  Trash2,
  Loader2,
  User,
  ArrowRight,
  Bell,
  UserCheck,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarClock,
  Star,
  Send,
  MessageCircle,
} from 'lucide-react';
import BookingChat from '@/components/booking/BookingChat';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import SOSPanel from '@/components/core/SOSPanel';
import { parseMeta } from '@/lib/bookingMeta';
import { loadAnnouncements, type AdminAnnouncement } from '@/lib/announcements';
import { addGuideRating } from '@/lib/guideRatings';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-primary/20 text-primary',
  pending: 'bg-warning/20 text-warning',
  cancelled: 'bg-destructive/20 text-destructive',
  adjustment_pending: 'bg-sky-500/20 text-sky-600 dark:text-sky-400',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  pending: 'Awaiting Approval',
  cancelled: 'Cancelled',
  adjustment_pending: 'Date Adjusted — Action Required',
};

export default function HikerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [importantAnnouncements, setImportantAnnouncements] = useState<AdminAnnouncement[]>([]);
  // Review state
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [hikeRating, setHikeRating] = useState(5);
  const [hikeReviewText, setHikeReviewText] = useState('');
  const [guideRating, setGuideRating] = useState(5);
  const [guideReviewText, setGuideReviewText] = useState('');
  const [reviewedSessionIds, setReviewedSessionIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('reviewed_sessions') || '[]')); } catch { return new Set(); }
  });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [chatBooking, setChatBooking] = useState<{ id: string; date: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    loadData();

    // Auto-start: when admin checks in the hiker via QR, a new active
    // hiker_session is inserted. We detect it via realtime and jump to /map.
    const ch = supabase
      .channel(`hiker-autostart-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hiker_sessions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { status?: string };
          if (row?.status === 'active') {
            toast.success('Check-in confirmed! Opening tracker…');
            navigate('/map?auto=1');
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, navigate]);

  const loadData = async () => {
    const [{ data: b }, { data: s }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user!.id)
        .order('booking_date', { ascending: false }),
      supabase
        .from('hiker_sessions')
        .select('*')
        .eq('user_id', user!.id)
        .order('start_time', { ascending: false }),
    ]);
    setBookings(b || []);
    setSessions(s || []);
    setImportantAnnouncements(loadAnnouncements().filter((a) => a.isImportant));
  };

  const totalDistance = sessions.reduce((sum, s) => sum + Number(s.total_distance_km || 0), 0);

  /* ── Cancel booking ── */
  const handleCancelBooking = async (bookingId: string) => {
    setCancellingId(bookingId);
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId);
    if (error) toast.error('Failed to cancel booking');
    else {
      toast.success('Booking cancelled.');
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' } : b)));
    }
    setCancellingId(null);
  };

  /* ── Accept admin-adjusted date ── */
  const handleAcceptAdjustment = async (b: any) => {
    setAcceptingId(b.id);
    const meta = parseMeta(b.notes);
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        booking_date: meta.adjustedDate ?? b.booking_date,
      })
      .eq('id', b.id);
    if (error) toast.error('Failed to confirm adjustment');
    else {
      toast.success('You accepted the new schedule. Booking confirmed!');
      loadData();
    }
    setAcceptingId(null);
  };

  /* ── Decline admin-adjusted date ── */
  const handleDeclineAdjustment = async (bookingId: string) => {
    setDecliningId(bookingId);
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId);
    if (error) toast.error('Failed to decline');
    else {
      toast.success('Adjustment declined. Booking cancelled.');
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' } : b)));
    }
    setDecliningId(null);
  };

  /* ── Submit hike review ── */
  const handleSubmitReview = async (session: any) => {
    if (!user || !hikeReviewText.trim()) { toast.error('Please write a review.'); return; }
    setSubmittingReview(true);
    // Find booking for this session to get guide info
    const booking = bookings.find((b) => b.id === session.booking_id);
    const meta = booking ? parseMeta(booking.notes) : {};
    const assignedGuide = meta.assignedGuide;

    // Submit hiking experience review to Supabase
    const { error } = await supabase
      .from('reviews')
      .insert({
        user_id: user.id,
        reviewer_name: meta.fullName || user.email || 'Hiker',
        rating: hikeRating,
        review_text: hikeReviewText.trim(),
        trail_name: 'Summit Trail',
        is_approved: true,
      });

    if (error) {
      toast.error('Failed to submit review: ' + error.message);
    } else {
      // Save guide rating to localStorage if guide was assigned and rated
      if (assignedGuide && guideReviewText.trim()) {
        const guideId = `guide_${assignedGuide.replace(/\s+/g, '_').toLowerCase()}`;
        addGuideRating(guideId, assignedGuide, 'Summit Trail', guideRating, guideReviewText.trim(), meta.fullName || 'Hiker');
      }
      // Mark session as reviewed
      const updated = new Set([...reviewedSessionIds, session.id]);
      setReviewedSessionIds(updated);
      localStorage.setItem('reviewed_sessions', JSON.stringify([...updated]));
      setReviewSessionId(null);
      setHikeReviewText('');
      setGuideReviewText('');
      toast.success('Thank you for your review! It helps future hikers.');
    }
    setSubmittingReview(false);
  };

  /* ── Derived data ── */
  const adjustmentPending = bookings.filter((b) => b.status === 'adjustment_pending');
  const hasNotifications = adjustmentPending.length > 0;
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const activeSession = sessions.find((s) => s.status === 'active');

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="container max-w-6xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold mb-2">
            Hiker <span className="text-gradient">Dashboard</span>
          </h1>
          <p className="text-muted-foreground mb-6">Your hiking journey on Mount Kalisungan.</p>
        </motion.div>

        {/* ── ACTION REQUIRED: Adjustment notifications ── */}
        <AnimatePresence>
          {hasNotifications && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <div className="rounded-2xl border border-sky-500/40 bg-sky-500/5 p-5 space-y-4">
                <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-semibold">
                  <Bell className="h-5 w-5" />
                  Action Required — Admin Adjusted Your Booking{adjustmentPending.length > 1 ? 's' : ''}
                </div>
                {adjustmentPending.map((b) => {
                  const meta = parseMeta(b.notes);
                  return (
                    <div
                      key={b.id}
                      className="rounded-xl bg-secondary/40 border border-border/20 p-4 space-y-3"
                    >
                      <p className="text-sm">
                        The admin has proposed a new date for your booking originally on{' '}
                        <strong>{b.booking_date}</strong>.
                      </p>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Original Date</p>
                          <p className="font-semibold line-through opacity-50">{b.booking_date}</p>
                        </div>
                        {meta.adjustedDate && (
                          <div>
                            <p className="text-xs text-muted-foreground">Proposed New Date</p>
                            <p className="font-semibold text-primary">{meta.adjustedDate}</p>
                          </div>
                        )}
                        {meta.adjustedTime && (
                          <div>
                            <p className="text-xs text-muted-foreground">Proposed Time</p>
                            <p className="font-semibold text-primary">{meta.adjustedTime}</p>
                          </div>
                        )}
                        {meta.assignedGuide && (
                          <div>
                            <p className="text-xs text-muted-foreground">Assigned Guide</p>
                            <p className="font-semibold">{meta.assignedGuide}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="gap-1.5 flex-1"
                          disabled={acceptingId === b.id}
                          onClick={() => handleAcceptAdjustment(b)}
                        >
                          {acceptingId === b.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Accept New Schedule
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 flex-1"
                              disabled={decliningId === b.id}
                            >
                              {decliningId === b.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                              Decline & Cancel
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Decline the adjusted schedule?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will cancel your booking entirely. The slot will be released.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Go Back</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDeclineAdjustment(b.id)}
                              >
                                Yes, Cancel Booking
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {importantAnnouncements.length > 0 && (
          <Card className="glass-card border-destructive/30 mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5 text-destructive" />
                Important Announcements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {importantAnnouncements.slice(0, 3).map((a) => (
                <div key={a.id} className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm">{a.title}</p>
                    <Badge className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">
                      Important
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{a.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── HERO: Book a Hike CTA ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-6">
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 md:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(152_60%_42%/0.12)_0%,_transparent_60%)]" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Mountain className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium text-primary uppercase tracking-wider">Ready for an adventure?</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-2">Book Your Next Hike</h2>
                <p className="text-muted-foreground text-sm max-w-md">
                  Select your preferred date and time. Admin will review your request, assign a licensed local guide, and confirm your slot.
                </p>
              </div>
              <Button asChild size="lg" className="gap-2 shrink-0 text-base px-8 py-6">
                <Link to="/booking">
                  <CalendarCheck className="h-5 w-5" />
                  Book a Hike
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'My Bookings', value: bookings.length, icon: CalendarCheck },
            { label: 'Hikes Completed', value: sessions.filter((s) => s.status === 'completed').length, icon: Mountain },
            { label: 'Total Distance', value: `${totalDistance.toFixed(1)} km`, icon: Map },
            { label: 'Active Hike', value: sessions.some((s) => s.status === 'active') ? 'Yes' : 'No', icon: Clock },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
              <Card className="glass-card">
                <CardContent className="p-5">
                  <s.icon className="h-6 w-6 text-primary mb-2 opacity-60" />
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {[
            { to: '/map', icon: Map, label: 'Trail Map' },
            { to: '/chat', icon: Bot, label: 'AI Assistant' },
            { to: '/profile', icon: User, label: 'My Profile' },
          ].map((a) => (
            <Button key={a.to} asChild variant="outline" className="h-auto py-4 flex-col gap-2 glass-card">
              <Link to={a.to}>
                <a.icon className="h-5 w-5 text-primary" />
                <span className="text-xs">{a.label}</span>
              </Link>
            </Button>
          ))}
        </div>

        {activeSession && (
          <Card className="glass-card border-primary/30 mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Live hike tracking is active
                </p>
                <p className="text-xs text-muted-foreground">
                  GPS stays on during the session and stores your path offline until it can sync.
                </p>
              </div>
              <Button asChild className="gap-2">
                <Link to="/map?auto=1">
                  <Map className="h-4 w-4" />
                  Open Live Tracker
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Emergency SOS */}
        <div className="mb-6">
          <SOSPanel />
        </div>

        {/* ── Review Section: completed hikes ── */}
        {completedSessions.length > 0 && (
          <Card className="glass-card mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500" /> Rate Your Hike Experience
              </CardTitle>
              <p className="text-sm text-muted-foreground">Only completed hikes are eligible for reviews.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {completedSessions.map((session) => {
                const booking = bookings.find((b) => b.id === session.booking_id);
                const meta = booking ? parseMeta(booking.notes) : {};
                const alreadyReviewed = reviewedSessionIds.has(session.id);
                return (
                  <div key={session.id} className="rounded-xl border border-border/20 bg-secondary/20 p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="text-sm font-semibold">
                          Hike on {session.start_time ? new Date(session.start_time).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">{session.total_distance_km?.toFixed(1) ?? '0'} km completed</p>
                      </div>
                      {alreadyReviewed ? (
                        <span className="px-3 py-1 rounded-full text-xs bg-primary/20 text-primary font-semibold">✓ Reviewed</span>
                      ) : (
                        <Button size="sm" variant="outline" className="gap-1.5 text-amber-600 border-amber-400/40 hover:bg-amber-500/10"
                          onClick={() => setReviewSessionId(reviewSessionId === session.id ? null : session.id)}>
                          <Star className="h-3.5 w-3.5" />
                          {reviewSessionId === session.id ? 'Close' : 'Leave Review'}
                        </Button>
                      )}
                    </div>

                    <AnimatePresence>
                      {reviewSessionId === session.id && !alreadyReviewed && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-4 overflow-hidden"
                        >
                          {/* Hike rating */}
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider">Hiking Experience Rating</Label>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button key={n} type="button" onClick={() => setHikeRating(n)}
                                  className="transition-transform hover:scale-110">
                                  <Star className={`h-7 w-7 ${n <= hikeRating ? 'fill-amber-400 text-amber-400' : 'text-border'}`} />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`hikeReview-${session.id}`} className="text-xs font-bold uppercase tracking-wider">Your Review</Label>
                            <Textarea
                              id={`hikeReview-${session.id}`}
                              value={hikeReviewText}
                              onChange={(e) => setHikeReviewText(e.target.value)}
                              placeholder="Share your experience with Mt. Kalisungan..."
                              rows={3}
                            />
                          </div>

                          {/* Guide rating (if guide was assigned) */}
                          {meta.assignedGuide && (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                              <p className="text-sm font-semibold">Rate your guide: <span className="text-primary">{meta.assignedGuide}</span></p>
                              <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider">Guide Rating</Label>
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <button key={n} type="button" onClick={() => setGuideRating(n)}
                                      className="transition-transform hover:scale-110">
                                      <Star className={`h-7 w-7 ${n <= guideRating ? 'fill-amber-400 text-amber-400' : 'text-border'}`} />
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`guideReview-${session.id}`} className="text-xs font-bold uppercase tracking-wider">Guide Review (optional)</Label>
                                <Textarea
                                  id={`guideReview-${session.id}`}
                                  value={guideReviewText}
                                  onChange={(e) => setGuideReviewText(e.target.value)}
                                  placeholder={`How was ${meta.assignedGuide} as your guide?`}
                                  rows={2}
                                />
                              </div>
                            </div>
                          )}

                          <Button className="w-full gap-2" onClick={() => handleSubmitReview(session)} disabled={submittingReview}>
                            {submittingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Submit Review
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Bookings list */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" /> My Bookings
              {hasNotifications && (
                <Badge className="ml-auto bg-sky-500/20 text-sky-600 border-sky-500/30 text-xs">
                  {adjustmentPending.length} needs action
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bookings.length === 0 ? (
              <div className="text-center py-10">
                <CalendarCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm mb-4">No bookings yet. Book your first hike above!</p>
                <Button asChild>
                  <Link to="/booking">Book Now</Link>
                </Button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {bookings.map((b) => {
                  const meta = parseMeta(b.notes);
                  return (
                    <div
                      key={b.id}
                      className={`p-4 rounded-xl border flex flex-col gap-3 ${
                        b.status === 'adjustment_pending'
                          ? 'bg-sky-500/5 border-sky-500/30'
                          : 'bg-secondary/30 border-border/20'
                      }`}
                    >
                      {/* QR Code */}
                      <div className="flex justify-center bg-white rounded-lg p-3">
                        <QRCodeSVG value={b.qr_code_data || b.id} size={100} bgColor="#ffffff" fgColor="#1a2e1a" />
                      </div>

                      {/* Info */}
                      <div className="text-center space-y-1">
                        <p className="font-semibold">{meta.adjustedDate ?? b.booking_date}</p>
                        {meta.adjustedDate && meta.adjustedDate !== b.booking_date && (
                          <p className="text-xs text-muted-foreground line-through">{b.booking_date}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{b.group_size} pax</p>
                        {meta.assignedGuide && (
                          <div className="flex items-center justify-center gap-1 text-xs text-primary">
                            <UserCheck className="h-3 w-3" />
                            Guide: {meta.assignedGuide}
                          </div>
                        )}
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[b.status] ?? 'bg-secondary text-secondary-foreground'}`}
                        >
                          {STATUS_LABELS[b.status] ?? b.status}
                        </span>
                      </div>

                      {/* Adjustment action buttons — inline mini version */}
                      {b.status === 'adjustment_pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 text-xs py-1"
                            disabled={acceptingId === b.id}
                            onClick={() => handleAcceptAdjustment(b)}
                          >
                            {acceptingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Accept'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs py-1 text-destructive border-destructive/30"
                            disabled={decliningId === b.id}
                            onClick={() => handleDeclineAdjustment(b.id)}
                          >
                            {decliningId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Decline'}
                          </Button>
                        </div>
                      )}

                      {/* Cancel — only for non-cancelled, pending/confirmed, upcoming */}
                      {b.status !== 'cancelled' &&
                        b.status !== 'adjustment_pending' &&
                        new Date(b.booking_date) >= new Date() && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
                                disabled={cancellingId === b.id}
                              >
                                {cancellingId === b.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                Cancel Booking
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Your reservation for <strong>{b.booking_date}</strong> ({b.group_size} pax) will be cancelled. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleCancelBooking(b.id)}
                                >
                                  Yes, Cancel
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                      {/* Reschedule / message admin */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5"
                        onClick={() => setChatBooking({ id: b.id, date: b.booking_date })}
                      >
                        <CalendarClock className="h-3.5 w-3.5" /> Reschedule
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {chatBooking && (
        <BookingChat
          bookingId={chatBooking.id}
          bookingDate={chatBooking.date}
          open={!!chatBooking}
          onOpenChange={(o) => !o && setChatBooking(null)}
          canRequestReschedule
          onAfterReschedule={() => { setChatBooking(null); window.location.reload(); }}
        />
      )}
    </div>
  );
}

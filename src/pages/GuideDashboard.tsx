import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  CalendarCheck, Users, Mountain, Phone, ShieldAlert, Loader2, CheckCircle2, Clock, MapPin, XCircle, Inbox, Activity,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { parseMeta } from '@/lib/bookingMeta';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GuideOffDutyForm } from '@/components/booking/OffDutyManager';

const QUOTA_PER_GUIDE_PER_DAY = 5;

type AssignmentStatus = 'pending' | 'accepted' | 'declined' | 'completed';

interface AssignmentRow {
  id: string;
  status: AssignmentStatus;
  decided_at: string | null;
  decline_reason: string;
  created_at: string;
  guide_id: string;
  location_id: string;
  booking: any;
  guide_name?: string;
}

export default function GuideDashboard() {
  const { user } = useAuth();
  const [guideRow, setGuideRow] = useState<any>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [peerGuides, setPeerGuides] = useState<any[]>([]);
  const [peerCounts, setPeerCounts] = useState<Record<string, { active: number; total: number }>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | AssignmentStatus>('all');
  const [detailOpen, setDetailOpen] = useState<AssignmentRow | null>(null);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel('guide-assignments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_assignments' }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    setLoading(true);
    // Find this user's guide row
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

    // Fetch assignments for me + peer guides at same location
    const [{ data: mineRaw }, { data: peers }] = await Promise.all([
      supabase
        .from('booking_assignments' as any)
        .select('*')
        .eq('guide_id', me.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('guides' as any)
        .select('id,full_name,is_active,specialty')
        .eq('location_id', me.location_id)
        .eq('is_active', true),
    ]);

    const mineList = ((mineRaw as any[]) ?? []) as AssignmentRow[];

    // Pull bookings for the assignments
    const bookingIds = Array.from(new Set(mineList.map((a: any) => a.booking_id))).filter(Boolean);
    let bookingMap: Record<string, any> = {};
    if (bookingIds.length > 0) {
      const { data: bks } = await supabase
        .from('bookings')
        .select('*')
        .in('id', bookingIds);
      (bks ?? []).forEach((b: any) => { bookingMap[b.id] = b; });
    }
    mineList.forEach((a: any) => { a.booking = bookingMap[a.booking_id]; });
    setAssignments(mineList);

    // Peer guide stats: active + total assignments at this location
    const peersList = ((peers as any[]) ?? []);
    setPeerGuides(peersList);
    if (peersList.length > 0) {
      const peerIds = peersList.map((g: any) => g.id);
      const { data: allAss } = await supabase
        .from('booking_assignments' as any)
        .select('guide_id,status')
        .in('guide_id', peerIds);
      const counts: Record<string, { active: number; total: number }> = {};
      ((allAss as any[]) ?? []).forEach((row: any) => {
        const c = (counts[row.guide_id] ??= { active: 0, total: 0 });
        c.total += 1;
        if (row.status === 'accepted') c.active += 1;
      });
      setPeerCounts(counts);
    }

    setLoading(false);
  };

  const counts = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return {
      pending: assignments.filter((a) => a.status === 'pending').length,
      accepted: assignments.filter((a) => a.status === 'accepted').length,
      completed: assignments.filter((a) => a.status === 'completed').length,
      declined: assignments.filter((a) => a.status === 'declined').length,
      todayAccepted: assignments.filter((a) => a.status === 'accepted' && a.booking?.booking_date === today).length,
    };
  }, [assignments]);

  const filtered = filter === 'all' ? assignments : assignments.filter((a) => a.status === filter);

  const handleDecision = async (a: AssignmentRow, decision: 'accepted' | 'declined' | 'completed') => {
    if (decision === 'accepted' && a.booking?.booking_date) {
      // Quota check: max QUOTA_PER_GUIDE_PER_DAY accepted on a single date for this guide
      const sameDay = assignments.filter(
        (x) => x.status === 'accepted' && x.booking?.booking_date === a.booking.booking_date,
      ).length;
      if (sameDay >= QUOTA_PER_GUIDE_PER_DAY) {
        toast.error(
          `Quota reached for ${a.booking.booking_date}: ${QUOTA_PER_GUIDE_PER_DAY} bookings per guide/day.`,
        );
        return;
      }
    }
    let reason = '';
    if (decision === 'declined') {
      const r = window.prompt('Optional reason for declining:');
      reason = r ?? '';
    }
    const { error } = await supabase
      .from('booking_assignments' as any)
      .update({
        status: decision,
        decided_at: new Date().toISOString(),
        decline_reason: reason,
      } as any)
      .eq('id', a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(decision === 'accepted' ? 'Assignment accepted' : decision === 'completed' ? 'Marked complete' : 'Declined');
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
            <h2 className="text-xl font-bold">Guide profile not linked</h2>
            <p className="text-sm text-muted-foreground">
              Your account has the <strong>guide</strong> role but isn't linked to a guide profile yet. The LGU admin
              needs to create a guide entry for your user account, or open the Central Dashboard and use the seed
              accounts utility.
            </p>
            <p className="text-xs text-muted-foreground">User ID: {user.id}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="container max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-3xl font-bold">
            Guide <span className="text-gradient">Dashboard</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Hi {guideRow.full_name}. Manage your booking assignments and see peer guides at this trailhead.
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Pending', value: counts.pending, icon: Inbox, color: 'text-amber-500' },
            { label: 'Accepted', value: counts.accepted, icon: CheckCircle2, color: 'text-primary' },
            { label: 'Today', value: `${counts.todayAccepted}/${QUOTA_PER_GUIDE_PER_DAY}`, icon: Activity, color: counts.todayAccepted >= QUOTA_PER_GUIDE_PER_DAY ? 'text-destructive' : 'text-emerald-500' },
            { label: 'Completed', value: counts.completed, icon: Mountain, color: 'text-sky-500' },
            { label: 'Declined', value: counts.declined, icon: XCircle, color: 'text-muted-foreground' },
          ].map((s) => (
            <Card key={s.label} className="glass-card">
              <CardContent className="p-3 flex items-center gap-2">
                <s.icon className={`h-5 w-5 ${s.color} opacity-70`} />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  <p className="text-base font-bold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="my">
          <TabsList className="glass-card">
            <TabsTrigger value="my">My Assignments</TabsTrigger>
            <TabsTrigger value="peers">Peer Guides ({peerGuides.length})</TabsTrigger>
            <TabsTrigger value="off">Off-Duty</TabsTrigger>
          </TabsList>

          <TabsContent value="off" className="mt-4">
            {guideRow ? <GuideOffDutyForm guideId={guideRow.id} onChange={load} /> : <p className="text-sm text-muted-foreground">Loading guide profile…</p>}
          </TabsContent>

          <TabsContent value="my" className="mt-4">
            <div className="flex gap-2 flex-wrap mb-4">
              {(['all', 'pending', 'accepted', 'completed', 'declined'] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? 'default' : 'outline'}
                  onClick={() => setFilter(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="text-center py-12 text-muted-foreground text-sm">
                  <Inbox className="h-10 w-10 mx-auto opacity-30 mb-3" />
                  No assignments in this category.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((a) => {
                  const meta = parseMeta(a.booking?.notes);
                  return (
                    <Card key={a.id} className="glass-card">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={
                                a.status === 'pending' ? 'bg-amber-500/20 text-amber-600 border-amber-500/30' :
                                a.status === 'accepted' ? 'bg-primary/20 text-primary border-primary/30' :
                                a.status === 'completed' ? 'bg-sky-500/20 text-sky-600 border-sky-500/30' :
                                'bg-muted text-muted-foreground'
                              }>{a.status}</Badge>
                              <span className="text-xs text-muted-foreground">
                                #{a.id.slice(0, 8)} • assigned {format(new Date(a.created_at), 'MMM d, h:mm a')}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                              <Field icon={CalendarCheck} label="Date" value={a.booking?.booking_date ?? '—'} />
                              <Field icon={Users} label="Group" value={`${a.booking?.group_size ?? 0} pax`} />
                              <Field icon={MapPin} label="Start" value={meta.hikeTime || '—'} />
                              <Field icon={Phone} label="Contact" value={a.booking?.emergency_contact_phone ?? '—'} />
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 min-w-[140px]">
                            {a.status === 'pending' && (
                              <>
                                <Button size="sm" onClick={() => handleDecision(a, 'accepted')}>Accept</Button>
                                <Button size="sm" variant="outline" onClick={() => handleDecision(a, 'declined')}>Decline</Button>
                              </>
                            )}
                            {a.status === 'accepted' && (
                              <Button size="sm" variant="outline" onClick={() => handleDecision(a, 'completed')}>Mark complete</Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setDetailOpen(a)}>View details</Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="peers" className="mt-4">
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Guide transparency board (this trailhead)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {peerGuides.map((g: any) => {
                  const c = peerCounts[g.id] ?? { active: 0, total: 0 };
                  const isMe = g.id === guideRow.id;
                  return (
                    <div key={g.id} className={`flex items-center justify-between p-3 rounded-lg border text-sm ${isMe ? 'border-primary/40 bg-primary/5' : 'border-border/20 bg-secondary/20'}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{g.full_name}</span>
                        {isMe && <Badge variant="outline" className="text-[10px]">You</Badge>}
                        {g.specialty && <span className="text-xs text-muted-foreground">• {g.specialty}</span>}
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span><strong className="text-primary">{c.active}</strong> active</span>
                        <span className="text-muted-foreground">{c.total} all-time</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!detailOpen} onOpenChange={(o) => !o && setDetailOpen(null)}>
          <DialogContent className="z-[3100] max-w-lg">
            <DialogHeader>
              <DialogTitle>Booking #{detailOpen?.id.slice(0, 8)}</DialogTitle>
            </DialogHeader>
            {detailOpen && (() => {
              const meta = parseMeta(detailOpen.booking?.notes);
              return (
                <div className="space-y-3 text-sm">
                  <Row k="Status" v={<Badge>{detailOpen.status}</Badge>} />
                  <Row k="Date" v={detailOpen.booking?.booking_date} />
                  <Row k="Group size" v={detailOpen.booking?.group_size} />
                  <Row k="Lead hiker" v={meta.fullName ?? '—'} />
                  <Row k="Contact" v={meta.phoneNumber ?? '—'} />
                  <Row k="Emergency" v={`${detailOpen.booking?.emergency_contact_name ?? '—'} / ${detailOpen.booking?.emergency_contact_phone ?? '—'}`} />
                  <Row k="Medical" v={meta.medicalNotes ?? '—'} />
                  <Row k="Notes" v={meta.userNotes ?? '—'} />
                  {detailOpen.decline_reason && <Row k="Decline reason" v={detailOpen.decline_reason} />}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
        <p className="font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-border/15 last:border-0">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-right break-words max-w-[60%]">{v}</span>
    </div>
  );
}

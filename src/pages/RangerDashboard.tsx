import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  AlertTriangle,
  FileText,
  Activity,
  Loader2,
  QrCode,
  LogIn,
  LogOut,
  CheckCircle2,
  UserCheck,
  Clock,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

interface CheckInRecord {
  id: string;
  name: string;
  qrCode: string;
  groupSize: number;
  checkedInAt: string;
  checkedOutAt: string | null;
  status: 'on-trail' | 'completed';
}

export default function RangerDashboard() {
  const { user } = useAuth();
  const [zones, setZones] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [reportZone, setReportZone] = useState('');
  const [reportCondition, setReportCondition] = useState('good');
  const [reportDesc, setReportDesc] = useState('');
  const [loading, setLoading] = useState(false);

  /* ── Check-in/out state ── */
  const [qrInput, setQrInput] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [checkins, setCheckins] = useState<CheckInRecord[]>([]);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [{ data: z }, { data: r }, { data: s }] = await Promise.all([
      supabase.from('trail_zones').select('*'),
      supabase.from('trail_reports').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('hiker_sessions').select('*').eq('status', 'active'),
    ]);
    setZones(z || []);
    setReports(r || []);
    setSessions(s || []);
  };

  const submitReport = async () => {
    if (!user || !reportZone) return;
    setLoading(true);
    const { error } = await supabase.from('trail_reports').insert({
      ranger_id: user.id,
      zone_id: reportZone,
      condition: reportCondition,
      description: reportDesc,
    });
    if (error) toast.error(error.message);
    else {
      toast.success('Trail report submitted!');
      setReportDesc('');
      loadData();
    }
    setLoading(false);
  };

  /* ── QR / Manual Check-in ── */
  const handleCheckIn = async () => {
    if (!qrInput.trim()) return;
    setQrLoading(true);

    // Look up the booking by QR code
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, qr_code_data, group_size, emergency_contact_name, status')
      .eq('qr_code_data', qrInput.trim())
      .single();

    if (error || !booking) {
      toast.error('QR code not found. Check the code and try again.');
      setQrLoading(false);
      return;
    }

    if (booking.status === 'cancelled') {
      toast.error('This booking has been cancelled.');
      setQrLoading(false);
      return;
    }

    const alreadyCheckedIn = checkins.find((c) => c.qrCode === qrInput.trim() && c.status === 'on-trail');
    if (alreadyCheckedIn) {
      toast.warning('This group is already checked in.');
      setQrLoading(false);
      return;
    }

    const record: CheckInRecord = {
      id: Date.now().toString(),
      name: booking.emergency_contact_name || `Booking #${booking.id.slice(0, 6)}`,
      qrCode: qrInput.trim(),
      groupSize: booking.group_size,
      checkedInAt: new Date().toISOString(),
      checkedOutAt: null,
      status: 'on-trail',
    };

    setCheckins((prev) => [record, ...prev]);
    setQrInput('');
    toast.success(`✅ Group checked in — ${record.groupSize} pax on trail`);
    setQrLoading(false);
  };

  const handleCheckOut = async (id: string) => {
    setCheckoutId(id);
    await new Promise((r) => setTimeout(r, 600));
    setCheckins((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: 'completed', checkedOutAt: new Date().toISOString() }
          : c
      )
    );
    toast.success('Group checked out successfully.');
    setCheckoutId(null);
  };

  const onTrail = checkins.filter((c) => c.status === 'on-trail');
  const completed = checkins.filter((c) => c.status === 'completed');

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="container max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold mb-2">
            Ranger <span className="text-gradient">Dashboard</span>
          </h1>
          <p className="text-muted-foreground mb-8">
            Monitor hikers, report trail conditions, and manage check-in/out.
          </p>
        </motion.div>

        {/* Stat chips */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <Card className="glass-card">
            <CardContent className="p-5 flex items-center gap-4">
              <Activity className="h-10 w-10 text-sky-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Active Hikers (DB)</p>
                <p className="text-3xl font-bold">{sessions.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-5 flex items-center gap-4">
              <UserCheck className="h-10 w-10 text-primary opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Groups On Trail (This Session)</p>
                <p className="text-3xl font-bold">{onTrail.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-5 flex items-center gap-4">
              <Shield className="h-10 w-10 text-warning opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Active Zones</p>
                <p className="text-3xl font-bold">
                  {zones.filter((z: any) => z.status === 'active').length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="checkin" className="space-y-6">
          <div className="-mx-1 overflow-x-auto px-1 pb-2 custom-scrollbar">
            <TabsList className="glass-card min-w-max gap-1 p-1">
              <TabsTrigger value="checkin" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <QrCode className="h-3.5 w-3.5" /> Check-In / Out
              </TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <ClipboardList className="h-3.5 w-3.5" /> Trail Reports
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ─────────────────────────────── CHECK-IN TAB ── */}
          <TabsContent value="checkin" className="space-y-6">
            {/* QR scanner / manual input */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" /> Hiker Check-In
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Scan the hiker's QR code or type the booking code manually to check them in at the trailhead.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    placeholder="Scan QR or type booking code (e.g. KALISUNGAN-...)"
                    onKeyDown={(e) => e.key === 'Enter' && handleCheckIn()}
                    className="flex-1 font-mono text-sm"
                  />
                  <Button onClick={handleCheckIn} disabled={qrLoading || !qrInput.trim()} className="gap-2 shrink-0">
                    {qrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                    Check In
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Tip: Connect a USB QR scanner — it will auto-fill the input and press Enter.
                </p>
              </CardContent>
            </Card>

            {/* On-trail groups */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> Groups On Trail
                  {onTrail.length > 0 && (
                    <span className="ml-auto text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                      {onTrail.length} active
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {onTrail.length === 0 ? (
                  <div className="text-center py-10">
                    <UserCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">No groups currently on trail.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {onTrail.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 p-4 rounded-xl bg-secondary/30 border border-border/20"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm truncate">{c.name}</span>
                            <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                              {c.groupSize} pax
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Checked in: {format(new Date(c.checkedInAt), 'h:mm a')}
                          </div>
                          <p className="font-mono text-xs text-muted-foreground/60 mt-0.5 truncate">
                            {c.qrCode}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                          disabled={checkoutId === c.id}
                          onClick={() => handleCheckOut(c.id)}
                        >
                          {checkoutId === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <LogOut className="h-3.5 w-3.5" />
                          )}
                          Check Out
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Completed today */}
            {completed.length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4.5 w-4.5 text-primary" /> Completed Today
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {completed.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/20 border border-border/10 text-sm"
                      >
                        <div>
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground ml-2">({c.groupSize} pax)</span>
                        </div>
                        <div className="text-xs text-muted-foreground text-right">
                          <div>In: {format(new Date(c.checkedInAt), 'h:mm a')}</div>
                          {c.checkedOutAt && <div>Out: {format(new Date(c.checkedOutAt), 'h:mm a')}</div>}
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─────────────────────────────── TRAIL REPORTS TAB ── */}
          <TabsContent value="report" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Submit Report */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" /> Submit Trail Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Trail Zone</Label>
                    <Select value={reportZone} onValueChange={setReportZone}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select zone" />
                      </SelectTrigger>
                      <SelectContent>
                        {zones.map((z: any) => (
                          <SelectItem key={z.id} value={z.id}>
                            {z.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Select value={reportCondition} onValueChange={setReportCondition}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                        <SelectItem value="closed">Closed / Hazardous</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={reportDesc}
                      onChange={(e) => setReportDesc(e.target.value)}
                      placeholder="Describe trail conditions..."
                    />
                  </div>
                  <Button onClick={submitReport} disabled={loading || !reportZone} className="w-full gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Submit Report
                  </Button>
                </CardContent>
              </Card>

              {/* Recent Reports */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg">Recent Trail Reports</CardTitle>
                </CardHeader>
                <CardContent>
                  {reports.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-8">No reports yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {reports.map((r: any) => (
                        <div key={r.id} className="p-3 rounded-lg bg-secondary/30 border border-border/20">
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                r.condition === 'good'
                                  ? 'bg-primary/20 text-primary'
                                  : r.condition === 'moderate'
                                  ? 'bg-warning/20 text-warning'
                                  : 'bg-destructive/20 text-destructive'
                              }`}
                            >
                              {r.condition}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm">{r.description || 'No description'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
  User,
  Phone,
  ShieldAlert,
  CalendarCheck,
  QrCode,
  Loader2,
  Save,
  Trash2,
  Mountain,
  Clock,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

interface Profile {
  full_name: string;
  phone: string;
  emergency_contact: string;
}

interface Booking {
  id: string;
  booking_date: string;
  group_size: number;
  status: string;
  qr_code_data: string;
  created_at: string;
  notes: string;
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-primary/20 text-primary',
  pending: 'bg-warning/20 text-warning',
  cancelled: 'bg-destructive/20 text-destructive',
};

export default function ProfilePage() {
  const { user, role } = useAuth();

  /* ── Profile state ── */
  const [profile, setProfile] = useState<Profile>({ full_name: '', phone: '', emergency_contact: '' });
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  /* ── Booking state ── */
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  /* ── Hike stats ── */
  const [stats, setStats] = useState({ totalHikes: 0, completedHikes: 0, cancelledHikes: 0 });

  /* ────────────────────────────── Data Loading ── */
  useEffect(() => {
    if (!user) return;
    loadProfile();
    loadBookings();
  }, [user]);

  const loadProfile = async () => {
    setProfileLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('full_name, phone, emergency_contact')
      .eq('user_id', user!.id)
      .single();

    if (data) {
      setProfile({
        full_name: data.full_name ?? '',
        phone: data.phone ?? '',
        emergency_contact: data.emergency_contact ?? '',
      });
    }
    setProfileLoading(false);
  };

  const loadBookings = async () => {
    setBookingsLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user!.id)
      .order('booking_date', { ascending: false });

    const list = (data ?? []) as Booking[];
    setBookings(list);
    setStats({
      totalHikes: list.length,
      completedHikes: list.filter((b) => b.status === 'confirmed').length,
      cancelledHikes: list.filter((b) => b.status === 'cancelled').length,
    });
    setBookingsLoading(false);
  };

  /* ────────────────────────────── Save Profile ── */
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, ...profile, updated_at: new Date().toISOString() });

    if (error) toast.error('Failed to save profile');
    else toast.success('Profile updated successfully!');
    setSaving(false);
  };

  /* ────────────────────────────── Cancel Booking ── */
  const handleCancel = async (bookingId: string) => {
    setCancellingId(bookingId);
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId);

    if (error) {
      toast.error('Failed to cancel booking');
    } else {
      toast.success('Booking cancelled.');
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' } : b))
      );
      setStats((s) => ({ ...s, cancelledHikes: s.cancelledHikes + 1, completedHikes: s.completedHikes - 1 }));
    }
    setCancellingId(null);
  };

  /* ────────────────────────────── UI ── */
  if (!user) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <p className="text-muted-foreground">Please sign in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-16 px-3 sm:px-4">
      <div className="container max-w-5xl mx-auto">

        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 sm:gap-4 mb-8 flex-wrap">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold">
                My <span className="text-gradient">Profile</span>
              </h1>
              <p className="break-all text-sm text-muted-foreground">
                {user.email} &bull; <span className="capitalize">{role ?? 'hiker'}</span>
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Stat chips ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8"
        >
          {[
            { label: 'Total Bookings', value: stats.totalHikes, icon: CalendarCheck, color: 'text-primary' },
            { label: 'Confirmed', value: stats.completedHikes, icon: Mountain, color: 'text-primary' },
            { label: 'Cancelled', value: stats.cancelledHikes, icon: Trash2, color: 'text-destructive' },
          ].map((s) => (
            <Card key={s.label} className="glass-card">
              <CardContent className="p-5 flex items-center gap-3">
                <s.icon className={`h-6 w-6 ${s.color} opacity-60 flex-shrink-0`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">

          {/* ── Personal Info ── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" /> Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {profileLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" value={user.email ?? ''} disabled className="opacity-60" />
                      <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        value={profile.full_name}
                        onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
                        placeholder="Juan Dela Cruz"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone" className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> Phone Number
                      </Label>
                      <Input
                        id="phone"
                        value={profile.phone}
                        onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="+63 9XX XXX XXXX"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="emergContact" className="flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> Emergency Contact
                      </Label>
                      <Input
                        id="emergContact"
                        value={profile.emergency_contact}
                        onChange={(e) => setProfile((p) => ({ ...p, emergency_contact: e.target.value }))}
                        placeholder="Name — +63 9XX XXX XXXX"
                      />
                      <p className="text-xs text-muted-foreground">
                        This contact will be notified in an emergency on the trail.
                      </p>
                    </div>

                    <Button className="w-full gap-2" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Profile
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── Account Info card ── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" /> Account Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span className="text-muted-foreground">Account type</span>
                  <span className="capitalize font-medium">{role ?? 'hiker'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span className="text-muted-foreground">Registered email</span>
                  <span className="font-medium truncate max-w-[180px]">{user.email}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/20">
                  <span className="text-muted-foreground">Member since</span>
                  <span className="font-medium">
                    {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">User ID</span>
                  <span className="font-mono text-xs text-muted-foreground">{user.id.slice(0, 8)}…</span>
                </div>

                <div className="pt-4 rounded-xl bg-secondary/20 border border-border/20 p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-3">Your Hiker ID (QR)</p>
                  <div className="inline-block bg-white p-3 rounded-lg">
                    <QRCodeSVG value={`HIKER-${user.id}`} size={110} bgColor="#ffffff" fgColor="#1a2e1a" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Show this at the trailhead for fast check-in.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── Booking History ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" /> Booking History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bookingsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : bookings.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No bookings yet.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bookings.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl bg-secondary/20 border border-border/20 p-4 flex flex-col gap-3"
                    >
                      {/* QR Code */}
                      <div className="flex justify-center bg-white rounded-lg p-3">
                        <QRCodeSVG value={b.qr_code_data || b.id} size={90} bgColor="#ffffff" fgColor="#1a2e1a" />
                      </div>

                      {/* Info */}
                      <div className="text-center space-y-1">
                          <p className="font-semibold text-sm break-words">{b.booking_date}</p>
                        <p className="text-xs text-muted-foreground">{b.group_size} pax</p>
                        {b.notes && (
                          <p className="text-xs text-muted-foreground italic break-words">{b.notes}</p>
                        )}
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[b.status] ?? 'bg-secondary text-secondary-foreground'}`}>
                          {b.status}
                        </span>
                      </div>

                      {/* Cancel button — only for non-cancelled, future bookings */}
                      {b.status !== 'cancelled' && new Date(b.booking_date) >= new Date() && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 gap-1"
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
                                Your reservation for <strong>{b.booking_date}</strong> ({b.group_size} pax) will be cancelled. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleCancel(b.id)}
                              >
                                Yes, Cancel
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </div>
  );
}

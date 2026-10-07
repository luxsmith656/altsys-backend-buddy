import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Phone,
  ShieldAlert,
  CalendarCheck,
  Loader2,
  Save,
  Trash2,
  Mountain,
  Clock,
  KeyRound,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import { optimizeAvatar } from '@/lib/avatarImage';
import { Camera } from 'lucide-react';
import { profileChanged } from '@/components/common/ProfileAvatar';
import { changeAccountPassword, emailPasswordReset } from '@/lib/accountSecurity';

interface Profile {
  full_name: string;
  phone: string;
  emergency_contact: string;
  avatar_url: string;
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

export default function ProfilePage() {
  const { user, role } = useAuth();

  /* ── Profile state ── */
  const [profile, setProfile] = useState<Profile>({ full_name: '', phone: '', emergency_contact: '', avatar_url: '' })
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  /* ── Booking state ── */

  /* ── Hike stats ── */
  const [stats, setStats] = useState({ totalHikes: 0, completedHikes: 0, cancelledHikes: 0 });

  /* ────────────────────────────── Data Loading ── */
  useEffect(() => {
    if (!user) return;
    loadProfile();
    void loadBookings();
  }, [user]);

  const loadProfile = async () => {
    setProfileLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('full_name, phone, emergency_contact, avatar_url')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (data) {
      setProfile({
        full_name: data.full_name ?? '',
        phone: data.phone ?? '',
        emergency_contact: data.emergency_contact ?? '',
        avatar_url: data.avatar_url ?? '',
      });
    }
    setProfileLoading(false);
  };

  const loadBookings = async () => {
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user!.id)
      .order('booking_date', { ascending: false });

    const list = (data ?? []) as Booking[];
    setStats({
      totalHikes: list.length,
      completedHikes: list.filter((b) => b.status === 'confirmed').length,
      cancelledHikes: list.filter((b) => b.status === 'cancelled').length,
    });
  };

  /* ────────────────────────────── Save Profile ── */
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, ...profile, full_name: profile.full_name.trim(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) {
      toast.error(`Failed to save profile: ${error.message}`);
    } else {
      void supabase.auth.updateUser({ data: { full_name: profile.full_name.trim() } });
      profileChanged(user.id);
      toast.success('Profile updated successfully!');
    }
    setSaving(false);
  };

  const handlePasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.email) return;
    if (newPassword.length < 8) {
      toast.error('Choose a password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('The new passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    try {
      await changeAccountPassword(user.email, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      toast.success('Password updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    setResetSending(true);
    try {
      await emailPasswordReset(user.email, window.location.origin);
      toast.success('Password reset link sent. Check your inbox and spam folder.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send password reset email.');
    } finally {
      setResetSending(false);
    }
  };

  const handleAvatar = async (file?: File) => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const avatar_url = await optimizeAvatar(file);
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, avatar_url, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      if (role === 'guide') {
        const { error: guideError } = await supabase.from('guides').update({ photo_url: avatar_url }).eq('user_id', user.id);
        if (guideError) throw guideError;
      }
      setProfile((p) => ({ ...p, avatar_url }));
      profileChanged(user.id);
      toast.success('Profile photo updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload photo');
    } finally {
      setUploading(false);
    }
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
            <label className="relative w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 cursor-pointer overflow-hidden group" aria-label="Change profile photo">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <User className="h-8 w-8 text-primary" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              </span>
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { void handleAvatar(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
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

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" /> Password &amp; Security
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <form onSubmit={handlePasswordChange} className="space-y-3">
                <p className="text-sm text-muted-foreground">Change your password using your current password.</p>
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input id="new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-new-password">Confirm new password</Label>
                  <Input id="confirm-new-password" type="password" autoComplete="new-password" minLength={8} value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} required />
                </div>
                <Button type="submit" disabled={passwordSaving || !currentPassword || !newPassword || !confirmNewPassword}>
                  {passwordSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Update Password
                </Button>
              </form>
              <div className="flex flex-col items-start gap-3 rounded-lg border border-border/50 bg-secondary/10 p-4">
                <Mail className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-medium">Forgot your password?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">We’ll send a secure reset link to {user.email}.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => void handleSendPasswordReset()} disabled={resetSending}>
                  {resetSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  Email Reset Link
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </div>
  );
}

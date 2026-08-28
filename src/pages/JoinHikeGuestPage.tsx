import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { parseMeta } from '@/lib/bookingMeta';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Mountain,
  Users,
  Calendar,
  Clock,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Navigation,
  Sparkles,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';

export default function JoinHikeGuestPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookingId = searchParams.get('bookingId') || searchParams.get('b');

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any | null>(null);
  const [guestName, setGuestName] = useState('');
  const [joining, setJoining] = useState(false);
  const [existingGuest, setExistingGuest] = useState<string | null>(null);

  useEffect(() => {
    // Check if device already has a guest session for this booking
    const saved = localStorage.getItem(`guest_session_${bookingId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.guestName) {
          setExistingGuest(parsed.guestName);
          setGuestName(parsed.guestName);
        }
      } catch {
        localStorage.removeItem(`guest_session_${bookingId}`);
      }
    }

    if (!bookingId) {
      setLoading(false);
      return;
    }

    const fetchBooking = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', bookingId)
          .maybeSingle();

        if (error || !data) {
          toast.error('Booking not found or invalid QR link.');
        } else {
          setBooking(data);
        }
      } catch (err: any) {
        toast.error('Failed to load hike details: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    void fetchBooking();
  }, [bookingId]);

  const handleJoinHike = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      toast.error('Please enter your full name to join the hike.');
      return;
    }

    if (!booking) return;

    setJoining(true);
    try {
      const guestSessionId = 'guest_' + crypto.randomUUID();
      const meta = parseMeta(booking.notes);

      // Store guest session in localStorage
      const sessionData = {
        guestSessionId,
        bookingId: booking.id,
        guestName: guestName.trim(),
        leadHikerName: meta.fullName || booking.emergency_contact_name || 'Group Lead',
        hikeDate: booking.booking_date,
        assignedGuide: meta.assignedGuide,
        assignedTrail: meta.assignedTrailName,
        joinedAt: new Date().toISOString(),
      };

      localStorage.setItem(`guest_session_${booking.id}`, JSON.stringify(sessionData));
      localStorage.setItem('active_guest_session', JSON.stringify(sessionData));

      // Attempt to get device GPS and post initial beacon point
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              // Log location beacon
              await supabase.from('admin_logs').insert({
                action: 'guest_joined_hike',
                entity: 'booking',
                entity_id: booking.id,
                user_id: null,
                metadata: {
                  guestName: guestName.trim(),
                  bookingId: booking.id,
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  joinedAt: new Date().toISOString(),
                },
              } as any);
            } catch (error) {
              console.warn('Guest location audit could not be saved:', error);
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }

      toast.success(`Welcome, ${guestName.trim()}! You are connected to the live trail tracker.`);
      navigate(`/map?bookingId=${booking.id}&guest=1`);
    } catch (err: any) {
      toast.error('Error connecting to hike: ' + err.message);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">Loading hike details...</p>
      </div>
    );
  }

  if (!bookingId || !booking) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <Card className="glass-card max-w-md w-full text-center p-6 space-y-4">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold">Invalid or Expired Link</h2>
          <p className="text-xs text-muted-foreground">
            The QR code or link you opened does not match an active hike booking. Please scan the QR code displayed by your group lead or trailhead staff.
          </p>
          <Button onClick={() => navigate('/')} variant="outline" className="w-full">
            Return to Home
          </Button>
        </Card>
      </div>
    );
  }

  const meta = parseMeta(booking.notes);
  const companionsList: string[] = (meta.companions || []).filter(Boolean);

  return (
    <div className="min-h-screen bg-background/50 px-4 py-8 flex flex-col items-center justify-center">
      <Card className="glass-card max-w-md w-full shadow-2xl border-primary/30 rounded-3xl overflow-hidden animate-in fade-in">
        {/* Header Hero */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 text-white p-6 text-center space-y-2 relative">
          <div className="inline-flex p-3 rounded-2xl bg-white/10 backdrop-blur-md mb-1 shadow-inner">
            <Mountain className="h-7 w-7 text-emerald-200" />
          </div>
          <h1 className="text-xl font-black tracking-tight">Join Hike Live Tracking</h1>
          <p className="text-xs text-emerald-100/90 leading-relaxed">
            Mount Kalisungan Tourist Safety &amp; GPS Beacon
          </p>
          <Badge className="bg-white/20 text-white border-white/30 text-[11px] font-mono mt-1">
            Group Permit: {booking.id.slice(0, 8)}
          </Badge>
        </div>

        <CardContent className="p-6 space-y-5">
          {/* Trip Summary Card */}
          <div className="rounded-2xl border border-border/40 bg-secondary/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Group Lead</p>
                <p className="text-sm font-bold text-foreground">{meta.fullName || booking.emergency_contact_name || 'Hiker Lead'}</p>
              </div>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs">
                <Users className="h-3 w-3" /> {booking.group_size} Pax
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border/30 pt-2.5">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>{booking.booking_date}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>{meta.hikeTime || '06:00 AM'} ({meta.hikeType === 'night' ? '🌙 Night' : '☀️ Day'})</span>
              </div>
              {meta.assignedGuide && (
                <div className="col-span-2 flex items-center gap-1.5 text-foreground font-medium">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Guide: {meta.assignedGuide}</span>
                </div>
              )}
            </div>
          </div>

          {/* Frictionless Guest Name Form */}
          <form onSubmit={handleJoinHike} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="guestName" className="text-xs font-bold text-foreground">
                Enter Your Full Name to Join Group GPS
              </Label>
              <Input
                id="guestName"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Maria Santos"
                className="h-11 rounded-xl text-sm font-semibold bg-background"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                No password required! This creates a temporary guest permit so your location appears on the group map.
              </p>
            </div>

            {/* Quick-Select from companion list if provided */}
            {companionsList.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Quick Select Name:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {companionsList.map((c) => (
                    <Button
                      key={c}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setGuestName(c)}
                      className={`h-7 px-2.5 text-xs rounded-lg transition-all ${
                        guestName === c ? 'border-primary bg-primary/10 text-primary font-bold' : ''
                      }`}
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Safety & Location Permissions Banner */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 text-xs flex items-start gap-2.5 text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                By continuing, you allow GPS trail tracking for safety coordination with park rangers and your tour guide.
              </span>
            </div>

            <Button
              type="submit"
              disabled={joining || !guestName.trim()}
              className="w-full h-12 text-sm font-bold gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl shadow-lg"
            >
              {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
              {existingGuest ? 'Reopen Group Live Map' : 'Join Hike & Open Trail Map'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

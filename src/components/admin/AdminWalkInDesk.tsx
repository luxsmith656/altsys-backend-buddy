import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  UserPlus,
  Users,
  Calendar,
  Clock,
  Phone,
  Mountain,
  DollarSign,
  CheckCircle2,
  Loader2,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  Eye,
  CreditCard,
  Building,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { encodeMeta } from '@/lib/bookingMeta';
import {
  calculateFees,
  formatPeso,
  ENTRY_FEE_PER_PERSON,
  ENV_FEE_PER_PERSON,
  GUIDE_FEE_PER_GUIDE,
  MAX_PAX_PER_GUIDE,
  PEAK_EXTENSION_FEE_PER_HOUR,
  HORSE_EMERGENCY_SERVICE_FEE,
} from '@/lib/payments';
import { HIKE_TIME_OPTIONS, type HikeType } from '@/lib/hikeSchedule';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface AdminWalkInDeskProps {
  locationId: string | null;
  onToggleHikerView?: () => void;
}

export default function AdminWalkInDesk({
  locationId,
  onToggleHikerView,
}: AdminWalkInDeskProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Form State
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [age, setAge] = useState<number>(25);
  const [groupSize, setGroupSize] = useState<number>(1);
  const [bookingDate, setBookingDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [hikeTime, setHikeTime] = useState<string>('06:00 AM');
  const [hikeType, setHikeType] = useState<HikeType>('morning');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  const [assignedGuideId, setAssignedGuideId] = useState<string>('');
  const [assignedRouteName, setAssignedRouteName] = useState<string>('Summit Trail (Main Peak)');
  const [peakHours, setPeakHours] = useState<number>(0);
  const [horseCount, setHorseCount] = useState<number>(0);

  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash' | 'onsite'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState('');

  // Guides & Submission state
  const [guides, setGuides] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<any | null>(null);

  // Load active guides for location
  useEffect(() => {
    let q = supabase
      .from('guides')
      .select('id, full_name, status, location_id, phone, specialty')
      .eq('is_active', true);
    if (locationId) q = q.eq('location_id', locationId);

    q.then(({ data }) => {
      const list = data || [];
      setGuides(list);
      if (list.length > 0 && !assignedGuideId) {
        setAssignedGuideId(list[0].id);
      }
    });
  }, [locationId]);

  // Fees calculation
  const fees = calculateFees(groupSize, {
    hikeType,
    peakExtensionHours: peakHours,
    emergencyHorseCount: horseCount,
  });
  const totalAmount = fees.totalFee;

  const tenderedNum = Number(cashTendered) || 0;
  const changeDue = tenderedNum >= totalAmount ? tenderedNum - totalAmount : 0;

  const handleRegisterWalkIn = async () => {
    if (!fullName.trim()) {
      toast.error('Please enter the lead hiker full name.');
      return;
    }
    if (!phoneNumber.trim()) {
      toast.error('Please enter a contact phone number.');
      return;
    }
    if (groupSize < 1 || groupSize > 50) {
      toast.error('Group size must be between 1 and 50.');
      return;
    }

    setSubmitting(true);
    try {
      const selectedGuide = guides.find((g) => g.id === assignedGuideId);
      const bookingId = crypto.randomUUID();
      const qrData = JSON.stringify({
        bookingId,
        leadHiker: fullName.trim(),
        groupSize,
        date: bookingDate,
        isWalkIn: true,
      });

      const metaNotes = encodeMeta({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        age: String(age),
        groupSize,
        hikeTime,
        hikeType,
        assignedTrail: assignedRouteName,
        assignedGuide: selectedGuide?.full_name || 'Assigned On-Site',
        assignedGuideId: selectedGuide?.id || null,
        guideStatus: 'accepted',
        medicalNotes: medicalNotes.trim() || undefined,
        userNotes: specialNotes.trim() || undefined,
        isWalkIn: true,
        walkInRegisteredBy: user?.id,
        walkInRegisteredAt: new Date().toISOString(),
        paymentStatus: 'paid',
        paymentMethod,
        paymentReference: paymentReference.trim() || (paymentMethod === 'cash' ? 'CASH_ONSITE' : 'GCASH_ONSITE'),
        amountPaid: totalAmount,
        entryFee: fees.entryFee,
        envFee: fees.envFee,
        guideFee: fees.guideFee,
        peakExtensionHours: peakHours > 0 ? peakHours : undefined,
        peakExtensionFee: fees.peakExtensionFee > 0 ? fees.peakExtensionFee : undefined,
        emergencyHorseCount: horseCount > 0 ? horseCount : undefined,
        emergencyHorseFee: fees.emergencyHorseFee > 0 ? fees.emergencyHorseFee : undefined,
        totalFee: totalAmount,
      });

      // 1. Insert confirmed booking record
      const { data: newBooking, error: bookingErr } = await supabase
        .from('bookings')
        .insert({
          id: bookingId,
          user_id: user?.id,
          booking_date: bookingDate,
          group_size: groupSize,
          status: 'confirmed',
          total_amount: totalAmount,
          qr_code_data: qrData,
          emergency_contact_name: emergencyName.trim() || fullName.trim(),
          emergency_contact_phone: emergencyPhone.trim() || phoneNumber.trim(),
          notes: metaNotes,
          location_id: locationId,
        } as any)
        .select()
        .single();

      if (bookingErr) throw bookingErr;

      // 2. Insert accepted assignment for selected guide
      if (selectedGuide) {
        await supabase.from('booking_assignments' as any).insert({
          booking_id: bookingId,
          guide_id: selectedGuide.id,
          location_id: locationId,
          status: 'accepted',
          decided_at: new Date().toISOString(),
        } as any);

        await supabase.from('booking_messages' as any).insert({
          booking_id: bookingId,
          sender_role: 'system',
          kind: 'system',
          content: `Walk-in hiker group (${groupSize} pax) registered by front desk. Assigned guide: ${selectedGuide.full_name}. Paid: ${formatPeso(totalAmount)}.`,
        } as any);
      }

      toast.success(`✅ Walk-in registration confirmed for ${fullName} (${groupSize} pax)!`);
      setCompletedBooking({
        ...newBooking,
        id: bookingId,
        leadHiker: fullName,
        qrCode: qrData,
        guideName: selectedGuide?.full_name,
        assignedGuideId: selectedGuide?.id,
      });
    } catch (err: any) {
      console.error('Walk-in registration error:', err);
      toast.error(`Registration failed: ${err?.message || 'Database error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setPhoneNumber('');
    setAge(25);
    setGroupSize(1);
    setEmergencyName('');
    setEmergencyPhone('');
    setMedicalNotes('');
    setSpecialNotes('');
    setPeakHours(0);
    setHorseCount(0);
    setCashTendered('');
    setPaymentReference('');
    setCompletedBooking(null);
  };

  return (
    <div className="min-h-screen pt-20 pb-24 px-3 sm:px-6 max-w-6xl mx-auto space-y-6">
      {/* Top Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-4 sm:p-6 rounded-3xl border border-primary/20">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-primary/20 text-primary grid place-items-center shrink-0 border border-primary/30 shadow-inner">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold">
                Trailhead Walk-In Registration Desk
              </h1>
              <Badge className="bg-primary text-white text-xs">Admin Front Desk</Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Rapid on-site check-in, fee collection, guide assignment, and instant QR permit pass generation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onToggleHikerView && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleHikerView}
              className="text-xs gap-1.5 h-9 rounded-xl border-border/40"
            >
              <Eye className="h-4 w-4" />
              Preview Online Hiker View
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/admin?tab=requests')}
            className="text-xs gap-1.5 h-9 rounded-xl border-border/40"
          >
            Manage Bookings
          </Button>
        </div>
      </div>

      {completedBooking ? (
        /* Completed Registration Success Screen */
        <Card className="glass-card border-emerald-500/30 max-w-2xl mx-auto rounded-3xl p-6 text-center space-y-6 shadow-2xl">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 max-w-md mx-auto space-y-2">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto animate-bounce" />
            <h2 className="text-xl font-bold text-foreground">
              Walk-In permit Issued &amp; Confirmed!
            </h2>
            <p className="text-xs text-muted-foreground">
              Booking Ref: <strong className="text-foreground font-mono">#{completedBooking.id.slice(0, 8)}</strong>
            </p>
          </div>

          {/* Generated QR Pass */}
          <div className="p-6 rounded-3xl bg-white text-black inline-block shadow-2xl border border-zinc-200">
            <QRCodeSVG value={completedBooking.qrCode} size={180} />
            <p className="text-xs font-bold text-center mt-3 text-zinc-800">
              {completedBooking.leadHiker} ({groupSize} pax)
            </p>
            <p className="text-[10px] text-zinc-500">Official Mt. Kalisungan Trail Pass</p>
          </div>

          {/* Receipt Breakdown Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-left p-4 rounded-2xl bg-secondary/30 border border-border/30 max-w-xl mx-auto">
            <div>
              <span className="text-muted-foreground block">Lead Hiker</span>
              <span className="font-semibold text-foreground truncate block">{completedBooking.leadHiker}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Group Size</span>
              <span className="font-semibold text-foreground">{groupSize} pax ({fees.guidesNeeded} guide)</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Assigned Guide</span>
              <span className="font-semibold text-primary truncate block">{completedBooking.guideName || 'On-Duty Guide'}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Amount Collected</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatPeso(totalAmount)} (PAID)</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetForm}
              className="text-xs gap-1.5 h-10 px-4 rounded-xl"
            >
              <RotateCcw className="h-4 w-4" />
              Register Another Walk-In
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/map?auto=1')}
              className="text-xs gap-1.5 h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg"
            >
              <Play className="h-4 w-4" />
              Start Hike &amp; Live Tracking
            </Button>
          </div>
        </Card>
      ) : (
        /* Walk-in Registration Form Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Hiker Info & Schedule */}
          <div className="lg:col-span-7 space-y-5">
            {/* Section 1: Lead Hiker & Companions */}
            <Card className="glass-card rounded-3xl border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-primary flex items-center gap-2 uppercase tracking-wide">
                  <Users className="h-4 w-4" /> 1. Lead Hiker &amp; Group Info
                </CardTitle>
                <CardDescription className="text-xs">
                  Enter the primary contact person for this walk-in group.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3.5">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Lead Hiker Full Name *</Label>
                    <Input
                      placeholder="e.g. Maria Santos"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mobile Number *</Label>
                    <Input
                      placeholder="e.g. 0917-123-4567"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Age</Label>
                    <Input
                      type="number"
                      min={10}
                      max={85}
                      value={age}
                      onChange={(e) => setAge(parseInt(e.target.value, 10) || 25)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Contact Name</Label>
                    <Input
                      placeholder="Next of kin"
                      value={emergencyName}
                      onChange={(e) => setEmergencyName(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Emergency Phone</Label>
                    <Input
                      placeholder="09xx-xxx-xxxx"
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                {/* Group Size Stepper */}
                <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-bold text-foreground">Group Size (Hikers)</Label>
                      <p className="text-[11px] text-muted-foreground">1 Tour Guide required per 1–8 hikers (₱800/guide)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setGroupSize((s) => Math.max(1, s - 1))}
                        className="h-8 w-8 p-0 rounded-lg"
                      >
                        -
                      </Button>
                      <span className="w-8 text-center font-bold text-sm text-foreground">{groupSize}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setGroupSize((s) => Math.min(50, s + 1))}
                        className="h-8 w-8 p-0 rounded-lg"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  {groupSize > 8 && (
                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-[11px] text-primary font-medium flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>{groupSize} hikers requires <strong>{fees.guidesNeeded} tour guides</strong> (₱{fees.guideFee.toLocaleString()}).</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Schedule & Guide Assignment */}
            <Card className="glass-card rounded-3xl border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-primary flex items-center gap-2 uppercase tracking-wide">
                  <Mountain className="h-4 w-4" /> 2. Schedule, Route &amp; Guide Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3.5">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Hike Date</Label>
                    <Input
                      type="date"
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Start Time</Label>
                    <Select value={hikeTime} onValueChange={setHikeTime}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HIKE_TIME_OPTIONS[hikeType].map((option) => (
                          <SelectItem key={option.time} value={option.time} className="text-xs">{option.time} ({option.label})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hike Type</Label>
                    <Select value={hikeType} onValueChange={(v: HikeType) => { setHikeType(v); setHikeTime(HIKE_TIME_OPTIONS[v].find((option) => option.recommended)?.time ?? HIKE_TIME_OPTIONS[v][0].time); }}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="morning" className="text-xs">☀️ Morning Hike</SelectItem>
                        <SelectItem value="night" className="text-xs">🌙 Night Hike</SelectItem>
                        <SelectItem value="overnight" className="text-xs">🌙 Overnight Hike</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Trail Route</Label>
                    <Select value={assignedRouteName} onValueChange={setAssignedRouteName}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Summit Trail (Main Peak)" className="text-xs">🏔️ Summit Trail (Main Peak - 622m)</SelectItem>
                        <SelectItem value="River Trail (Scenic Valley)" className="text-xs">🌊 River Trail (Scenic Valley)</SelectItem>
                        <SelectItem value="Ridge Trail (Panoramic Route)" className="text-xs">🌄 Ridge Trail (Panoramic Route)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Assign On-Duty Tour Guide *</Label>
                    <Select value={assignedGuideId} onValueChange={setAssignedGuideId}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="Select Tour Guide" />
                      </SelectTrigger>
                      <SelectContent>
                        {guides.map((g) => (
                          <SelectItem key={g.id} value={g.id} className="text-xs">
                            {g.full_name} ({g.phone || 'Available'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Add-On Services */}
                <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center justify-between">
                      <span>Peak Extension</span>
                      <span className="text-[10px] text-muted-foreground">₱100/hr</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={peakHours}
                        onChange={(e) => setPeakHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="text-xs h-8"
                      />
                      <span className="text-xs text-muted-foreground">hrs</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs flex items-center justify-between">
                      <span>Emergency Horse</span>
                      <span className="text-[10px] text-muted-foreground">₱500/horse</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        value={horseCount}
                        onChange={(e) => setHorseCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="text-xs h-8"
                      />
                      <span className="text-xs text-muted-foreground">qty</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Fee Collection & Confirm */}
          <div className="lg:col-span-5 space-y-5">
            <Card className="glass-card rounded-3xl border-border/40 shadow-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-primary flex items-center gap-2 uppercase tracking-wide">
                  <DollarSign className="h-4 w-4" /> 3. Fee Breakdown &amp; Cashier
                </CardTitle>
                <CardDescription className="text-xs">
                  Official tourism and municipal fees for Mount Kalisungan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Fee Breakdown List */}
                <div className="p-4 rounded-2xl bg-secondary/30 border border-border/30 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Registration Fee (₱{ENTRY_FEE_PER_PERSON} × {groupSize} pax)</span>
                    <span className="font-semibold text-foreground">{formatPeso(fees.entryFee)}</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Environmental Fee (₱{ENV_FEE_PER_PERSON} × {groupSize} pax)</span>
                    <span className="font-semibold text-foreground">{formatPeso(fees.envFee)}</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Tour Guide Fee ({fees.guidesNeeded} guide @ ₱{GUIDE_FEE_PER_GUIDE})</span>
                    <span className="font-semibold text-foreground">{formatPeso(fees.guideFee)}</span>
                  </div>
                  {fees.peakExtensionFee > 0 && (
                    <div className="flex justify-between items-center text-primary">
                      <span>Peak Stay Extension (+{peakHours}h @ ₱100/h)</span>
                      <span className="font-semibold">+{formatPeso(fees.peakExtensionFee)}</span>
                    </div>
                  )}
                  {fees.emergencyHorseFee > 0 && (
                    <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                      <span>Emergency Horse Service ({horseCount} @ ₱500)</span>
                      <span className="font-semibold">+{formatPeso(fees.emergencyHorseFee)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-border/30 flex justify-between items-center text-sm">
                    <span className="font-bold text-foreground">Total Fee Due:</span>
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                      {formatPeso(totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Payment Mode Selection */}
                <div className="space-y-2 pt-1">
                  <Label className="text-xs font-bold text-foreground">Payment Method Collected</Label>
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={(v: any) => setPaymentMethod(v)}
                    className="grid grid-cols-3 gap-2"
                  >
                    <div className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-all ${paymentMethod === 'cash' ? 'border-primary bg-primary/10' : 'border-border/30'}`}>
                      <RadioGroupItem value="cash" id="mode-cash" className="sr-only" />
                      <Label htmlFor="mode-cash" className="cursor-pointer text-center text-xs font-semibold">
                        💵 Cash Onsite
                      </Label>
                    </div>
                    <div className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-all ${paymentMethod === 'gcash' ? 'border-primary bg-primary/10' : 'border-border/30'}`}>
                      <RadioGroupItem value="gcash" id="mode-gcash" className="sr-only" />
                      <Label htmlFor="mode-gcash" className="cursor-pointer text-center text-xs font-semibold">
                        📱 GCash QR
                      </Label>
                    </div>
                    <div className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-all ${paymentMethod === 'onsite' ? 'border-primary bg-primary/10' : 'border-border/30'}`}>
                      <RadioGroupItem value="onsite" id="mode-onsite" className="sr-only" />
                      <Label htmlFor="mode-onsite" className="cursor-pointer text-center text-xs font-semibold">
                        🏦 Card / POS
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Cash Change Calculator */}
                {paymentMethod === 'cash' && (
                  <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/30 space-y-2">
                    <Label className="text-xs">Amount Tendered by Hiker (₱)</Label>
                    <Input
                      type="number"
                      placeholder={String(totalAmount)}
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      className="text-xs h-9 font-bold"
                    />
                    {tenderedNum > 0 && (
                      <div className="flex justify-between items-center text-xs pt-1">
                        <span className="text-muted-foreground">Change to Give:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatPeso(changeDue)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* GCash / Reference */}
                {paymentMethod !== 'cash' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Payment Reference / Transaction ID</Label>
                    <Input
                      placeholder="e.g. 100293848123"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                )}

                {/* Confirm & Register Button */}
                <Button
                  size="lg"
                  onClick={handleRegisterWalkIn}
                  disabled={submitting}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 rounded-2xl shadow-xl transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Registering &amp; Issuing Pass…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" />
                      Confirm Walk-In &amp; Issue QR Permit
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
